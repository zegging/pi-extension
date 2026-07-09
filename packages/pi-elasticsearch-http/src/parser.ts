import { EsHttpError } from "./errors.ts";
import type { ParsedHttpRequest } from "./types.ts";

const REQUEST_LINE = /^([A-Za-z]+)\s+(\S+)(?:\s+(HTTP\/\d(?:\.\d)?))?\s*$/;

export function parseHttpDocument(text: string, options: { raw?: boolean } = {}): ParsedHttpRequest[] {
	const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const chunks = splitRequests(normalized);
	const requests = chunks
		.map(({ text: chunk, startLine }) => parseChunk(chunk, startLine))
		.filter((req): req is ParsedHttpRequest => req !== undefined);

	if (options.raw && requests.length !== 1) {
		throw new EsHttpError("PARSE_ERROR", "raw input must contain exactly one HTTP request.", {
			hint: "Remove `###` separators and extra request lines from raw input.",
		});
	}

	const seen = new Map<string, number>();
	for (const req of requests) {
		if (!req.name) continue;
		const prev = seen.get(req.name);
		if (prev !== undefined) {
			throw new EsHttpError("PARSE_ERROR", `duplicate request name '${req.name}' at line ${req.startLine}.`, {
				hint: `The same name was first used at line ${prev}. Request names must be unique within one file.`,
			});
		}
		seen.set(req.name, req.startLine);
	}

	if (requests.length === 0) {
		throw new EsHttpError("PARSE_ERROR", "no HTTP requests found.", {
			hint: "Add a request line such as `GET /` or `POST /index/_search`.",
		});
	}
	return requests;
}

function splitRequests(text: string): Array<{ text: string; startLine: number }> {
	const lines = text.split("\n");
	const chunks: Array<{ lines: string[]; startLine: number }> = [{ lines: [], startLine: 1 }];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === "###") {
			chunks.push({ lines: [], startLine: i + 2 });
			continue;
		}
		chunks[chunks.length - 1].lines.push(lines[i]);
	}
	return chunks.map((c) => ({ text: c.lines.join("\n"), startLine: c.startLine }));
}

function parseChunk(chunk: string, startLine: number): ParsedHttpRequest | undefined {
	const lines = chunk.split("\n");
	let name: string | undefined;
	let requestLineIndex = -1;

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed) continue;
		const nameMatch = /^#\s*@name\s+(\S+)\s*$/.exec(trimmed);
		if (nameMatch) {
			name = nameMatch[1];
			continue;
		}
		if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
		requestLineIndex = i;
		break;
	}

	if (requestLineIndex === -1) return undefined;

	const lineNo = startLine + requestLineIndex;
	const requestLine = lines[requestLineIndex].trim();
	const match = REQUEST_LINE.exec(requestLine);
	if (!match) {
		throw new EsHttpError("PARSE_ERROR", `invalid request line at line ${lineNo}: ${requestLine}`, {
			hint: "Expected `METHOD request-target [HTTP-version]`, for example `GET /`.",
		});
	}

	const [, method, target, version] = match;
	const headers: Array<{ name: string; value: string }> = [];
	let i = requestLineIndex + 1;
	for (; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed === "") {
			i += 1;
			break;
		}
		if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
		const colon = line.indexOf(":");
		if (colon <= 0) {
			throw new EsHttpError("PARSE_ERROR", `invalid header at line ${startLine + i}: ${line}`, {
				hint: "Headers must use `Name: value`. Put a blank line before the body.",
			});
		}
		headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() });
	}

	const body = i <= lines.length ? lines.slice(i).join("\n") : "";
	return {
		name,
		method: method.toUpperCase(),
		target,
		version,
		headers,
		body,
		startLine: lineNo,
	};
}

export function listRequestNames(requests: ParsedHttpRequest[]): string[] {
	return requests.map((r, i) => r.name ?? `<unnamed:${i + 1}>`);
}
