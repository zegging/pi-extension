import { BorderedLoader, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getRapidOcrHelperArgs } from "./backends/rapidocr.ts";
import { getConfigPath, getManagedVenvDir, ensureConfigFile, saveConfig } from "./config.ts";
import { OcrError, formatOcrError } from "./errors.ts";
import {
	createPiCommandRunner,
	findReadyOrBasePython,
	findReadyPython,
	inspectPythonCandidates,
	resolvePythonCandidates,
	type CommandRunner,
	type PythonRuntime,
} from "./python-runtime.ts";
import type { RapidOcrBackendConfig } from "./types.ts";

const RAPIDOCR_REQUIREMENT = "rapidocr>=3.9,<4";
const ONNXRUNTIME_REQUIREMENT = "onnxruntime>=1.20,<2";

type InstallOutcome =
	| { runtime: PythonRuntime; error?: never; cancelled?: never }
	| { error: unknown; runtime?: never; cancelled?: never }
	| { cancelled: true; runtime?: never; error?: never };

export function registerSetupCommands(pi: ExtensionAPI, disposeBackends: () => Promise<void>): void {
	pi.registerCommand("ocr-setup", {
		description: "Configure a private RapidOCR Python environment",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/ocr-setup requires Pi interactive mode.", "error");
				return;
			}
			ctx.ui.setStatus("ocr-setup", "OCR: checking Python…");
			try {
				await disposeBackends();
				const config = await ensureConfigFile();
				const backend = getRapidConfig(config.backends.rapidocr);
				const run = createPiCommandRunner(pi);
				const candidates = await resolvePythonCandidates({ run, configuredPath: backend.pythonPath });
				const discovery = await findReadyOrBasePython({ run, candidates });
				if (discovery.ready) {
					const existing = discovery.ready;
					ctx.ui.setStatus("ocr-setup", undefined);
					const outcome = await runWithLoader(ctx, "Validating RapidOCR and preparing its model…", async (signal) => {
						await verifyRapidOcrRuntime(run, existing, backend, signal);
						return existing;
					});
					const runtime = unwrapOutcome(outcome, ctx);
					if (!runtime) return;
					backend.pythonPath = runtime.executable;
					await saveConfig(config);
					ctx.ui.notify(formatReadyRuntime(runtime, "OCR is already ready and the configured model was validated"), "info");
					return;
				}

				const base = discovery.base;
				if (!base) {
					throw new OcrError("BACKEND_UNAVAILABLE", "No compatible Python interpreter was found.", {
						hint:
							"Install Python 3.12 with 'uv python install 3.12', or install Python 3.11/3.12 from https://www.python.org/downloads/, then run /ocr-setup again. " +
							"Already-installed uv-managed Python versions are detected without allowing automatic downloads. " +
							`Config: ${getConfigPath()}`,
					});
				}

				const confirmed = await ctx.ui.confirm(
					"Install local OCR runtime?",
					[
						`Base Python: ${base.executable} (${base.pythonVersion})`,
						`Private environment: ${getManagedVenvDir()}`,
						`Packages: ${RAPIDOCR_REQUIREMENT}, ${ONNXRUNTIME_REQUIREMENT}`,
						"The global Python environment will not be modified.",
					].join("\n"),
				);
				if (!confirmed) {
					ctx.ui.notify("OCR setup cancelled; no packages were installed.", "info");
					return;
				}

				ctx.ui.setStatus("ocr-setup", undefined);
				const outcome = await runWithLoader(ctx, "Installing RapidOCR and preparing its model…", async (signal) => {
					const runtime = await installManagedRuntime(run, base, signal);
					await verifyRapidOcrRuntime(run, runtime, backend, signal);
					return runtime;
				});
				const runtime = unwrapOutcome(outcome, ctx);
				if (!runtime) return;
				backend.pythonPath = runtime.executable;
				await saveConfig(config);
				ctx.ui.notify(formatReadyRuntime(runtime, `OCR setup completed\nConfig: ${getConfigPath()}`), "info");
			} catch (error) {
				ctx.ui.notify(formatOcrError(error), "error");
			} finally {
				ctx.ui.setStatus("ocr-setup", undefined);
			}
		},
	});

	pi.registerCommand("ocr-status", {
		description: "Show OCR configuration and Python runtime status",
		handler: async (_args, ctx) => {
			ctx.ui.setStatus("ocr-status", "OCR: checking runtime…");
			try {
				const config = await ensureConfigFile();
				const selected = config.backends[config.backend];
				const pythonPath = selected?.type === "rapidocr" ? selected.pythonPath : undefined;
				const run = createPiCommandRunner(pi);
				const candidates = await resolvePythonCandidates({ run, configuredPath: pythonPath });
				const runtimes = await inspectPythonCandidates({ run, candidates });
				ctx.ui.notify(formatStatus(config.backend, selected, runtimes), runtimes.some((runtime) => runtime.ready) ? "info" : "warning");
			} catch (error) {
				ctx.ui.notify(formatOcrError(error), "error");
			} finally {
				ctx.ui.setStatus("ocr-status", undefined);
			}
		},
	});
}

