import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { formatProfileListing, loadProfileListing } from "./profiles.ts";

export const EsHttpProfilesParameters = Type.Object({}, { additionalProperties: false });

export function registerEsHttpProfilesTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "es_http_profiles",
		label: "Elasticsearch HTTP profiles",
		description:
			"List sanitized Elasticsearch HTTP profiles configured via /es-http (default profile, profile names, base URLs, auth type, timeout, header names). " +
			"Never returns secrets: basic-auth passwords and Authorization header values stored under ~/.pi/agent/es-http/auth.json are omitted, " +
			"and profile header values are omitted (only header names are returned).",
		promptSnippet: "Inspect configured es_http profiles via es_http_profiles before choosing a profile.",
		promptGuidelines: [
			"Use es_http_profiles to discover which Elasticsearch profiles the user has configured before running es_http.",
			"Do not ask the user to paste profile secrets; profiles are configured via /es-http add and this tool exposes only sanitized metadata.",
		],
		parameters: EsHttpProfilesParameters,
		executionMode: "parallel",
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("es_http_profiles")), 0, 0);
		},
		async execute() {
			const listing = await loadProfileListing();
			const text = formatProfileListing(listing);
			return {
				content: [{ type: "text", text }],
				details: {
					defaultProfile: listing.defaultProfile,
					profiles: listing.profiles,
					globalConfigPath: listing.globalConfigPath,
					authFilePath: listing.authFilePath,
				},
			};
		},
	});
}
