import { EsHttpError } from "./errors.ts";
import type { ParsedHttpRequest, PreparedHttpRequest, ResolvedProfile } from "./types.ts";
import { assertNoProtectedHeaders, isProtectedHeader } from "./variables.ts";

export function prepareRequest(req: ParsedHttpRequest, profile: ResolvedProfile): PreparedHttpRequest {
	assertNoProtectedHeaders(req.headers);
	const url = resolveAndValidateUrl(req.target, profile.baseUrl);
	const normalizedPath = normalizePath(url.pathname);
	const headersMap: Record<string, string> = { ...profile.headers };
	for (const [name, value] of Object.entries(headersMap)) {
		if (isProtectedHeader(name)) {
			throw new EsHttpError("CONFIG_ERROR", `profile header '${name}' is protected and cannot be set in config.`, {
				hint: "Remove Authorization/Host/Content-Length/etc from profile headers. Auth is injected from profile.auth.",
			});
		}
		if (typeof value !== "string") {
			throw new EsHttpError("CONFIG_ERROR", `profile header '${name}' must be a string.`);
		}
	}
	for (const header of req.headers) headersMap[header.name] = header.value;

	return {
		...req,
		url,
		normalizedPath,
		bodyBytes: Buffer.byteLength(req.body, "utf8"),
		headersMap,
	};
}

export function resolveAndValidateUrl(target: string, baseUrl: URL): URL {
	let url: URL;
	try {
		url = new URL(target, baseUrl);
	} catch (cause) {
		throw new EsHttpError("PARSE_ERROR", `invalid request URL: ${target}`, { cause });
	}
	if (originOf(url) !== originOf(baseUrl)) {
		throw new EsHttpError("ORIGIN_MISMATCH", `request origin ${originOf(url)} does not match profile origin ${originOf(baseUrl)}.`, {
			hint: "Use a relative URL or an absolute URL with the same scheme, host, and port as the selected profile.",
		});
	}
	url.pathname = normalizePath(url.pathname);
	return url;
}

export function originOf(url: URL): string {
	return `${url.protocol}//${url.host}`;
}

export function normalizePath(pathname: string): string {
	const collapsed = pathname.replace(/\/+/g, "/");
	let decoded: string;
	try {
		decoded = collapsed
			.split("/")
			.map((segment) => decodeURIComponent(segment))
			.join("/");
	} catch (cause) {
		throw new EsHttpError("PARSE_ERROR", `invalid URL encoding in path '${pathname}'.`, { cause });
	}
	const segments = decoded.split("/");
	if (segments.some((s) => s === "..")) {
		throw new EsHttpError("PARSE_ERROR", `path traversal segment '..' is not allowed in request path '${pathname}'.`);
	}
	const normalized = decoded.startsWith("/") ? decoded : `/${decoded}`;
	return normalized.replace(/\/+/g, "/");
}
