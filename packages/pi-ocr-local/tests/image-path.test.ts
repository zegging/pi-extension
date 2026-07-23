import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAbsoluteImagePath } from "../src/image-path.ts";

describe("validateAbsoluteImagePath", () => {
	it("accepts an accessible absolute file path without rewriting it", async () => {
		const directory = await mkdtemp(join(tmpdir(), "pi-ocr-path-"));
		const imagePath = join(directory, "image with spaces.png");
		await writeFile(imagePath, "image bytes");

		await expect(validateAbsoluteImagePath(imagePath)).resolves.toBe(imagePath);
	});

	it("rejects relative paths instead of resolving them against the working directory", async () => {
		await expect(validateAbsoluteImagePath("images/screenshot.png")).rejects.toThrow("must be absolute");
	});

	it("rejects an empty command argument with the exact slash-command usage", async () => {
		await expect(validateAbsoluteImagePath("   ")).rejects.toThrow("/ocr <absolute-image-path>");
	});
});
