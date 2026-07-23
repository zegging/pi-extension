import { OcrError } from "./errors.ts";
import { CommandOcrBackend } from "./backends/command.ts";
import { RapidOcrBackend } from "./backends/rapidocr.ts";
import type { CommandRunner } from "./python-runtime.ts";
import type { OcrBackend, OcrBackendConfig } from "./types.ts";

interface BackendEntry {
	fingerprint: string;
	backend: OcrBackend;
}

export class BackendRegistry {
	private readonly entries = new Map<string, BackendEntry>();

	constructor(private readonly run: CommandRunner) {}

	async get(id: string, config: OcrBackendConfig, timeoutMs: number): Promise<OcrBackend> {
		const fingerprint = JSON.stringify({ config, timeoutMs });
		const current = this.entries.get(id);
		if (current?.fingerprint === fingerprint) return current.backend;
		if (current) await current.backend.dispose();

		const backend = this.create(id, config, timeoutMs);
		this.entries.set(id, { fingerprint, backend });
		return backend;
	}

	async dispose(): Promise<void> {
		const backends = [...this.entries.values()].map((entry) => entry.backend);
		this.entries.clear();
		await Promise.all(backends.map((backend) => backend.dispose()));
	}

	private create(id: string, config: OcrBackendConfig, timeoutMs: number): OcrBackend {
		switch (config.type) {
			case "rapidocr":
				return new RapidOcrBackend(id, config, timeoutMs, this.run);
			case "command":
				return new CommandOcrBackend(id, config, timeoutMs);
			default:
				throw new OcrError("BACKEND_NOT_FOUND", `Unsupported OCR backend type: ${(config as { type?: unknown }).type}`);
		}
	}
}
