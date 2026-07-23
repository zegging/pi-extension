import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	truncateHead,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { OcrService } from "./ocr-service.ts";

export function registerOcrTool(pi: ExtensionAPI, service: OcrService): void {
	pi.registerTool({
		name: "ocr_image",
		label: "Local image OCR",
		description:
			"Extract text from one local image using the configured local OCR backend. The path must be absolute. " +
			`Text output is truncated to ${DEFAULT_MAX_BYTES} bytes or ${DEFAULT_MAX_LINES} lines and OCR results are not cached.`,
		promptSnippet: "Extract text from a local image with ocr_image.",
		promptGuidelines: [
			"Use ocr_image when the user's main reason for sharing an image is to communicate the text shown in it.",
			"Pass an absolute local image path to ocr_image; do not invent paths or use URLs.",
		],
		parameters: Type.Object(
			{
				path: Type.String({ description: "Absolute path to a local image file" }),
			},
			{ additionalProperties: false },
		),
		executionMode: "sequential",
		async execute(_toolCallId, params, signal, onUpdate) {
			onUpdate?.({ content: [{ type: "text", text: "Running local OCR…" }], details: {} });
			const result = await service.recognize({ imagePath: params.path }, signal);
			const text = result.text || "[No text found in image.]";
			const truncated = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES });
			const suffix = truncated.truncated
				? `\n\n[OCR text truncated: ${truncated.outputLines} of ${truncated.totalLines} lines, ${truncated.outputBytes} of ${truncated.totalBytes} bytes. No full-result cache was written.]`
				: "";
			return {
				content: [{ type: "text", text: `${truncated.content}${suffix}` }],
				details: {
					metadata: result.metadata,
					blockCount: result.blocks.length,
					truncated: truncated.truncated,
				},
			};
		},
	});
}
