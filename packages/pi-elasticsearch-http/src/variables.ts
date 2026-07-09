import { EsHttpError } from "./errors.ts";
import type { ParsedHttpRequest, Variables } from "./types.ts";

const VARIABLE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const PROTECTED_HEADERS = new Set([
	"authorization",
	"proxy-authorization",
	"host",
	"content-length",
	"connection",
	"transfer-encoding",
]);

export function collectVariables(text: string): string[] {
	const names = new Set<string>();
	for (const match of text.matchAll(VARIABLE_RE)) names.add(match[1]);
	return [...names];
}

export function substituteRequest(req: ParsedHttpRequest, variables: Variables = {}): ParsedHttpRequest {
	const serialized = [
		req.target,
		...req.headers.flatMap((h) => [h.name, h.value]),
		req.body,
	].join("\n");
	const missing = collectVariables(serialized).filter((name) => !(name in variables));
	if (missing.length > 0) {
		throw new EsHttpError("VARIABLE_MISSING", `missing variable(s): ${missing.join(", ")}.`, {
			hint: "Pass all referenced variables in the tool call's `variables` object.",
		});
	}

	function replace(text: string): string {
		return text.replace(VARIABLE_RE, (_all, name: string) => String(variables[name]));
	}

	for (const header of req.headers) {
		if (containsVariable(header.name) || (isProtectedHeader(header.name) && containsVariable(header.value))) {
			throw new EsHttpError("FORBIDDEN_HEADER", `variable usage is forbidden in protected header '${header.name}'.`, {
				hint: "Do not pass Authorization/Host/Content-Length/etc through request variables. Configure auth in profile instead.",
			});
		}
	}

	return {
		...req,
		target: replace(req.target),
		headers: req.headers.map((h) => ({ name: replace(h.name), value: replace(h.value) })),
		body: replace(req.body),
	};
}

export function containsVariable(text: string): boolean {
	return VARIABLE_RE.test(text) ? (VARIABLE_RE.lastIndex = 0, true) : false;
}

export function isProtectedHeader(name: string): boolean {
	return PROTECTED_HEADERS.has(name.trim().toLowerCase());
}

export function assertNoProtectedHeaders(headers: Array<{ name: string; value: string }>): void {
	for (const header of headers) {
		if (isProtectedHeader(header.name)) {
			throw new EsHttpError("FORBIDDEN_HEADER", `request header '${header.name}' is managed by the extension and cannot be set.`, {
				hint: "Move authentication to the es-http profile and remove protected transport headers from the .http file/raw request.",
			});
		}
	}
}
