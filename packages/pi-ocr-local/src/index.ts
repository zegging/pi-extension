import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BackendRegistry } from "./backend-registry.ts";
import { registerOcrCommand } from "./command.ts";
import { ensureConfigFile, getConfigPath } from "./config.ts";
import { formatOcrError } from "./errors.ts";
import { OcrService } from "./ocr-service.ts";
import { createPiCommandRunner } from "./python-runtime.ts";
import { registerSetupCommands } from "./setup.ts";
import { registerOcrTool } from "./tool.ts";

export default function piOcrLocal(pi: ExtensionAPI): void {
	const service = new OcrService(new BackendRegistry(createPiCommandRunner(pi)));
	registerOcrCommand(pi, service);
	registerOcrTool(pi, service);
	registerSetupCommands(pi, () => service.dispose());
	pi.on("session_start", async (_event, ctx) => {
		try {
			await ensureConfigFile();
		} catch (error) {
			ctx.ui.notify(`Could not initialize OCR config at ${getConfigPath()}: ${formatOcrError(error)}`, "error");
		}
	});
	pi.on("session_shutdown", async () => {
		await service.dispose();
	});
}
