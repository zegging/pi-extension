import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { frameConfirmLines } from "../src/tool.ts";

const identityFg: Theme["fg"] = (_role, text) => text;
const identity: Theme = {
	fg: identityFg,
	bold: (text: string) => text,
} as unknown as Theme;

describe("frameConfirmLines", () => {
	it("wraps long request lines instead of truncating them so the URL stays reviewable", () => {
		const longUrl =
			"POST https://vpc-l10n-searcher-sg-st5vnzrmnkue3gzgidw4xrdrgq.ap-southeast-1.es.amazonaws.com/forum_article_20250718_1_2_en_us/_update/floor-planner-ultimate-guide-2026";
		const framed = frameConfirmLines(identity, [longUrl], 60);
		const bodyLines = framed.slice(1, -1).filter((line) => line.trim().length > 0);
		const joined = bodyLines.map((line) => line.trim()).join("");
		expect(joined).toBe(longUrl.replace(/\s+/g, ""));
		for (const line of bodyLines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(60);
		}
	});

	it("preserves blank spacer lines used as section separators", () => {
		const framed = frameConfirmLines(identity, ["header", "", "body"], 40);
		expect(framed[0]).toMatch(/^─+$/);
		expect(framed.at(-1)).toMatch(/^─+$/);
		const middle = framed.slice(1, -1);
		// Expected middle: "" (top pad), " header", "", " body", "" (bottom pad)
		expect(middle).toContain(" header");
		expect(middle).toContain(" body");
	});

	it("keeps short lines unchanged (no wrapping side effects)", () => {
		const framed = frameConfirmLines(identity, ["Profile: dev"], 40);
		const body = framed.slice(1, -1).map((line) => line.trim()).filter((line) => line.length > 0);
		expect(body).toEqual(["Profile: dev"]);
	});
});