async function runWithLoader(
	ctx: ExtensionCommandContext,
	message: string,
	operation: (signal: AbortSignal) => Promise<PythonRuntime>,
): Promise<InstallOutcome> {
	return ctx.ui.custom<InstallOutcome>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(tui, theme, message);
		let finished = false;
		const finish = (value: InstallOutcome) => {
			if (finished) return;
			finished = true;
			done(value);
		};
		loader.onAbort = () => finish({ cancelled: true });
		operation(loader.signal)
			.then((runtime) => finish({ runtime }))
			.catch((error: unknown) => finish({ error }));
		return loader;
	});
}

function unwrapOutcome(outcome: InstallOutcome, ctx: ExtensionCommandContext): PythonRuntime | undefined {
	if (outcome.cancelled) {
		ctx.ui.notify("OCR setup cancelled. The private environment may be incomplete; rerun /ocr-setup to repair it.", "warning");
		return undefined;
	}
	if (outcome.error) throw outcome.error;
	if (!outcome.runtime) throw new OcrError("BACKEND_UNAVAILABLE", "OCR setup ended without a validated runtime.");
	return outcome.runtime;
}

async function verifyRapidOcrRuntime(
	run: CommandRunner,
	runtime: PythonRuntime,
	config: RapidOcrBackendConfig,
	signal?: AbortSignal,
): Promise<void> {
	const result = await run(runtime.executable, [...getRapidOcrHelperArgs(config), "--check"], {
		timeout: 10 * 60_000,
		signal,
	});
	if (result.code !== 0) {
		throw installError("RapidOCR imports succeeded but model initialization failed", result.stderr);
	}
}

export async function installManagedRuntime(
	run: CommandRunner,
	base: PythonRuntime,
	signal?: AbortSignal,
): Promise<PythonRuntime> {
	const venvResult = await run(base.executable, ["-m", "venv", "--clear", getManagedVenvDir()], {
		timeout: 120_000,
		signal,
	});
	if (venvResult.code !== 0) {
		throw installError("Failed to create the private Python environment", venvResult.stderr);
	}
	const managedPython = getManagedPythonPath();
	const installResult = await run(
		managedPython,
		["-m", "pip", "install", "--no-cache-dir", RAPIDOCR_REQUIREMENT, ONNXRUNTIME_REQUIREMENT],
		{ timeout: 15 * 60_000, signal },
	);
	if (installResult.code !== 0) {
		throw installError("Failed to install RapidOCR dependencies", installResult.stderr);
	}
	const runtime = await findReadyPython({
		run,
		candidates: [{ command: managedPython, args: [], label: "managed OCR environment" }],
		signal,
	});
	if (!runtime) {
		throw installError("The private Python environment was created but failed validation", installResult.stderr);
	}
	return runtime;
}

export function getManagedPythonPath(): string {
	return process.platform === "win32"
		? `${getManagedVenvDir()}\\Scripts\\python.exe`
		: `${getManagedVenvDir()}/bin/python`;
}

function getRapidConfig(value: unknown): RapidOcrBackendConfig {
	if (!value || typeof value !== "object" || !("type" in value) || value.type !== "rapidocr") {
		throw new OcrError("CONFIG_ERROR", "The 'rapidocr' backend is not configured.", {
			hint: `Add backends.rapidocr to ${getConfigPath()} or remove the file and run /ocr-setup again.`,
		});
	}
	return value as RapidOcrBackendConfig;
}

function formatReadyRuntime(runtime: PythonRuntime, heading: string): string {
	return [
		heading,
		`Python: ${runtime.executable}`,
		`Python version: ${runtime.pythonVersion}`,
		`RapidOCR: ${runtime.rapidocrVersion}`,
		`ONNX Runtime: ${runtime.onnxruntimeVersion}`,
	].join("\n");
}

function formatStatus(backendId: string, backend: unknown, runtimes: PythonRuntime[]): string {
	const lines = [
		`OCR config: ${getConfigPath()}`,
		`Selected backend: ${backendId}`,
		`Backend config: ${JSON.stringify(backend)}`,
		"Python runtimes:",
	];
	if (runtimes.length === 0) lines.push("- No compatible Python command was found. Run /ocr-setup.");
	for (const runtime of runtimes) {
		lines.push(
			`- ${runtime.ready ? "ready" : "incomplete"}: ${runtime.executable} ` +
				`(Python ${runtime.pythonVersion}, RapidOCR ${runtime.rapidocrVersion ?? "missing"}, ONNX Runtime ${runtime.onnxruntimeVersion ?? "missing"})`,
		);
	}
	return lines.join("\n");
}

function installError(message: string, stderr: string): OcrError {
	const detail = stderr.trim().split(/\r?\n/).slice(-20).join("\n");
	return new OcrError("BACKEND_UNAVAILABLE", `${message}.${detail ? `\n\n${detail}` : ""}`, {
		hint: `No global packages were changed. Check network/proxy settings and run /ocr-setup again. Config: ${getConfigPath()}`,
	});
}
