import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installManagedRuntime } from "../src/setup.ts";
import type { CommandRunner, PythonRuntime } from "../src/python-runtime.ts";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(() => {
	if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
});

describe("installManagedRuntime", () => {
	it("creates a private venv, installs without pip cache, and validates it", async () => {
		process.env.PI_CODING_AGENT_DIR = await mkdtemp(join(tmpdir(), "pi-ocr-setup-"));
		const base: PythonRuntime = {
			executable: "/usr/bin/python3",
			pythonVersion: "3.12.4",
			ready: false,
			source: "python3",
		};
		const run = vi.fn<CommandRunner>()
			.mockResolvedValueOnce({ code: 0, stdout: "", stderr: "", killed: false })
			.mockResolvedValueOnce({ code: 0, stdout: "", stderr: "", killed: false })
			.mockResolvedValueOnce({
				code: 0,
				stdout: `${JSON.stringify({ executable: "/managed/bin/python", python: "3.12.4", rapidocr: "3.9.1", onnxruntime: "1.23.1" })}\n`,
				stderr: "",
				killed: false,
			});

		const runtime = await installManagedRuntime(run, base);

		expect(runtime.ready).toBe(true);
		expect(run.mock.calls[0]?.[1]).toContain("venv");
		expect(run.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(["pip", "install", "--no-cache-dir", "rapidocr>=3.9,<4", "onnxruntime>=1.20,<2"]));
	});
});
