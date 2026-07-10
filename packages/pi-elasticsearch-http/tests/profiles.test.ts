import { describe, expect, it } from "vitest";
import { formatProfileListing, summarizeProfiles } from "../src/profiles.ts";
import type { EsHttpGlobalConfig } from "../src/types.ts";

function fixtureConfig(): EsHttpGlobalConfig {
	return {
		defaultProfile: "prod",
		profiles: {
			prod: {
				baseUrl: "https://es-prod.internal:9200",
				timeoutMs: 15000,
				headers: { Accept: "application/json", "X-Trace": "on" },
				auth: { type: "basic", username: "operator", credential: "profile:prod" },
			},
			dev: {
				baseUrl: "https://es-dev.internal:9200",
				auth: { type: "authorization", credential: "profile:dev" },
			},
			local: {
				baseUrl: "http://127.0.0.1:9200",
			},
		},
	};
}

describe("summarizeProfiles", () => {
	it("emits sanitized entries with sorted names and header names only", () => {
		const listing = summarizeProfiles(fixtureConfig(), "/tmp/config.json", "/tmp/auth.json");
		expect(listing.defaultProfile).toBe("prod");
		expect(listing.profiles.map((p) => p.name)).toEqual(["dev", "local", "prod"]);
		const prod = listing.profiles.find((p) => p.name === "prod")!;
		expect(prod.isDefault).toBe(true);
		expect(prod.authType).toBe("basic");
		expect(prod.authUsername).toBe("operator");
		expect(prod.timeoutMs).toBe(15000);
		expect(prod.headerNames).toEqual(["Accept", "X-Trace"]);
	});

	it("omits header values and auth credentials from the summary", () => {
		const listing = summarizeProfiles(fixtureConfig(), "/tmp/config.json", "/tmp/auth.json");
		const serialized = JSON.stringify(listing);
		expect(serialized).not.toContain("profile:prod");
		expect(serialized).not.toContain("profile:dev");
		// Header names appear but header values must not.
		expect(serialized).toContain("X-Trace");
		expect(serialized).not.toContain('"on"');
	});

	it("defaults timeoutMs to 30000 and authType to none when unset", () => {
		const listing = summarizeProfiles(fixtureConfig(), "/tmp/config.json", "/tmp/auth.json");
		const local = listing.profiles.find((p) => p.name === "local")!;
		expect(local.authType).toBe("none");
		expect(local.timeoutMs).toBe(30000);
		expect(local.headerNames).toEqual([]);
		expect(local.authUsername).toBeUndefined();
	});
});

describe("formatProfileListing", () => {
	it("renders a stable multi-line summary with a default marker", () => {
		const listing = summarizeProfiles(fixtureConfig(), "/tmp/config.json", "/tmp/auth.json");
		const text = formatProfileListing(listing);
		expect(text.split("\n")).toEqual([
			"es-http profiles (default: prod)",
			"- dev: https://es-dev.internal:9200 auth=authorization timeout=30000ms",
			"- local: http://127.0.0.1:9200 auth=none timeout=30000ms",
			"- prod *: https://es-prod.internal:9200 auth=basic (user=operator) timeout=15000ms headers=[Accept, X-Trace]",
		]);
	});

	it("returns a discovery hint when no profiles are configured", () => {
		const empty = summarizeProfiles({ profiles: {} }, "/tmp/config.json", "/tmp/auth.json");
		const text = formatProfileListing(empty);
		expect(text).toBe("No es-http profiles configured. Run /es-http add <profile>. Config: /tmp/config.json");
	});
});
