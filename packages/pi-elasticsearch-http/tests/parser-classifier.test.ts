import { describe, expect, it } from "vitest";
import { classifyRisk } from "../src/classifier.ts";
import { parseHttpDocument } from "../src/parser.ts";


describe("parseHttpDocument", () => {
	it("parses named requests split by ###", () => {
		const requests = parseHttpDocument(`# @name search\nPOST /users/_search\nContent-Type: application/json\n\n{"query":{"match_all":{}}}\n\n###\n\n# @name count\nPOST /users/_count\n\n{}`);
		expect(requests).toHaveLength(2);
		expect(requests[0]?.name).toBe("search");
		expect(requests[0]?.method).toBe("POST");
		expect(requests[0]?.target).toBe("/users/_search");
		expect(requests[0]?.headers[0]).toEqual({ name: "Content-Type", value: "application/json" });
		expect(requests[1]?.name).toBe("count");
	});

	it("rejects raw input with multiple requests", () => {
		expect(() => parseHttpDocument("GET /\n\n###\n\nGET /_cluster/health", { raw: true })).toThrow(/raw input/);
	});
});

describe("classifyRisk", () => {
	it("allows read-only requests", () => {
		expect(classifyRisk({ method: "GET", normalizedPath: "/anything" }).requiresConfirmation).toBe(false);
		expect(classifyRisk({ method: "POST", normalizedPath: "/users/_search" }).requiresConfirmation).toBe(false);
	});

	it("requires confirmation for writes and dangerous endpoints", () => {
		expect(classifyRisk({ method: "PUT", normalizedPath: "/users/_doc/1" }).level).toBe("write");
		expect(classifyRisk({ method: "POST", normalizedPath: "/users/_bulk" }).level).toBe("dangerous");
		expect(classifyRisk({ method: "DELETE", normalizedPath: "/users" }).level).toBe("dangerous");
	});
});
