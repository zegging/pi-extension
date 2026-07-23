import { describe, expect, it, vi } from "vitest";
import { findBasePython, findReadyPython, resolvePythonCandidates, type CommandRunner } from "../src/python-runtime.ts";

function result(payload: object) {
	return { code: 0, stdout: `${JSON.stringify(payload)}\n`, stderr: "", killed: false };
}

describe("Python runtime discovery", () => {
	it("discovers installed uv-managed Python paths without allowing downloads", async () => {
		const run = vi.fn<CommandRunner>().mockResolvedValue(
			result([
				{ implementation: "cpython", version: "3.13.2", path: "/uv/python/3.13/bin/python" },
				{ implementation: "cpython", version: "3.12.9", path: "/uv/python/3.12/bin/python" },
			]),
		);

		const candidates = await resolvePythonCandidates({ run });
		const uvCandidates = candidates.filter((candidate) => candidate.label.startsWith("uv-discovered"));

		expect(run).toHaveBeenCalledWith(
			"uv",
			["python", "list", "--only-installed", "--output-format", "json", "--no-python-downloads"],
			expect.objectContaining({ timeout: 10_000 }),
		);
		expect(uvCandidates).toEqual([
			{ command: "/uv/python/3.12/bin/python", args: [], label: "uv-discovered CPython 3.12.9" },
			{ command: "/uv/python/3.13/bin/python", args: [], label: "uv-discovered CPython 3.13.2" },
		]);
	});

	it("uses the first machine interpreter that already has compatible OCR dependencies", async () => {
		const run = vi.fn<CommandRunner>().mockResolvedValue(
			result({ executable: "/usr/bin/python3", python: "3.12.4", rapidocr: "3.9.1", onnxruntime: "1.23.1" }),
		);

		const runtime = await findReadyPython({ run, candidates: [{ command: "python3", args: [], label: "python3" }] });

		expect(runtime).toMatchObject({ executable: "/usr/bin/python3", source: "python3" });
	});

	it("can use a compatible base Python even when OCR dependencies are absent", async () => {
		const run = vi.fn<CommandRunner>().mockResolvedValue(
			result({ executable: "C:\\Python312\\python.exe", python: "3.12.4", rapidocr: null, onnxruntime: null }),
		);

		const runtime = await findBasePython({ run, candidates: [{ command: "python", args: [], label: "python" }] });

		expect(runtime).toMatchObject({ executable: "C:\\Python312\\python.exe", ready: false });
	});
});
