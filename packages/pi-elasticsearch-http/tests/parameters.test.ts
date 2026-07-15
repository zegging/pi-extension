import { describe, expect, it } from "vitest";
import { normalizeEsHttpInput, type EsHttpRawParameters } from "../src/parameters.ts";
import { EsHttpError, isEsHttpError } from "../src/errors.ts";

function expectParseError(input: EsHttpRawParameters, matcher: string | RegExp): void {
	try {
		normalizeEsHttpInput(input);
	} catch (err) {
		expect(isEsHttpError(err)).toBe(true);
		const esErr = err as EsHttpError;
		expect(esErr.code).toBe("PARSE_ERROR");
		if (typeof matcher === "string") expect(esErr.message).toContain(matcher);
		else expect(esErr.message).toMatch(matcher);
		return;
	}
	throw new Error(`Expected normalizeEsHttpInput to throw PARSE_ERROR matching ${String(matcher)}`);
}

describe("normalizeEsHttpInput", () => {
	it("accepts { file, name } and preserves optional fields", () => {
		const out = normalizeEsHttpInput({
			profile: "dev",
			file: "queries.http",
			name: "search",
			variables: { userId: "42" },
		});
		expect(out).toEqual({
			profile: "dev",
			file: "queries.http",
			name: "search",
			variables: { userId: "42" },
		});
	});

	it("accepts { file, all: true }", () => {
		const out = normalizeEsHttpInput({ file: "queries.http", all: true });
		expect(out).toEqual({ profile: undefined, file: "queries.http", all: true, variables: undefined });
	});

	it("accepts { raw }", () => {
		const out = normalizeEsHttpInput({ raw: "GET /_cluster/health" });
		expect(out).toEqual({ profile: undefined, raw: "GET /_cluster/health", variables: undefined });
	});

	it("rejects an empty payload with a hint listing all three modes", () => {
		expectParseError({}, /Missing required parameters/);
	});

	it("rejects file without name or all", () => {
		expectParseError({ file: "queries.http" }, /`file` requires either `name` or `all: true`/);
	});

	it("rejects name without file", () => {
		expectParseError({ name: "search" }, /`name` and `all` require `file`/);
	});

	it("rejects all without file", () => {
		expectParseError({ all: true }, /`name` and `all` require `file`/);
	});

	it("rejects file combined with raw", () => {
		expectParseError(
			{ file: "queries.http", name: "search", raw: "GET /_cluster/health" },
			/`file` and `raw` are mutually exclusive/,
		);
	});

	it("rejects raw combined with name", () => {
		expectParseError({ raw: "GET /_cluster/health", name: "search" }, /`raw` cannot be combined with `name` or `all`/);
	});

	it("rejects raw combined with all", () => {
		expectParseError({ raw: "GET /_cluster/health", all: true }, /`raw` cannot be combined with `name` or `all`/);
	});

	it("rejects file with both name and all", () => {
		expectParseError(
			{ file: "queries.http", name: "search", all: true },
			/`name` and `all` are mutually exclusive under `file`/,
		);
	});

	it("treats empty-string file/name/raw as missing", () => {
		expectParseError({ file: "", name: "" }, /Missing required parameters/);
		expectParseError({ raw: "" }, /Missing required parameters/);
	});
});
