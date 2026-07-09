import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import type { HttpExecutionResult } from "./types.ts";

export const DEFAULT_MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

export function headersToRecord(headers: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((value, key) => {
		out[key] = value;
	});
	return out;
}

export function formatResponseForContext(result: HttpExecutionResult, limits: { maxBytes: number; maxLines: number }): string {
	let bodyForDisplay = result.bodyText;
	const contentType = Object.entries(result.headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
	if (contentType.includes("json")) {
		try {
			bodyForDisplay = JSON.stringify(JSON.parse(result.bodyText), null, 2);
		} catch {
			// Keep raw text if not valid JSON.
		}
	}
	const truncation = truncateHead(bodyForDisplay, {
		maxBytes: limits.maxBytes,
		maxLines: limits.maxLines,
	});

	const headerLines = [
		`HTTP ${result.status} ${result.statusText}`.trim(),
		...Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`),
	];
	let text = `${headerLines.join("\n")}\n\n${truncation.content}`;
	if (result.truncated || truncation.truncated) {
		const shown = truncation.outputBytes;
		const total = Math.max(result.bodyBytes, truncation.totalBytes);
		text += `\n\n[Response truncated: showing ${formatSize(shown)} of ${formatSize(total)}.`;
		if (result.fullOutputPath) text += ` Full raw response saved to: ${result.fullOutputPath}`;
		text += "]";
	}
	return text;
}

export async function writeFullResponseTemp(body: Uint8Array, extension = "json"): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pi-es-http-"));
	await mkdir(dir, { recursive: true, mode: 0o700 });
	const path = join(dir, `response.${extension}`);
	await writeFile(path, body, { mode: 0o600 });
	return path;
}

export function responseExtension(headers: Record<string, string>): string {
	const contentType = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
	if (contentType.includes("json")) return "json";
	if (contentType.startsWith("text/")) return "txt";
	return "bin";
}
