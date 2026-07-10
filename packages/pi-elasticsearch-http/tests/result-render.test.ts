import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { formatEsHttpResultForDisplay } from "../src/tool.ts";

const identity: Theme = {
	fg: (_role: string, text: string) => text,
	bold: (text: string) => text,
} as unknown as Theme;

function result(text: string): AgentToolResult<unknown> {
	return { content: [{ type: "text", text }], details: {} };
}

describe("formatEsHttpResultForDisplay", () => {
	it("collapses normal es_http output to the status line plus expand hint", () => {
		const rendered = formatEsHttpResultForDisplay(
			result("HTTP 200 OK\ncontent-type: application/json\n\n[{\"index\":\"a\"},{\"index\":\"b\"}]"),
			{ expanded: false },
			identity,
		);
		expect(rendered).toBe("\nHTTP 200 OK\n[es_http response hidden. Press ctrl+o to expand]");
	});

	it("keeps response truncation notice visible while collapsed", () => {
		const rendered = formatEsHttpResultForDisplay(
			result("HTTP 200 OK\n\nlarge body\n\n[Response truncated: showing 45KB of 128KB. Full raw response saved to: /tmp/response.json]"),
			{ expanded: false },
			identity,
		);
		expect(rendered).toContain("HTTP 200 OK");
		expect(rendered).toContain("[Response truncated: showing 45KB of 128KB. Full raw response saved to: /tmp/response.json]");
		expect(rendered).toContain("Press ctrl+o to expand");
		expect(rendered).not.toContain("large body");
	});

	it("renders the full output when expanded", () => {
		const output = "HTTP 200 OK\ncontent-type: application/json\n\n[{\"index\":\"a\"}]";
		const rendered = formatEsHttpResultForDisplay(result(output), { expanded: true }, identity);
		expect(rendered).toBe(`\n${output}`);
	});

	it("renders full output for errors even when collapsed", () => {
		const output = "HTTP 500 Internal Server Error\n\nboom";
		const rendered = formatEsHttpResultForDisplay(result(output), { expanded: false }, identity, true);
		expect(rendered).toBe(`\n${output}`);
	});
});
