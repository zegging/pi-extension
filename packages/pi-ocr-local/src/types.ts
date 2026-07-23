export interface OcrRequest {
	imagePath: string;
}

export interface OcrBlock {
	text: string;
	confidence?: number;
	polygon?: Array<[number, number]>;
}

export interface OcrResult {
	text: string;
	blocks: OcrBlock[];
	metadata: {
		backend: string;
		model?: string;
		durationMs: number;
	};
}

export interface OcrBackend {
	readonly id: string;
	recognize(request: OcrRequest, signal?: AbortSignal): Promise<OcrResult>;
	dispose(): Promise<void>;
}

interface IdleBackendConfig {
	idleTimeoutMs: number;
}

export interface RapidOcrBackendConfig extends IdleBackendConfig {
	type: "rapidocr";
	pythonPath?: string;
	model: "tiny" | "small";
	threads: number;
	maxImageSide: number;
}

export interface CommandBackendConfig extends IdleBackendConfig {
	type: "command";
	command: string;
	args: string[];
	env: Record<string, string>;
}

export type OcrBackendConfig = RapidOcrBackendConfig | CommandBackendConfig;

export interface OcrConfig {
	backend: string;
	timeoutMs: number;
	backends: Record<string, OcrBackendConfig>;
}
