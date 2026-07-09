import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { EsHttpError } from "./errors.ts";

export const MAX_HTTP_FILE_BYTES = 1024 * 1024;

export async function readWorkspaceHttpFile(cwd: string, file: string): Promise<{ path: string; text: string }> {
	const normalized = file.startsWith("@") ? file.slice(1) : file;
	if (isAbsolute(normalized)) {
		throw new EsHttpError("FILE_OUTSIDE_WORKSPACE", "file must be relative to the workspace.", {
			hint: "Pass a path like `queries/search.http`, not an absolute path.",
		});
	}
	const ext = extname(normalized).toLowerCase();
	if (ext !== ".http" && ext !== ".rest") {
		throw new EsHttpError("FILE_OUTSIDE_WORKSPACE", "only .http and .rest files are allowed.", {
			hint: "Move the request into a .http or .rest file under the workspace.",
		});
	}
	const abs = resolve(cwd, normalized);
	const root = await realpath(cwd);
	let actual: string;
	try {
		actual = await realpath(abs);
	} catch (cause) {
		throw new EsHttpError("FILE_OUTSIDE_WORKSPACE", `cannot resolve file '${file}'.`, { cause });
	}
	const rel = relative(root, actual);
	if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`) || isAbsolute(rel)) {
		throw new EsHttpError("FILE_OUTSIDE_WORKSPACE", `file '${file}' resolves outside the workspace.`, {
			hint: "Do not use .. traversal or symlinks pointing outside the workspace.",
		});
	}
	const st = await stat(actual);
	if (st.size > MAX_HTTP_FILE_BYTES) {
		throw new EsHttpError("FILE_TOO_LARGE", `HTTP file is ${st.size} bytes; limit is ${MAX_HTTP_FILE_BYTES} bytes.`, {
			hint: "Split the file into smaller .http/.rest files.",
		});
	}
	return { path: actual, text: await readFile(actual, "utf8") };
}
