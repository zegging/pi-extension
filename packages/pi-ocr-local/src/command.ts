import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatOcrError } from "./errors.ts";
import type { OcrService } from "./ocr-service.ts";

export function registerOcrCommand(pi: ExtensionAPI, service: OcrService): void {
	pi.registerCommand("ocr", {
		description: "Extract text from an absolute image path and place it in the editor",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/ocr requires Pi interactive mode because the result is placed in the editor.", "error");
				return;
			}
			ctx.ui.setStatus("ocr", "OCR: recognizing image…");
			try {
				const result = await service.recognize({ imagePath: args }, ctx.signal);
				ctx.ui.setEditorText(result.text);
				if (!result.text) {
					ctx.ui.notify(
						`OCR completed with ${result.metadata.backend} in ${Math.round(result.metadata.durationMs)} ms, but no text was found.`,
						"warning",
					);
					return;
				}
				ctx.ui.notify(
					`OCR completed with ${result.metadata.backend}${result.metadata.model ? `/${result.metadata.model}` : ""} ` +
					`in ${Math.round(result.metadata.durationMs)} ms. Text is ready in the editor; review and submit it when ready.`,
					"info",
				);
			} catch (error) {
				ctx.ui.notify(formatOcrError(error), "error");
			} finally {
				ctx.ui.setStatus("ocr", undefined);
			}
		},
	});
}
