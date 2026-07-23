import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { OcrError } from "./errors.ts";
import type { CommandBackendConfig, OcrBackendConfig, OcrConfig, RapidOcrBackendConfig } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

export function getOcrDir(): string {
	return join(getAgentDir(), "ocr");
}

export function getConfigPath(): string {
	return join(getOcrDir(), "config.json");
}

export function getManagedVenvDir(): string {
	return join(getOcrDir(), "python");
}

export function createDefaultConfig(): OcrConfig {
	return {
		backend: "rapidocr",
		timeoutMs: DEFAULT_TIMEOUT_MS,
		backends: {
			rapidocr: {
				type: "rapidocr",
				model: "tiny",
				threads: 2,
				maxImageSide: 1600,
				idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
			},
		},
	};
}

export async function loadConfig(): Promise<OcrConfig> {
	const raw = await readJsonIfExists(getConfigPath());
	if (raw === undefined) return createDefaultConfig();
	if (!isRecord(raw)) throw configError("configuration root must be an object");

	const defaults = createDefaultConfig();
	const backend = stringValue(raw.backend, "backend", defaults.backend);
	const timeoutMs = positiveNumber(raw.timeoutMs, "timeoutMs", defaults.timeoutMs);
	const configuredBackends = raw.backends === undefined ? {} : raw.backends;
	if (!isRecord(configuredBackends)) throw configError("backends must be an object");

	const backends: Record<string, OcrBackendConfig> = { ...defaults.backends };
	for (const [id, value] of Object.entries(configuredBackends)) {
		backends[id] = parseBackend(id, value, defaults.backends.rapidocr as RapidOcrBackendConfig);
	}
	if (!backends[backend]) throw configError(`selected backend '${backend}' is not configured`);
	return { backend, timeoutMs, backends };
}

export async function saveConfig(config: OcrConfig): Promise<void> {
	await mkdir(dirname(getConfigPath()), { recursive: true, mode: 0o700 });
	const target = getConfigPath();
	const temporary = `${target}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
	await rename(temporary, target);
}

export async function ensureConfigFile(): Promise<OcrConfig> {
	const existing = await readJsonIfExists(getConfigPath());
	if (existing !== undefined) return loadConfig();
	const config = createDefaultConfig();
	await saveConfig(config);
	return config;
}

function parseBackend(id: string, value: unknown, defaults: RapidOcrBackendConfig): OcrBackendConfig {
	if (!isRecord(value)) throw configError(`backend '${id}' must be an object`);
	const type = stringValue(value.type, `backends.${id}.type`);
	const idleTimeoutMs = nonNegativeNumber(value.idleTimeoutMs, `backends.${id}.idleTimeoutMs`, DEFAULT_IDLE_TIMEOUT_MS);
	if (type === "command") {
		return {
			type,
			command: stringValue(value.command, `backends.${id}.command`),
			args: stringArray(value.args, `backends.${id}.args`, []),
			env: stringRecord(value.env, `backends.${id}.env`, {}),
			idleTimeoutMs,
		} satisfies CommandBackendConfig;
	}
	if (type === "rapidocr") {
		const model = stringValue(value.model, `backends.${id}.model`, defaults.model);
		if (model !== "tiny" && model !== "small") throw configError(`backends.${id}.model must be 'tiny' or 'small'`);
		const pythonPath = optionalString(value.pythonPath, `backends.${id}.pythonPath`);
		if (pythonPath && !isAbsolute(pythonPath)) throw configError(`backends.${id}.pythonPath must be absolute`);
		return {
			type,
			...(pythonPath ? { pythonPath } : {}),
			model,
			threads: positiveInteger(value.threads, `backends.${id}.threads`, defaults.threads),
			maxImageSide: positiveInteger(value.maxImageSide, `backends.${id}.maxImageSide`, defaults.maxImageSide),
			idleTimeoutMs,
		};
	}
	throw configError(`backend '${id}' has unsupported type '${type}'`);
}

async function readJsonIfExists(path: string): Promise<unknown | undefined> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as unknown;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		if (error instanceof SyntaxError) throw configError(`invalid JSON in ${path}`, error);
		throw error;
	}
}

function stringValue(value: unknown, path: string, fallback?: string): string {
	if (value === undefined && fallback !== undefined) return fallback;
	if (typeof value !== "string" || value.length === 0) throw configError(`${path} must be a non-empty string`);
	return value;
}

function optionalString(value: unknown, path: string): string | undefined {
	if (value === undefined) return undefined;
	return stringValue(value, path);
}

function stringArray(value: unknown, path: string, fallback: string[]): string[] {
	if (value === undefined) return fallback;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw configError(`${path} must be an array of strings`);
	return [...value];
}

function stringRecord(value: unknown, path: string, fallback: Record<string, string>): Record<string, string> {
	if (value === undefined) return fallback;
	if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) throw configError(`${path} must contain only string values`);
	return { ...value } as Record<string, string>;
}

function positiveInteger(value: unknown, path: string, fallback: number): number {
	const result = positiveNumber(value, path, fallback);
	if (!Number.isInteger(result)) throw configError(`${path} must be an integer`);
	return result;
}

function positiveNumber(value: unknown, path: string, fallback: number): number {
	if (value === undefined) return fallback;
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw configError(`${path} must be a positive number`);
	return value;
}

function nonNegativeNumber(value: unknown, path: string, fallback: number): number {
	if (value === undefined) return fallback;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw configError(`${path} must be a non-negative number`);
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function configError(message: string, cause?: unknown): OcrError {
	return new OcrError("CONFIG_ERROR", `Invalid OCR config: ${message}.`, {
		cause,
		hint: `Edit ${getConfigPath()} or remove it and run /ocr-setup to recreate the defaults.`,
	});
}
