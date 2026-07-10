import type { AgentToolResult, ExtensionAPI, ExtensionContext, Theme, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, Text, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { classifyRisk } from "./classifier.ts";
import { loadConfig } from "./config.ts";
import { EsHttpError, redactSecrets } from "./errors.ts";
import { executeHttpRequest, maybeWriteFullOutput, enqueueEsHttp } from "./executor.ts";
import { readWorkspaceHttpFile } from "./files.ts";
import { parseHttpDocument, listRequestNames } from "./parser.ts";
import { prepareRequest } from "./request.ts";
import { formatResponseForContext } from "./response.ts";
import type { EsHttpInput, LoadedConfig, ParsedHttpRequest, PreparedHttpRequest, RiskClassification, Variables } from "./types.ts";
import { isProtectedHeader, substituteRequest } from "./variables.ts";

const VariableValue = Type.Union([Type.String(), Type.Number(), Type.Boolean()]);
const VariablesSchema = Type.Optional(Type.Record(Type.String(), VariableValue));

export const EsHttpParameters = Type.Union([
	Type.Object(
		{
			profile: Type.Optional(Type.String({ description: "Profile name from ~/.pi/agent/es-http/config.json" })),
			file: Type.String({ description: "Workspace-relative .http/.rest file path" }),
			name: Type.String({ description: "# @name request to execute" }),
			variables: VariablesSchema,
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			profile: Type.Optional(Type.String()),
			file: Type.String({ description: "Workspace-relative .http/.rest file path" }),
			all: Type.Literal(true, { description: "Execute all requests in the file sequentially" }),
			variables: VariablesSchema,
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			profile: Type.Optional(Type.String()),
			raw: Type.String({ description: "Raw HTTP text containing exactly one request" }),
			variables: VariablesSchema,
		},
		{ additionalProperties: false },
	),
]);

export function registerEsHttpTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "es_http",
		label: "Elasticsearch HTTP",
		description:
			"Execute safe, reproducible Elasticsearch HTTP requests from workspace .http/.rest files or one raw HTTP request. " +
			"Only the selected profile origin is allowed. Authorization/Host/Content-Length/etc headers are forbidden in requests. " +
			"Responses are shown with head truncation (default 50KiB/2000 lines, configurable up to 200KiB) and full raw output is saved to a temp file when truncated.",
		promptSnippet: "Run named Elasticsearch HTTP requests from .http/.rest files via es_http.",
		promptGuidelines: [
			"Use es_http when the user asks to execute a version-controlled Elasticsearch .http/.rest request or provides one raw HTTP request.",
			"Do not put credentials in es_http arguments. Use /es-http profiles for authentication.",
			"Prefer file+name over raw requests so Elasticsearch operations are reviewable and reproducible.",
		],
		parameters: EsHttpParameters,
		executionMode: "sequential",
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold(`es_http ${formatCallArgs(args as EsHttpInput)}`)), 0, 0);
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatEsHttpResultForDisplay(result, options, theme, context.isError));
			return text;
		},
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return enqueueEsHttp(signal, async () => {
				const input = params as EsHttpInput;
				const result = await runEsHttp(input, ctx, signal);
				return { content: [{ type: "text", text: result }], details: {} };
			});
		},
	});
}

async function runEsHttp(input: EsHttpInput, ctx: ExtensionContext, signal: AbortSignal | undefined): Promise<string> {
	const config = await loadConfig(ctx.cwd, input.profile);
	const parsed = await resolveRequests(input, ctx.cwd);
	const selected = selectRequests(input, parsed);
	const prepared = selected.map((req) => prepareRequest(substituteRequest(req, input.variables), config.profile));
	const plan = prepared.map((req) => ({ req, risk: classifyRisk(req) }));

	if ("all" in input && input.all) {
		ctx.ui.notify(formatBatchPlan(config.profile.name, plan), "info");
	}

	const completed: string[] = [];
	for (let i = 0; i < plan.length; i++) {
		const { req, risk } = plan[i];
		await confirmIfNeeded(ctx, config, req, risk);
		const result = await executeHttpRequest(req, config.profile, signal);
		const withTemp = await maybeWriteFullOutput(result, config.contextMaxBytes, config.contextMaxLines);
		const formatted = formatResponseForContext(withTemp, { maxBytes: config.contextMaxBytes, maxLines: config.contextMaxLines });
		const label = req.name ?? `request ${i + 1}`;
		if (withTemp.status < 200 || withTemp.status >= 300) {
			const unexecuted = plan.slice(i + 1).map((p) => p.req.name ?? `${p.req.method} ${p.req.url.pathname}`);
			throw new EsHttpError(
				"HTTP_ERROR",
				`Elasticsearch returned HTTP ${withTemp.status} for ${label}. Already completed: ${completed.join(", ") || "(none)"}. Unexecuted: ${unexecuted.join(", ") || "(none)"}.\n\n${formatted}`,
				{ sent: true, status: withTemp.status },
			);
		}
		completed.push(label);
		if (plan.length === 1) return formatted;
	}

	return `Batch completed (${completed.length}/${plan.length}):\n${completed.map((name) => `- ${name}`).join("\n")}`;
}

