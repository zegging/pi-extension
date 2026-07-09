import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { EsHttpError } from "./errors.ts";
import type { EsHttpGlobalConfig, EsHttpProjectConfig, LoadedConfig, ResolvedProfile } from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_CONTEXT_MAX_BYTES = 51_200;
export const DEFAULT_CONTEXT_MAX_LINES = 2_000;
export const CONTEXT_MAX_BYTES_HARD_LIMIT = 204_800;

export function getAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

export function getEsHttpDir(): string {
	return join(getAgentDir(), "es-http");
}

export function getGlobalConfigPath(): string {
	return join(getEsHttpDir(), "config.json");
}

export function getAuthFilePath(): string {
	return join(getEsHttpDir(), "auth.json");
}

export function getProjectConfigPath(cwd: string): string {
	return join(cwd, ".pi", "es-http.json");
}

export async function ensureConfigDir(): Promise<void> {
	await mkdir(getEsHttpDir(), { recursive: true, mode: 0o700 });
}

export async function loadConfig(cwd: string, requestedProfile?: string): Promise<LoadedConfig> {
	const globalConfigPath = getGlobalConfigPath();
	const authFile = getAuthFilePath();
	const projectConfigPath = getProjectConfigPath(cwd);
	const global = await readJsonIfExists<EsHttpGlobalConfig>(globalConfigPath, { profiles: {} });
	const project = await readJsonIfExists<EsHttpProjectConfig | undefined>(projectConfigPath, undefined);
	validateGlobalConfig(global, globalConfigPath);
	validateProjectConfig(project, projectConfigPath);

	const profileName = requestedProfile ?? project?.defaultProfile ?? global.defaultProfile;
	if (!profileName) {
		throw new EsHttpError("CONFIG_ERROR", "no profile specified and no defaultProfile configured.", {
			hint: `Run /es-http add <profile>, /es-http default <profile>, or create ${globalConfigPath}.`,
		});
	}
	const rawProfile = global.profiles[profileName];
	if (!rawProfile) {
		throw new EsHttpError("CONFIG_ERROR", `profile '${profileName}' not found.`, {
			hint: `Available profiles: ${Object.keys(global.profiles).join(", ") || "(none)"}.`,
		});
	}

	let baseUrl: URL;
	try {
		baseUrl = new URL(rawProfile.baseUrl);
	} catch (cause) {
		throw new EsHttpError("CONFIG_ERROR", `profile '${profileName}' has invalid baseUrl.`, { cause });
	}
	if (!["http:", "https:"].includes(baseUrl.protocol) || !baseUrl.hostname) {
		throw new EsHttpError("CONFIG_ERROR", `profile '${profileName}' baseUrl must include http(s) scheme and host.`);
	}
	if (baseUrl.username || baseUrl.password || baseUrl.hash) {
		throw new EsHttpError("CONFIG_ERROR", `profile '${profileName}' baseUrl must not contain username, password, or fragment.`);
	}

	const timeoutMs = rawProfile.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new EsHttpError("CONFIG_ERROR", `profile '${profileName}' timeoutMs must be a positive number.`);
	}

	const profile: ResolvedProfile = {
		name: profileName,
		baseUrl,
		timeoutMs,
		headers: rawProfile.headers ?? {},
		auth: rawProfile.auth,
	};

	const contextMaxBytes = Math.min(
		Math.max(0, global.contextMaxBytes ?? DEFAULT_CONTEXT_MAX_BYTES),
		CONTEXT_MAX_BYTES_HARD_LIMIT,
	);
	const contextMaxLines = Math.max(0, global.contextMaxLines ?? DEFAULT_CONTEXT_MAX_LINES);

	return {
		global,
		project,
		profile,
		contextMaxBytes,
		contextMaxLines,
		paths: { globalConfig: globalConfigPath, authFile, projectConfig: projectConfigPath },
	};
}

export async function saveGlobalConfig(config: EsHttpGlobalConfig): Promise<void> {
	await ensureConfigDir();
	await writeFile(getGlobalConfigPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function loadGlobalConfigForEdit(): Promise<EsHttpGlobalConfig> {
	const config = await readJsonIfExists<EsHttpGlobalConfig>(getGlobalConfigPath(), { profiles: {} });
	validateGlobalConfig(config, getGlobalConfigPath());
	return config;
}

async function readJsonIfExists<T>(path: string, fallback: T): Promise<T> {
	try {
		const text = await readFile(path, "utf8");
		return JSON.parse(text) as T;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return fallback;
		if (error instanceof SyntaxError) {
			throw new EsHttpError("CONFIG_ERROR", `invalid JSON in ${path}.`, { cause: error });
		}
		throw error;
	}
}

function validateGlobalConfig(value: EsHttpGlobalConfig, path: string): void {
	if (!value || typeof value !== "object" || !value.profiles || typeof value.profiles !== "object") {
		throw new EsHttpError("CONFIG_ERROR", `invalid global config ${path}: expected object with profiles.`);
	}
}

function validateProjectConfig(value: EsHttpProjectConfig | undefined, path: string): void {
	if (value === undefined) return;
	const keys = Object.keys(value);
	const forbidden = keys.filter((k) => k !== "defaultProfile");
	if (forbidden.length > 0) {
		throw new EsHttpError("CONFIG_ERROR", `project config ${path} may only contain defaultProfile.`, {
			hint: `Remove unsupported key(s): ${forbidden.join(", ")}.`,
		});
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

export function resolveWorkspacePath(cwd: string, file: string): string {
	return resolve(cwd, file);
}
