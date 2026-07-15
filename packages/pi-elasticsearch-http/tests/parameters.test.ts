import { describe, expect, it } from "vitest";
import { EsHttpParameters, normalizeEsHttpInput, type EsHttpRawParameters } from "../src/parameters.ts";
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

describe("EsHttpParameters JSON Schema shape (regression guard)", () => {
	// TypeBox stores the JSON Schema representation directly on the returned
	// value, so we can inspect the exact shape that will be sent to LLM
	// tool calling. This guard exists because:
	//
	//   - Anthropic tool `input_schema` rejects root-level anyOf/oneOf/allOf
	//     with `input_schema does not support oneOf, allOf, or anyOf at the
	//     top level` (anthropics/claude-code#5973).
	//   - OpenAI function calling requires root `type: "object"`.
	//   - When the root is a Union, the pi harness serializes the schema in a
	//     way that hides every field name from the LLM, so every es_http tool
	//     call arrives as `{}` and fails runtime validation with
	//     `must have required properties file, name`.
	//
	// If any assertion here starts failing, do NOT relax the assertions.
	// Flatten the root schema back to a single `Type.Object({...})` and enforce
	// exclusive-mode invariants at runtime via `normalizeEsHttpInput`.
	const schema = EsHttpParameters as unknown as {
		type?: string;
		anyOf?: unknown;
		oneOf?: unknown;
		allOf?: unknown;
		additionalProperties?: unknown;
		properties?: Record<string, unknown>;
	};

	it("has root type=object so LLM tool calling can see field names", () => {
		expect(schema.type).toBe("object");
		expect(schema.anyOf).toBeUndefined();
		expect(schema.oneOf).toBeUndefined();
		expect(schema.allOf).toBeUndefined();
	});

	it("forbids extra fields via additionalProperties=false", () => {
		expect(schema.additionalProperties).toBe(false);
	});

	it("exposes every documented invocation-mode field to LLM tool calling", () => {
		expect(schema.properties).toBeDefined();
		for (const field of ["profile", "file", "name", "all", "raw", "variables"] as const) {
			expect(schema.properties, `missing property: ${field}`).toHaveProperty(field);
		}
	});
});
