import type { PreparedHttpRequest, RiskClassification } from "./types.ts";

export function classifyRisk(req: Pick<PreparedHttpRequest, "method" | "normalizedPath">): RiskClassification {
	const method = req.method.toUpperCase();
	const path = req.normalizedPath || "/";
	const segments = pathSegments(path);
	const highlight = highlightTargets(segments);

	if (method === "GET" || method === "HEAD") {
		return { level: "readonly", reason: `${method} requests are read-only.`, requiresConfirmation: false, highlight };
	}

	if (method === "DELETE") {
		return { level: "dangerous", reason: "DELETE requests can remove indices or documents.", requiresConfirmation: true, highlight };
	}

	const dangerous = dangerousReason(segments);
	if (dangerous) {
		return { level: "dangerous", reason: dangerous, requiresConfirmation: true, highlight };
	}

	if (method === "POST" && isPostReadOnly(segments)) {
		return { level: "readonly", reason: `POST ${path} is in the conservative read-only allowlist.`, requiresConfirmation: false, highlight };
	}

	if (["POST", "PUT", "PATCH"].includes(method)) {
		return {
			level: "write",
			reason: `${method} ${path} is not in the read-only allowlist and may change Elasticsearch state.`,
			requiresConfirmation: true,
			highlight,
		};
	}

	return {
		level: "write",
		reason: `${method} ${path} is not recognized as read-only.`,
		requiresConfirmation: true,
		highlight,
	};
}

function isPostReadOnly(segments: string[]): boolean {
	const last = segments.at(-1);
	if (["_search", "_msearch", "_count"].includes(last ?? "")) return true;
	if (segments.length >= 2 && segments.at(-2) === "_validate" && last === "query") return true;
	const explainIndex = segments.indexOf("_explain");
	return explainIndex >= 0 && explainIndex < segments.length - 1;
}

function dangerousReason(segments: string[]): string | undefined {
	if (segments.includes("_delete_by_query")) return "_delete_by_query can delete many documents and is always high-risk.";
	if (segments.includes("_update_by_query")) return "_update_by_query can update many documents and is always high-risk.";
	if (segments.length === 1 && segments[0] === "_reindex") return "_reindex can copy or rewrite large amounts of data.";
	if (segments.includes("_bulk")) return "_bulk is always high-risk; NDJSON actions are not parsed.";
	if (segments.length === 1 && segments[0] === "_aliases") return "_aliases can change index aliases and is always high-risk.";
	if (segments[0] === "_cluster") return "_cluster endpoints can change or expose cluster-wide state.";
	if (segments[0] === "_snapshot") return "_snapshot endpoints can affect repositories or snapshots.";
	if (["_close", "_open", "_forcemerge"].some((s) => segments.includes(s))) return "index open/close/forcemerge operations are high-risk.";
	const tasks = segments.indexOf("_tasks");
	if (tasks >= 0 && segments.at(-1) === "_cancel") return "task cancellation can interrupt running Elasticsearch work.";
	return undefined;
}

function highlightTargets(segments: string[]): string[] {
	const highlights: string[] = [];
	const first = segments[0];
	if (!first) return highlights;
	if (first === "_all") highlights.push("target is _all");
	if (first.includes("*")) highlights.push("target contains wildcard *");
	if (first.includes(",")) highlights.push("target contains multiple indices");
	return highlights;
}

export function pathSegments(path: string): string[] {
	return path.split("/").filter(Boolean);
}
