import { BackendRegistry } from "./backend-registry.ts";
import { loadConfig } from "./config.ts";
import { OcrError } from "./errors.ts";
import { validateAbsoluteImagePath } from "./image-path.ts";
import type { OcrRequest, OcrResult } from "./types.ts";

export class OcrService {
	constructor(private readonly registry: BackendRegistry) {}

	async recognize(request: OcrRequest, signal?: AbortSignal): Promise<OcrResult> {
		const imagePath = await validateAbsoluteImagePath(request.imagePath);
		const config = await loadConfig();
		const backendConfig = config.backends[config.backend];
		if (!backendConfig) {
			throw new OcrError("BACKEND_NOT_FOUND", `OCR backend '${config.backend}' is not configured.`);
		}
		const backend = await this.registry.get(config.backend, backendConfig, config.timeoutMs);
		return backend.recognize({ imagePath }, signal);
	}

	dispose(): Promise<void> {
		return this.registry.dispose();
	}
}
