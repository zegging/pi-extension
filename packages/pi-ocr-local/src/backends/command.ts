import { OcrError } from "../errors.ts";
import { JsonlProcessClient } from "../runtime/jsonl-process.ts";
import type { CommandBackendConfig, OcrBackend, OcrBlock, OcrRequest, OcrResult } from "../types.ts";

export class CommandOcrBackend implements OcrBackend {
	readonly id: string;
	private readonly client: JsonlProcessClient;

	constructor(id: string, config: CommandBackendConfig, timeoutMs: number) {
		this.id = id;
		this.client = new JsonlProcessClient(config.command, config.args, config.env, timeoutMs, config.idleTimeoutMs);
	}

	async recognize(request: OcrRequest, signal?: AbortSignal): Promise<OcrResult> {
		const startedAt = performance.now();
		const raw = await this.client.request({ method: "recognize", imagePath: request.imagePath }, signal);
		return normalizeResult(this.id, raw, performance.now() - startedAt);
	}

	dispose(): Promise<void> {
		return this.client.dispose();
	}
}

export function normalizeResult(backendId: string, value: unknown, measuredDurationMs: number): OcrResult {
	if (!isRecord(value) || typeof value.text !== "string" || !Array.isArray(value.blocks)) {
		throw new OcrError("BACKEND_PROTOCOL_ERROR", "OCR backend result must contain text and blocks.");
	}
	const blocks = value.blocks.map((block, index) => normalizeBlock(block, index));
	const metadata = isRecord(value.metadata) ? value.metadata : {};
	return {
		text: value.text,
		blocks,
		metadata: {
			backend: backendId,
			...(typeof metadata.model === "string" ? { model: metadata.model } : {}),
			durationMs: typeof metadata.durationMs === "number" && Number.isFinite(metadata.durationMs)
				? metadata.durationMs
				: measuredDurationMs,
		},
	};
}

function normalizeBlock(value: unknown, index: number): OcrBlock {
	if (!isRecord(value) || typeof value.text !== "string") {
		throw new OcrError("BACKEND_PROTOCOL_ERROR", `OCR backend block ${index} is invalid.`);
	}
	const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? value.confidence : undefined;
	const polygon = Array.isArray(value.polygon) ? normalizePolygon(value.polygon, index) : undefined;
	return { text: value.text, ...(confidence === undefined ? {} : { confidence }), ...(polygon ? { polygon } : {}) };
}

function normalizePolygon(value: unknown[], blockIndex: number): Array<[number, number]> {
	return value.map((point) => {
		if (!Array.isArray(point) || point.length !== 2 || point.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate))) {
			throw new OcrError("BACKEND_PROTOCOL_ERROR", `OCR backend block ${blockIndex} has an invalid polygon.`);
		}
		return [point[0] as number, point[1] as number];
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
