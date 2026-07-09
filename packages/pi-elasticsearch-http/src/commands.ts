import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, loadGlobalConfigForEdit, saveGlobalConfig, getGlobalConfigPath, getAuthFilePath } from "./config.ts";
import { saveProfileSecret, removeProfileSecret } from "./auth.ts";
import { executeHttpRequest } from "./executor.ts";
import { prepareRequest } from "./request.ts";
import type { EsHttpProfile, ParsedHttpRequest } from "./types.ts";

export function registerEsHttpCommand(pi: ExtensionAPI): void {
	pi.registerCommand("es-http", {
		description: "Manage Elasticsearch HTTP profiles: add/list/default/remove/test",
		getArgumentCompletions(prefix) {
			return ["add", "list", "default", "remove", "test"]
				.filter((value) => value.startsWith(prefix.trim()))
				.map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const [subcommand, profileName] = args.trim().split(/\s+/, 2);
			switch (subcommand) {
				case "add":
					await addProfile(ctx, profileName);
					return;
				case "list":
					await listProfiles(ctx);
					return;
				case "default":
					await setDefault(ctx, profileName);
					return;
				case "remove":
					await removeProfile(ctx, profileName);
					return;
				case "test":
					await testProfile(ctx, profileName);
					return;
				default:
					ctx.ui.notify("Usage: /es-http add <profile> | list | default <profile> | remove <profile> | test <profile>", "info");
			}
		},
	});
}

async function addProfile(ctx: ExtensionCommandContext, nameArg?: string): Promise<void> {
	const name = nameArg || (await ctx.ui.input("Profile name", "dev"));
	if (!name) return;
	const baseUrl = await ctx.ui.input("Elasticsearch base URL", "https://es-dev.internal:9200");
	if (!baseUrl) return;
	const authType = await ctx.ui.select("Auth type", ["none", "basic", "authorization"]);
	if (!authType) return;

	const profile: EsHttpProfile = { baseUrl, headers: { Accept: "application/json" } };
	let secret: string | undefined;
	if (authType === "basic") {
		const username = await ctx.ui.input("Basic auth username", "operator");
		if (!username) return;
		ctx.ui.notify("Pi ui.input currently has no masked/password option; the secret will not be logged or displayed after entry.", "warning");
		secret = await ctx.ui.input("Basic auth password", "password");
		if (!secret) return;
		profile.auth = { type: "basic", username, credential: `profile:${name}` };
	} else if (authType === "authorization") {
		ctx.ui.notify("Pi ui.input currently has no masked/password option; the Authorization value will not be logged or displayed after entry.", "warning");
		secret = await ctx.ui.input("Authorization header value", "Bearer ...");
		if (!secret) return;
		profile.auth = { type: "authorization", credential: `profile:${name}` };
	}

	const timeoutText = await ctx.ui.input("Timeout ms", "30000");
	profile.timeoutMs = Number(timeoutText || "30000");

	const config = await loadGlobalConfigForEdit();
	config.profiles[name] = profile;
	config.defaultProfile ??= name;
	await saveGlobalConfig(config);
	if (profile.auth && secret) await saveProfileSecret(name, profile.auth, secret);
	ctx.ui.notify(`Saved es-http profile '${name}'. Config: ${getGlobalConfigPath()} Auth: ${getAuthFilePath()}`, "info");
}

async function listProfiles(ctx: ExtensionCommandContext): Promise<void> {
	const config = await loadGlobalConfigForEdit();
	const names = Object.keys(config.profiles).sort();
	if (names.length === 0) {
		ctx.ui.notify(`No es-http profiles configured. Run /es-http add <profile>. Config: ${getGlobalConfigPath()}`, "info");
		return;
	}
	ctx.ui.notify(
		[
			`es-http profiles (default: ${config.defaultProfile ?? "(none)"})`,
			...names.map((name) => {
				const p = config.profiles[name];
				return `- ${name}${name === config.defaultProfile ? " *" : ""}: ${p.baseUrl} auth=${p.auth?.type ?? "none"} timeout=${p.timeoutMs ?? 30000}ms`;
			}),
		].join("\n"),
		"info",
	);
}

async function setDefault(ctx: ExtensionCommandContext, name?: string): Promise<void> {
	if (!name) {
		ctx.ui.notify("Usage: /es-http default <profile>", "error");
		return;
	}
	const config = await loadGlobalConfigForEdit();
	if (!config.profiles[name]) {
		ctx.ui.notify(`Profile '${name}' does not exist.`, "error");
		return;
	}
	config.defaultProfile = name;
	await saveGlobalConfig(config);
	ctx.ui.notify(`Default es-http profile set to '${name}'.`, "info");
}

async function removeProfile(ctx: ExtensionCommandContext, name?: string): Promise<void> {
	if (!name) {
		ctx.ui.notify("Usage: /es-http remove <profile>", "error");
		return;
	}
	const config = await loadGlobalConfigForEdit();
	const profile = config.profiles[name];
	if (!profile) {
		ctx.ui.notify(`Profile '${name}' does not exist.`, "error");
		return;
	}
	const ok = await ctx.ui.confirm("Remove es-http profile", `Remove profile '${name}' and its extension auth secret?`);
	if (!ok) return;
	delete config.profiles[name];
	if (config.defaultProfile === name) config.defaultProfile = Object.keys(config.profiles)[0];
	await saveGlobalConfig(config);
	await removeProfileSecret(name, profile.auth);
	ctx.ui.notify(`Removed es-http profile '${name}'.`, "info");
}

async function testProfile(ctx: ExtensionCommandContext, name?: string): Promise<void> {
	if (!name) {
		ctx.ui.notify("Usage: /es-http test <profile>", "error");
		return;
	}
	const config = await loadConfig(ctx.cwd, name);
	const req: ParsedHttpRequest = { method: "GET", target: "/", headers: [], body: "", startLine: 1 };
	const prepared = prepareRequest(req, config.profile);
	const result = await executeHttpRequest(prepared, config.profile, ctx.signal);
	let version = "unknown";
	try {
		const body = JSON.parse(result.bodyText) as { version?: { number?: string } };
		version = body.version?.number ?? "unknown";
	} catch {
		// ignore
	}
	const warning = version !== "unknown" && !version.startsWith("6.") ? "\nWarning: primary compatibility target is Elasticsearch 6.x." : "";
	ctx.ui.notify(`GET / -> HTTP ${result.status}. Elasticsearch version: ${version}.${warning}`, result.status >= 200 && result.status < 300 ? "info" : "warning");
}
