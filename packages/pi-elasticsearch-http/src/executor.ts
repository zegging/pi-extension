import { EsHttpError } from "./errors.ts";
import { resolveAuthHeader } from "./auth.ts";
import { DEFAULT_MAX_RESPONSE_BYTES, headersToRecord, responseExtension, writeFullResponseTemp } from "./response.ts";
import type { HttpExecutionResult, PreparedHttpRequest, ResolvedProfile } from "./types.ts";

let queue: Promise<void> = Promise.resolve();

export async function enqueueEsHttp<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
	let release!: () => void;
	const previous = queue;
	queue = new Promise<void>((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		if (signal?.aborted) throw new EsHttpError("CANCELLED", "request was cancelled before execution started.");
		return await task();
	} finally {
		release();
	}
}

export async function executeHttpRequest(
	req: PreparedHttpRequest,
	profile: ResolvedProfile,
	signal: AbortSignal | undefined,
): Promise<HttpExecutionResult> {
	const auth = await resolveAuthHeader(profile);
	const headers = new Headers(req.headersMap);
	if (auth) headers.set(auth.name, auth.value);

	const controller = new AbortController();
	const onAbort = () => controller.abort(signal?.reason);
	signal?.addEventListener("abort", onAbort, { once: true });
	const timer = setTimeout(() => controller.abort(new Error("ES_HTTP_TIMEOUT")), profile.timeoutMs);
	try {
		const response = await fetch(req.url, {
			method: req.method,
			headers,
			body: req.body && !["GET", "HEAD"].includes(req.method) ? req.body : undefined,
			redirect: "manual",
			signal: controller.signal,
		});
		const headersRecord = headersToRecord(response.headers);
		const { bytes, text, truncated, fullOutputPath } = await readResponseBody(response, headersRecord, controller.signal);
		return {
			status: response.status,
			statusText: response.statusText,
			headers: headersRecord,
			bodyText: text,
			bodyBytes: bytes,
			truncated,
			fullOutputPath,
		};
	} catch (error) {
		if (controller.signal.aborted) {
			const reason = controller.signal.reason;
			if (reason instanceof Error && reason.message === "ES_HTTP_TIMEOUT") {
				throw new EsHttpError(
					"TIMEOUT",
					`request timed out after ${profile.timeoutMs} ms. Request result is unknown; the server may have executed it. The extension did not retry.`,
					{ sent: true, cause: error },
				);
			}
			throw new EsHttpError("CANCELLED", "request was cancelled. If it was already sent, the server may have executed it. The extension did not retry.", {
				sent: true,
				cause: error,
			});
		}
		if (error instanceof EsHttpError) throw error;
		throw new EsHttpError("NETWORK_ERROR", `network error while sending request. Request result is unknown; the server may have executed it. The extension did not retry.`, {
			sent: true,
			cause: error,
		});
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}

async function readResponseBody(
	response: Response,
	headers: Record<string, string>,
	signal: AbortSignal,
): Promise<{ bytes: number; text: string; truncated: boolean; fullOutputPath?: string }> {
	const chunks: Uint8Array[] = [];
	let total = 0;
	const reader = response.body?.getReader();
	if (!reader) return { bytes: 0, text: "", truncated: false };
	while (true) {
		if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("aborted");
		const { value, done } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.byteLength;
		if (total > DEFAULT_MAX_RESPONSE_BYTES) {
			await reader.cancel().catch(() => undefined);
			throw new EsHttpError("RESPONSE_TOO_LARGE", `response exceeded ${DEFAULT_MAX_RESPONSE_BYTES} bytes; download was stopped.`, {
				sent: true,
				hint: "Narrow the query, add size limits, or increase implementation limits after review.",
			});
		}
		chunks.push(value);
	}
	const body = concat(chunks, total);
	const text = new TextDecoder().decode(body);
	return { bytes: total, text, truncated: false, fullOutputPath: undefined };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

export async function maybeWriteFullOutput(result: HttpExecutionResult, contextMaxBytes: number, contextMaxLines: number): Promise<HttpExecutionResult> {
	const lines = result.bodyText.split("\n").length;
	const shouldWrite = result.bodyBytes > contextMaxBytes || lines > contextMaxLines;
	if (!shouldWrite || result.fullOutputPath) return result;
	const bytes = new TextEncoder().encode(result.bodyText);
	const fullOutputPath = await writeFullResponseTemp(bytes, responseExtension(result.headers));
	return { ...result, truncated: true, fullOutputPath };
}