async function resolveRequests(input: EsHttpInput, cwd: string): Promise<ParsedHttpRequest[]> {
	if ("raw" in input) return parseHttpDocument(input.raw, { raw: true });
	const file = await readWorkspaceHttpFile(cwd, input.file);
	return parseHttpDocument(file.text);
}

function selectRequests(input: EsHttpInput, requests: ParsedHttpRequest[]): ParsedHttpRequest[] {
	if ("raw" in input) return requests;
	if ("all" in input && input.all) return requests;
	if (!("name" in input)) {
		throw new EsHttpError("PARSE_ERROR", "file input must specify either `name` or `all: true`.");
	}
	const target = requests.find((req) => req.name === input.name);
	if (!target) {
		throw new EsHttpError("REQUEST_NOT_FOUND", `request name '${input.name}' not found.`, {
			hint: `Available requests: ${listRequestNames(requests).join(", ")}.`,
		});
	}
	return [target];
}

async function confirmIfNeeded(
	ctx: ExtensionContext,
	config: LoadedConfig,
	req: PreparedHttpRequest,
	risk: RiskClassification,
): Promise<void> {
	if (!risk.requiresConfirmation) return;
	if (!ctx.hasUI) {
		throw new EsHttpError("CONFIRMATION_REQUIRED", `${risk.level} request requires interactive confirmation in ${ctx.mode} mode.`, {
			hint: "Run in an interactive Pi session, or change the request to a read-only operation.",
		});
	}
	const ok = await showDangerousRequestConfirm(ctx, config, req, risk);
	if (!ok) {
		throw new EsHttpError("USER_REJECTED", "user rejected Elasticsearch HTTP request before it was sent.", { sent: false });
	}
}

function previewBody(body: string): string {
	if (!body) return "";
	const bytes = Buffer.from(body, "utf8");
	if (bytes.byteLength <= 2000) return body;
	return `${bytes.subarray(0, 2000).toString("utf8")}\n[body preview truncated: ${bytes.byteLength} bytes total]`;
}

async function showDangerousRequestConfirm(
	ctx: ExtensionContext,
	config: LoadedConfig,
	req: PreparedHttpRequest,
	risk: RiskClassification,
): Promise<boolean> {
	return ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
		let selected: "Yes" | "No" = "No";
		const render = (width: number): string[] => {
			const lines = buildConfirmLines(theme, config, req, risk, selected);
			return frameConfirmLines(theme, lines, Math.max(1, width));
		};
		return {
			render,
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || data === "j" || data === "k") {
					selected = selected === "Yes" ? "No" : "Yes";
					tui.requestRender();
					return;
				}
				if (matchesKey(data, Key.enter) || data === "\n") {
					done(selected === "Yes");
					return;
				}
				if (matchesKey(data, Key.escape)) done(false);
			},
		};
	});
}

