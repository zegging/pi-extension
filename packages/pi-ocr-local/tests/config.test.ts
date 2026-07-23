import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfigPath, loadConfig } from "../src/config.ts";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(() => {
	if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
});

describe("loadConfig", () => {
	it("provides a lightweight RapidOCR backend when no config file exists", async () => {
		process.env.PI_CODING_AGENT_DIR = await mkdtemp(join(tmpdir(), "pi-ocr-config-"));

		const config = await loadConfig();

		expect(config.backend).toBe("rapidocr");
		expect(config.backends.rapidocr).toEqual({
			type: "rapidocr",
			model: "tiny",
			threads: 2,
			maxImageSide: 1600,
			idleTimeoutMs: 30_000,
		});
	});

	it("loads an explicitly selected command backend", async () => {
		process.env.PI_CODING_AGENT_DIR = await mkdtemp(join(tmpdir(), "pi-ocr-config-"));
		await mkdir(join(process.env.PI_CODING_AGENT_DIR, "ocr"), { recursive: true });
		await writeFile(
			getConfigPath(),
			JSON.stringify({
				backend: "custom",
				backends: {
					custom: { type: "command", command: "my-ocr", args: ["--jsonl"] },
				},
			}),
		);

		const config = await loadConfig();

		expect(config.backend).toBe("custom");
		expect(config.backends.custom).toEqual({
			type: "command",
			command: "my-ocr",
			args: ["--jsonl"],
			env: {},
			idleTimeoutMs: 30_000,
		});
	});

	it("rejects a relative configured Python interpreter path with a config-file hint", async () => {
		process.env.PI_CODING_AGENT_DIR = await mkdtemp(join(tmpdir(), "pi-ocr-config-"));
		await mkdir(join(process.env.PI_CODING_AGENT_DIR, "ocr"), { recursive: true });
		await writeFile(
			getConfigPath(),
			JSON.stringify({
				backend: "rapidocr",
				backends: { rapidocr: { type: "rapidocr", pythonPath: "python" } },
			}),
		);

		await expect(loadConfig()).rejects.toThrow("pythonPath must be absolute");
	});
});
