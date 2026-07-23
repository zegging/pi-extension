import { isAbsolute } from "node:path";
import type { ExecResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getManagedVenvDir } from "./config.ts";
const PROBE_SCRIPT = String.raw`
import json, sys
try:
    from importlib.metadata import version, PackageNotFoundError
except ImportError:
    from importlib_metadata import version, PackageNotFoundError

def package_version(name):
    try:
        return version(name)
    except Exception:
        return None

print(json.dumps({
    "executable": sys.executable,
    "python": ".".join(map(str, sys.version_info[:3])),
    "rapidocr": package_version("rapidocr"),
    "onnxruntime": package_version("onnxruntime"),
}))
`;

export interface ProcessRunResult {
	code: number;
	stdout: string;
	stderr: string;
	killed: boolean;
}

export type CommandRunner = (
	command: string,
	args: string[],
	options?: { timeout?: number; signal?: AbortSignal },
) => Promise<ProcessRunResult>;

export interface PythonCandidate {
	command: string;
	args: string[];
	label: string;
}

export interface PythonRuntime {
	executable: string;
	pythonVersion: string;
	rapidocrVersion?: string;
	onnxruntimeVersion?: string;
	ready: boolean;
	source: string;
}

export function createPiCommandRunner(pi: Pick<ExtensionAPI, "exec">): CommandRunner {
	return async (command, args, options) => {
		const result: ExecResult = await pi.exec(command, args, {
			timeout: options?.timeout,
			signal: options?.signal,
		});
		return result;
	};
}

export function getPythonCandidates(configuredPath?: string, uvCandidates: PythonCandidate[] = []): PythonCandidate[] {
	const candidates: PythonCandidate[] = [];
	if (configuredPath) candidates.push({ command: configuredPath, args: [], label: "configured pythonPath" });
	candidates.push({ command: "python", args: [], label: "python on PATH" });
	candidates.push({ command: "python3", args: [], label: "python3 on PATH" });
	if (process.platform === "win32") candidates.push({ command: "py", args: ["-3"], label: "Windows py launcher" });
	candidates.push(...uvCandidates);
	const managed = process.platform === "win32"
		? `${getManagedVenvDir()}\\Scripts\\python.exe`
		: `${getManagedVenvDir()}/bin/python`;
	candidates.push({ command: managed, args: [], label: "managed OCR environment" });
	return deduplicateCandidates(candidates);
}

export async function resolvePythonCandidates(options: {
	run: CommandRunner;
	configuredPath?: string;
	signal?: AbortSignal;
}): Promise<PythonCandidate[]> {
	const result = await options.run(
		"uv",
		["python", "list", "--only-installed", "--output-format", "json", "--no-python-downloads"],
		{ timeout: 10_000, signal: options.signal },
	);
	const uvCandidates = result.code === 0 ? parseUvPythonCandidates(result.stdout) : [];
	return getPythonCandidates(options.configuredPath, uvCandidates);
}

export async function findReadyOrBasePython(options: {
	run: CommandRunner;
	candidates?: PythonCandidate[];
	signal?: AbortSignal;
}): Promise<{ ready?: PythonRuntime; base?: PythonRuntime }> {
	let base: PythonRuntime | undefined;
	for (const candidate of options.candidates ?? getPythonCandidates()) {
		const runtime = await probeCandidate(options.run, candidate, options.signal);
		if (!runtime || !isSupportedPython(runtime.pythonVersion)) continue;
		base ??= runtime;
		if (runtime.ready) return { ready: runtime, base };
	}
	return { base };
}

export async function findReadyPython(options: {
	run: CommandRunner;
	candidates?: PythonCandidate[];
	signal?: AbortSignal;
}): Promise<PythonRuntime | undefined> {
	for (const candidate of options.candidates ?? getPythonCandidates()) {
		const runtime = await probeCandidate(options.run, candidate, options.signal);
		if (runtime?.ready) return runtime;
	}
	return undefined;
}

