export type OcrErrorCode =
	| "BACKEND_NOT_FOUND"
	| "BACKEND_UNAVAILABLE"
	| "BACKEND_PROTOCOL_ERROR"
	| "CONFIG_ERROR"
	| "INVALID_IMAGE"
	| "MODEL_NOT_FOUND"
	| "TIMEOUT"
	| "CANCELLED"
	| "RECOGNITION_FAILED";

export class OcrError extends Error {
	readonly code: OcrErrorCode;
	readonly hint?: string;

	constructor(code: OcrErrorCode, message: string, options: { cause?: unknown; hint?: string } = {}) {
		super(message, { cause: options.cause });
		this.name = "OcrError";
		this.code = code;
		this.hint = options.hint;
	}
}

export function formatOcrError(error: unknown): string {
	if (error instanceof OcrError) {
		return `${error.message}${error.hint ? `\n${error.hint}` : ""}`;
	}
	return error instanceof Error ? error.message : String(error);
}
