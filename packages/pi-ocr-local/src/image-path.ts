import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { OcrError } from "./errors.ts";

export async function validateAbsoluteImagePath(raw: string): Promise<string> {
	const imagePath = raw.trim();
	if (!imagePath) {
		throw new OcrError("INVALID_IMAGE", "Usage: /ocr <absolute-image-path>.");
	}
	if (!isAbsolute(imagePath)) {
		throw new OcrError("INVALID_IMAGE", "The image path must be absolute.");
	}

	let fileStat;
	try {
		fileStat = await stat(imagePath);
	} catch (cause) {
		throw new OcrError("INVALID_IMAGE", `Image does not exist or cannot be accessed: ${imagePath}`, { cause });
	}
	if (!fileStat.isFile()) {
		throw new OcrError("INVALID_IMAGE", `Image path is not a file: ${imagePath}`);
	}
	return imagePath;
}
