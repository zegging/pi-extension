import { fileURLToPath } from "node:url";
import { getConfigPath } from "../config.ts";
import { OcrError } from "../errors.ts";
import { findReadyPython, resolvePythonCandidates, type CommandRunner } from "../python-runtime.ts";
import { JsonlProcessClient } from "../runtime/jsonl-process.ts";
import type { OcrBackend, OcrRequest, OcrResult, RapidOcrBackendConfig } from "../types.ts";
import { normalizeResult } from "./command.ts";

export const RAPIDOCR_HELPER_PATH = fileURLToPath(new URL("./rapidocr-helper.py", import.meta.url));

export function getRapidOcrHelperArgs(config: RapidOcrBackendConfig): string[] {
	return [
		"-u",
		RAPIDOCR_HELPER_PATH,
		"--model",
		config.model,
		"--threads",
		String(config.threads),
		"--max-image-side",
		String(config.maxImageSide),
	];
}

export class RapidOcrBackend implements OcrBackend {
	readonly id: string;
	private client?: JsonlProcessClient;
	private initializing?: Promise<JsonlProcessClient>;

	constructor(
		id: string,
		private readonly config: RapidOcrBackendConfig,
		private readonly timeoutMs: number,
		private readonly run: CommandRunner,
	) {
		this.id = id;
	}

	async recognize(request: OcrRequest, signal?: AbortSignal): Promise<OcrResult> {
		const startedAt = performance.now();
		const client = await this.getClient(signal);
		const raw = await client.request({ method: "recognize", imagePath: request.imagePath }, signal);
		return normalizeResult(this.id, raw, performance.now() - startedAt);
	}

	async dispose(): Promise<void> {
		const client = this.client;
		this.client = undefined;
		this.initializing = undefined;
		await client?.dispose();
	}

	private getClient(signal?: AbortSignal): Promise<JsonlProcessClient> {
		if (this.client) return Promise.resolve(this.client);
		if (this.initializing) return this.initializing;
		this.initializing = this.createClient(signal).finally(() => {
			this.initializing = undefined;
		});
		return this.initializing;
	}

	private async createClient(signal?: AbortSignal): Promise<JsonlProcessClient> {
		const candidates = await resolvePythonCandidates({
			run: this.run,
			configuredPath: this.config.pythonPath,
			signal,
		});
		const runtime = await findReadyPython({ run: this.run, candidates, signal });
		if (!runtime) {
			throw new OcrError("BACKEND_UNAVAILABLE", "RapidOCR does not have a compatible Python runtime.", {
				hint:
					`Run /ocr-setup to create a private environment, or set backends.${this.id}.pythonPath in ${getConfigPath()}. ` +
					"Required: Python >=3.8,<4, rapidocr >=3.9,<4, onnxruntime >=1.20,<2.",
			});
		}
		const client = new JsonlProcessClient(
			runtime.executable,
			getRapidOcrHelperArgs(this.config),
			{},
			this.timeoutMs,
			this.config.idleTimeoutMs,
		);
		this.client = client;
		return client;
	}
}
