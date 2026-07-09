import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getAuthFilePath } from "./config.ts";
import { EsHttpError } from "./errors.ts";
import type { EsHttpProfileAuth, ResolvedProfile } from "./types.ts";

interface AuthFile {
	credentials?: Record<string, { password?: string; value?: string }>;
}

export interface ResolvedAuthHeader {
	name: "Authorization";
	value: string;
	secret: string;
}

export async function resolveAuthHeader(profile: ResolvedProfile): Promise<ResolvedAuthHeader | undefined> {
	const auth = profile.auth;
	if (!auth) return undefined;
	const credentialKey = auth.credential ?? `profile:${profile.name}`;

	if (auth.type === "basic") {
		const password = (auth.passwordEnv ? process.env[auth.passwordEnv] : undefined) ?? (await readSecret(credentialKey, "password"));
		if (!password) {
			throw new EsHttpError("AUTH_MISSING", `missing password for profile '${profile.name}'.`, {
				hint: auth.passwordEnv
					? `Set ${auth.passwordEnv} or run /es-http add ${profile.name} again.`
					: `Run /es-http add ${profile.name} or set auth.credential in ${getAuthFilePath()}.`,
			});
		}
		const token = Buffer.from(`${auth.username}:${password}`, "utf8").toString("base64");
		return { name: "Authorization", value: `Basic ${token}`, secret: password };
	}

	const value = (auth.valueEnv ? process.env[auth.valueEnv] : undefined) ?? (await readSecret(credentialKey, "value"));
	if (!value) {
		throw new EsHttpError("AUTH_MISSING", `missing Authorization value for profile '${profile.name}'.`, {
			hint: auth.valueEnv
				? `Set ${auth.valueEnv} or run /es-http add ${profile.name} again.`
				: `Run /es-http add ${profile.name} or set auth.credential in ${getAuthFilePath()}.`,
		});
	}
	return { name: "Authorization", value, secret: value };
}

export async function saveProfileSecret(profileName: string, auth: EsHttpProfileAuth, secret: string): Promise<void> {
	const credentialKey = auth.credential ?? `profile:${profileName}`;
	const file = await readAuthFile();
	file.credentials ??= {};
	file.credentials[credentialKey] = auth.type === "basic" ? { password: secret } : { value: secret };
	await writeAuthFile(file);
}

export async function removeProfileSecret(profileName: string, auth?: EsHttpProfileAuth): Promise<void> {
	const credentialKey = auth?.credential ?? `profile:${profileName}`;
	const file = await readAuthFile();
	if (file.credentials) delete file.credentials[credentialKey];
	await writeAuthFile(file);
}

async function readSecret(credentialKey: string, field: "password" | "value"): Promise<string | undefined> {
	const file = await readAuthFile();
	const entry = file.credentials?.[credentialKey];
	const value = entry?.[field];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function readAuthFile(): Promise<AuthFile> {
	try {
		const text = await readFile(getAuthFilePath(), "utf8");
		const parsed = JSON.parse(text) as AuthFile;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return {};
		if (error instanceof SyntaxError) {
			throw new EsHttpError("CONFIG_ERROR", `invalid JSON in ${getAuthFilePath()}.`, {
				hint: "Do not hand-edit auth.json; delete it and re-run /es-http add if needed.",
				cause: error,
			});
		}
		throw error;
	}
}

async function writeAuthFile(file: AuthFile): Promise<void> {
	const path = getAuthFilePath();
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await chmod(dirname(path), 0o700).catch(() => undefined);
	await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
	await chmod(path, 0o600).catch(() => undefined);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
