import { getAuthFilePath, getGlobalConfigPath, loadGlobalConfigForEdit } from "./config.ts";
import type { EsHttpGlobalConfig, EsHttpProfile } from "./types.ts";

/**
 * Sanitized view of an es-http profile. Never contains secrets from auth storage
 * (basic auth password, Authorization header value). Header names are exposed but
 * header values are omitted so a profile listing is safe to hand to an agent.
 */
export interface ProfileSummary {
	name: string;
	isDefault: boolean;
	baseUrl: string;
	authType: "none" | "basic" | "authorization";
	authUsername?: string;
	timeoutMs: number;
	headerNames: string[];
}

export interface ProfileListing {
	defaultProfile: string | undefined;
	profiles: ProfileSummary[];
	globalConfigPath: string;
	authFilePath: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Load global es-http config and return a sanitized listing suitable for humans and agents. */
export async function loadProfileListing(): Promise<ProfileListing> {
	const config = await loadGlobalConfigForEdit();
	return summarizeProfiles(config, getGlobalConfigPath(), getAuthFilePath());
}

export function summarizeProfiles(
	config: EsHttpGlobalConfig,
	globalConfigPath: string,
	authFilePath: string,
): ProfileListing {
	const names = Object.keys(config.profiles).sort();
	const profiles = names.map((name) => summarizeProfile(name, config.profiles[name]!, config.defaultProfile));
	return {
		defaultProfile: config.defaultProfile,
		profiles,
		globalConfigPath,
		authFilePath,
	};
}

function summarizeProfile(name: string, profile: EsHttpProfile, defaultProfile: string | undefined): ProfileSummary {
	return {
		name,
		isDefault: name === defaultProfile,
		baseUrl: profile.baseUrl,
		authType: profile.auth?.type ?? "none",
		authUsername: profile.auth?.type === "basic" ? profile.auth.username : undefined,
		timeoutMs: profile.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		headerNames: Object.keys(profile.headers ?? {}).sort(),
	};
}

/** Format a listing as human-readable text (used by /es-http list and es_http_profiles). */
export function formatProfileListing(listing: ProfileListing): string {
	if (listing.profiles.length === 0) {
		return `No es-http profiles configured. Run /es-http add <profile>. Config: ${listing.globalConfigPath}`;
	}
	const lines = [
		`es-http profiles (default: ${listing.defaultProfile ?? "(none)"})`,
		...listing.profiles.map(formatProfileLine),
	];
	return lines.join("\n");
}

function formatProfileLine(profile: ProfileSummary): string {
	const marker = profile.isDefault ? " *" : "";
	const authPart =
		profile.authType === "basic" && profile.authUsername
			? `basic (user=${profile.authUsername})`
			: profile.authType;
	const headers = profile.headerNames.length > 0 ? ` headers=[${profile.headerNames.join(", ")}]` : "";
	return `- ${profile.name}${marker}: ${profile.baseUrl} auth=${authPart} timeout=${profile.timeoutMs}ms${headers}`;
}
