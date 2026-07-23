import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CommandOcrBackend } from "../src/backends/command.ts";

const fixture = fileURLToPath(new URL("./fixtures/fake-backend.mjs", import.meta.url));

describe("CommandOcrBackend", () => {
	it("normalizes a JSONL backend response into the shared OCR result", async () => {
		const backend = new CommandOcrBackend("fake", {
			type: "command",
			command: process.execPath,
			args: [fixture],
			env: {},
			idleTimeoutMs: 0,
		}, 5_000);

		const result = await backend.recognize({ imagePath: "/tmp/image.png" });
		await backend.dispose();

		expect(result).toMatchObject({
			text: "recognized:/tmp/image.png",
			blocks: [{ text: "recognized", confidence: 0.9 }],
			metadata: { backend: "fake", model: "fake" },
		});
	});
});