export async function findBasePython(options: {
	run: CommandRunner;
	candidates?: PythonCandidate[];
	signal?: AbortSignal;
}): Promise<PythonRuntime | undefined> {
	for (const candidate of options.candidates ?? getPythonCandidates()) {
		const runtime = await probeCandidate(options.run, candidate, options.signal);
		if (runtime && isSupportedPython(runtime.pythonVersion)) return runtime;
	}
	return undefined;
}

export async function inspectPythonCandidates(options: {
	run: CommandRunner;
	candidates?: PythonCandidate[];
	signal?: AbortSignal;
}): Promise<PythonRuntime[]> {
	const runtimes: PythonRuntime[] = [];
	for (const candidate of options.candidates ?? getPythonCandidates()) {
		const runtime = await probeCandidate(options.run, candidate, options.signal);
		if (runtime) runtimes.push(runtime);
	}
	return runtimes;
}

async function probeCandidate(
	run: CommandRunner,
	candidate: PythonCandidate,
	signal?: AbortSignal,
): Promise<PythonRuntime | undefined> {
	const result = await run(candidate.command, [...candidate.args, "-c", PROBE_SCRIPT], {
		timeout: 10_000,
		signal,
	});
	if (result.code !== 0) return undefined;
	const payload = parseProbeOutput(result.stdout);
	if (!payload) return undefined;
	const pythonVersion = typeof payload.python === "string" ? payload.python : "0";
	const rapidocrVersion = typeof payload.rapidocr === "string" ? payload.rapidocr : undefined;
	const onnxruntimeVersion = typeof payload.onnxruntime === "string" ? payload.onnxruntime : undefined;
	return {
		executable: typeof payload.executable === "string" ? payload.executable : candidate.command,
		pythonVersion,
		rapidocrVersion,
		onnxruntimeVersion,
		ready:
			isSupportedPython(pythonVersion) &&
			isVersionInRange(rapidocrVersion, [3, 9], [4, 0]) &&
			isVersionInRange(onnxruntimeVersion, [1, 20], [2, 0]),
		source: candidate.label,
	};
}

function parseProbeOutput(stdout: string): Record<string, unknown> | undefined {
	for (const line of stdout.trim().split(/\r?\n/).reverse()) {
		try {
			const value = JSON.parse(line) as unknown;
			if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
		} catch {
			// Ignore launcher noise and inspect the previous line.
		}
	}
	return undefined;
}

function parseUvPythonCandidates(stdout: string): PythonCandidate[] {
	try {
		const entries = JSON.parse(stdout) as unknown;
		if (!Array.isArray(entries)) return [];
		return entries
			.flatMap((entry): Array<{ path: string; version: string }> => {
				if (!entry || typeof entry !== "object") return [];
				const value = entry as Record<string, unknown>;
				if (value.implementation !== "cpython" || typeof value.path !== "string" || !isAbsolute(value.path)) return [];
				return [{ path: value.path, version: typeof value.version === "string" ? value.version : "0" }];
			})
			.filter((entry) => isSupportedPython(entry.version))
			.sort((left, right) => pythonPreference(left.version) - pythonPreference(right.version))
			.map((entry) => ({ command: entry.path, args: [], label: `uv-discovered CPython ${entry.version}` }));
	} catch {
		return [];
	}
}

function pythonPreference(version: string): number {
	const [major, minor] = version.split(".").map(Number);
	const preferredMinors = [12, 11, 13, 10, 9, 8];
	const index = major === 3 ? preferredMinors.indexOf(minor) : -1;
	return index === -1 ? preferredMinors.length : index;
}

function isSupportedPython(version: string): boolean {
	return isVersionInRange(version, [3, 8], [4, 0]);
}

function isVersionInRange(version: string | undefined, minimum: number[], maximumExclusive: number[]): boolean {
	if (!version) return false;
	const parsed = version.split(/[.+-]/).slice(0, 3).map(Number);
	if (parsed.some((part) => !Number.isFinite(part))) return false;
	return compareVersions(parsed, minimum) >= 0 && compareVersions(parsed, maximumExclusive) < 0;
}

function compareVersions(left: number[], right: number[]): number {
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const difference = (left[i] ?? 0) - (right[i] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

function deduplicateCandidates(candidates: PythonCandidate[]): PythonCandidate[] {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		const key = JSON.stringify([candidate.command, candidate.args]);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
