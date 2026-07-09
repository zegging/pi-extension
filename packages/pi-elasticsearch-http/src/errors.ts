export type EsHttpErrorCode =
	| "CONFIG_ERROR"
	| "AUTH_MISSING"
	| "FILE_OUTSIDE_WORKSPACE"
	| "FILE_TOO_LARGE"
	| "PARSE_ERROR"
	| "REQUEST_NOT_FOUND"
	| "VARIABLE_MISSING"
	| "FORBIDDEN_HEADER"
	| "ORIGIN_MISMATCH"
	| "CONFIRMATION_REQUIRED"
	| "USER_REJECTED"
	| "TIMEOUT"
	| "CANCELLED"
	| "NETWORK_ERROR"
	| "HTTP_ERROR"
	| "RESPONSE_TOO_LARGE";

export class EsHttpError extends Error {
	readonly code: EsHttpErrorCode;
	readonly sent: boolean;
	readonly hint?: string;
	readonly status?: number;

	constructor(
		code: EsHttpErrorCode,
		message: string,
		options: { sent?: boolean; hint?: string; status?: number; cause?: unknown } = {},
	) {
		super(`${code}: ${message}${options.hint ? `\nHint: ${options.hint}` : ""}`, { cause: options.cause });
		this.name = "EsHttpError";
		this.code = code;
		this.sent = options.sent ?? false;
		this.hint = options.hint;
		this.status = options.status;
	}
}

export function isEsHttpError(value: unknown): value is EsHttpError {
	return value instanceof EsHttpError;
}

export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
	let out = text;
	for (const secret of secrets) {
		if (!secret || secret.length < 3) continue;
		out = out.split(secret).join("[REDACTED]");
	}
	return out;
}