function buildConfirmLines(
	theme: Theme,
	config: LoadedConfig,
	req: PreparedHttpRequest,
	risk: RiskClassification,
	selected: "Yes" | "No",
): string[] {
	const lines = [
		theme.fg("warning", theme.bold("Confirm Elasticsearch HTTP request")),
		"",
		theme.fg("error", "This Elasticsearch request may permanently modify or delete data."),
		theme.fg("error", "Review the exact HTTP request below before approving."),
		"",
		theme.fg("accent", `Profile: ${config.profile.name}`),
		theme.fg("accent", `Risk: ${risk.level} — ${risk.reason}`),
		...(risk.highlight?.map((h) => theme.fg("accent", `Highlight: ${h}`)) ?? []),
		"",
		theme.fg("accent", "HTTP request preview (Authorization omitted):"),
		"",
		...formatHttpRequestPreviewLines(req, theme),
		"",
		optionLine("Yes", selected, theme),
		optionLine("No", selected, theme),
	];
	return lines;
}

function optionLine(value: "Yes" | "No", selected: "Yes" | "No", theme: Theme): string {
	return selected === value ? theme.fg("accent", `→ ${value}`) : `  ${theme.fg("text", value)}`;
}

export function frameConfirmLines(theme: Theme, lines: string[], width: number): string[] {
	const border = theme.fg("border", "─".repeat(width));
	const contentWidth = Math.max(1, width - 2);
	const wrapped = lines.flatMap((line) => {
		if (line === "") return [""];
		const pieces = wrapTextWithAnsi(line, contentWidth);
		return pieces.length > 0 ? pieces : [""];
	});
	return [
		border,
		"",
		...wrapped.map((line) => ` ${line}`),
		"",
		border,
	];
}

function formatHttpRequestPreviewLines(req: PreparedHttpRequest, theme: Theme): string[] {
	const headers = Object.entries(req.headersMap)
		.filter(([name]) => !isProtectedHeader(name))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, value]) => `${name}: ${value}`);
	const body = previewBody(req.body);
	return redactLines([`${req.method} ${req.url.toString()}`, ...headers, ...(body ? ["", body] : [])]).map((line) => theme.fg("accent", line));
}

function redactLines(lines: string[]): string[] {
	return redactSecrets(lines.join("\n"), []).split("\n");
}

export function formatEsHttpResultForDisplay(
	result: AgentToolResult<unknown>,
	options: Pick<ToolRenderResultOptions, "expanded">,
	theme: Theme,
	isError = false,
): string {
	const output = getTextContent(result);
	if (options.expanded || isError) {
		return output ? `\n${output.split("\n").map((line) => theme.fg("toolOutput", line)).join("\n")}` : "";
	}
	const lines = output.split("\n");
	const statusLine = lines.find((line) => line.trim().length > 0) ?? "es_http completed";
	const truncationLine = [...lines].reverse().find((line) => line.startsWith("[Response truncated:"));
	const hiddenLine = theme.fg("muted", "[es_http response hidden. Press ctrl+o to expand]");
	return [
		"",
		theme.fg("toolOutput", statusLine),
		...(truncationLine ? [theme.fg("warning", truncationLine)] : []),
		hiddenLine,
	].join("\n");
}

function getTextContent(result: AgentToolResult<unknown>): string {
	return result.content
		.flatMap((item) => (item.type === "text" ? item.text.split("\n") : [`[${item.type} content omitted]`]))
		.join("\n");
}

function formatCallArgs(input: EsHttpInput): string {
	const profile = input.profile ? `profile=${input.profile} ` : "";
	if ("raw" in input) {
		return `${profile}raw=${JSON.stringify(previewInline(input.raw))}`;
	}
	if ("all" in input && input.all) {
		return `${profile}file=${JSON.stringify(input.file)} all=true`;
	}
	if (!("name" in input)) return `${profile}file=${JSON.stringify(input.file)}`;
	return `${profile}file=${JSON.stringify(input.file)} name=${JSON.stringify(input.name)}`;
}

function previewInline(text: string): string {
	const oneLine = text.replace(/\s+/g, " ").trim();
	return oneLine.length <= 240 ? oneLine : `${oneLine.slice(0, 240)}…`;
}

function formatBatchPlan(profile: string, plan: Array<{ req: PreparedHttpRequest; risk: RiskClassification }>): string {
	return [
		`es_http batch plan (${plan.length} request(s), profile ${profile}):`,
		...plan.map(({ req, risk }, i) => `${i + 1}. ${req.name ?? "(unnamed)"} — ${req.method} ${req.url.toString()} — ${risk.level}`),
	].join("\n");
}
