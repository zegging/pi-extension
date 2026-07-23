import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { OcrError } from "../errors.ts";

interface PendingRequest {
	resolve(value: unknown): void;
	reject(error: Error): void;
	timer: NodeJS.Timeout;
	removeAbortListener?: () => void;
}

export class JsonlProcessClient {
	private child?: ChildProcessWithoutNullStreams;
	private readonly pending = new Map<string, PendingRequest>();
	private requestSequence = 0;
	private idleTimer?: NodeJS.Timeout;
	private stderrTail = "";

	constructor(
		private readonly command: string,
		private readonly args: string[],
		private readonly env: Record<string, string>,
		private readonly timeoutMs: number,
		private readonly idleTimeoutMs: number,
	) {}

	async request(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
		if (signal?.aborted) throw new OcrError("CANCELLED", "OCR was cancelled.");
		this.clearIdleTimer();
		const child = this.ensureProcess();
		const id = `ocr-${process.pid}-${++this.requestSequence}`;
		return new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				this.stopProcess();
				reject(new OcrError("TIMEOUT", `OCR backend timed out after ${this.timeoutMs} ms.`));
			}, this.timeoutMs);
			const pending: PendingRequest = { resolve, reject, timer };
			if (signal) {
				const onAbort = () => {
					this.pending.delete(id);
					clearTimeout(timer);
					this.stopProcess();
					reject(new OcrError("CANCELLED", "OCR was cancelled."));
				};
				signal.addEventListener("abort", onAbort, { once: true });
				pending.removeAbortListener = () => signal.removeEventListener("abort", onAbort);
			}
			this.pending.set(id, pending);
			child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`, (error) => {
				if (error) this.failRequest(id, backendUnavailable(`Failed to write to OCR backend: ${error.message}`));
			});
		});
	}

	async dispose(): Promise<void> {
		this.clearIdleTimer();
		this.stopProcess();
	}

	private ensureProcess(): ChildProcessWithoutNullStreams {
		if (this.child && !this.child.killed) return this.child;
		this.stderrTail = "";
		const child = spawn(this.command, this.args, {
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
			env: { ...process.env, ...this.env },
		});
		this.child = child;
		readline.createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => this.handleLine(line));
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			this.stderrTail = `${this.stderrTail}${chunk}`.slice(-16_384);
		});
		child.on("error", (error) => this.failAll(backendUnavailable(`Could not start OCR backend '${this.command}': ${error.message}`)));
		child.on("close", (code) => {
			if (this.child === child) this.child = undefined;
			if (this.pending.size > 0) {
				const details = this.stderrTail.trim();
				this.failAll(backendUnavailable(`OCR backend exited with code ${code}.${details ? `\n\n${details}` : ""}`));
			}
		});
		return child;
	}

	private handleLine(line: string): void {
		let response: unknown;
		try {
			response = JSON.parse(line) as unknown;
		} catch {
			this.failAll(new OcrError("BACKEND_PROTOCOL_ERROR", `OCR backend returned invalid JSON: ${line}`));
			this.stopProcess();
			return;
		}
		if (!isRecord(response) || typeof response.id !== "string") {
			this.failAll(new OcrError("BACKEND_PROTOCOL_ERROR", "OCR backend response is missing a request id."));
			this.stopProcess();
			return;
		}
		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		clearTimeout(pending.timer);
		pending.removeAbortListener?.();
		if (response.ok === true) pending.resolve(response.result);
		else {
			const message = isRecord(response.error) && typeof response.error.message === "string"
				? response.error.message
				: "OCR backend reported an unknown error.";
			pending.reject(new OcrError("RECOGNITION_FAILED", message));
		}
		if (this.pending.size === 0) this.scheduleIdleStop();
	}

	private failRequest(id: string, error: Error): void {
		const pending = this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id);
		clearTimeout(pending.timer);
		pending.removeAbortListener?.();
		pending.reject(error);
	}

	private failAll(error: Error): void {
		for (const id of [...this.pending.keys()]) this.failRequest(id, error);
	}

	private scheduleIdleStop(): void {
		if (this.idleTimeoutMs === 0) {
			this.stopProcess();
			return;
		}
		this.idleTimer = setTimeout(() => this.stopProcess(), this.idleTimeoutMs);
		this.idleTimer.unref?.();
	}

	private clearIdleTimer(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = undefined;
	}

	private stopProcess(): void {
		const child = this.child;
		this.child = undefined;
		if (child && !child.killed) child.kill();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function backendUnavailable(message: string): OcrError {
	return new OcrError("BACKEND_UNAVAILABLE", message, {
		hint: "Run /ocr-status for diagnostics. For RapidOCR, run /ocr-setup to create or repair the private environment.",
	});
}
