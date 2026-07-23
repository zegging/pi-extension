# @zegging/pi-ocr-local

Local image-to-text OCR for [Pi](https://pi.dev). It gives both people and the LLM access to the same configurable OCR service:

- `/ocr <absolute-image-path>` recognizes one image and places the text back in Pi's editor for review.
- `ocr_image` is an LLM-callable tool.
- `/ocr-setup` explicitly creates a private RapidOCR Python environment when the machine does not already have a compatible runtime.
- `/ocr-status` prints the config path, selected backend, interpreter, and dependency versions.

OCR results are never cached. The default backend runs locally with PP-OCRv6 tiny, two CPU threads, no angle-classification model, and an idle timeout that releases the Python process after 30 seconds.

## Install

From the official npm registry:

```bash
pi install npm:@zegging/pi-ocr-local
```

Local development from this monorepo:

```bash
pi install ./packages/pi-ocr-local
```

For a one-off development run:

```bash
pi -e ./packages/pi-ocr-local
```

Restart Pi after a local package install, then run:

```text
/ocr-status
/ocr-setup
```

`/ocr-setup` is the only operation that installs Python packages. Normal Pi startup and `/ocr` never run `pip`.

## Python requirements

The extension first checks, in order:

1. `pythonPath` explicitly stored in the config;
2. `python`, `python3`, and on Windows `py -3`;
3. already-installed uv-managed Python versions, preferring 3.12 and 3.11;
4. the extension-managed environment under Pi's agent directory.

uv discovery uses `uv python list --only-installed --output-format json --no-python-downloads`, so probing never downloads Python or creates a project environment. Compatible CPython entries are sorted by preference, then their absolute interpreter paths are probed directly and can be used as the base for the private OCR environment.

A directly reused interpreter must provide:

- Python `>=3.8,<4`;
- `rapidocr>=3.9,<4`;
- `onnxruntime>=1.20,<2`.

If an existing Python version is compatible but those packages are missing, `/ocr-setup` asks for confirmation and creates:

```text
<pi-agent-dir>/ocr/python/
```

It installs the dependencies there with `pip --no-cache-dir`; it never changes the global Python environment. Setup then initializes the configured PP-OCRv6 model so downloads and compatibility errors are reported inside the cancellable setup UI instead of during the first `/ocr` call. A virtual environment still requires a base Python installation. If none is available, run `uv python install 3.12` (when uv is installed), or install Python 3.11/3.12 from python.org, then rerun `/ocr-setup`.

## Paste a clipboard image into `/ocr`

Pi writes a pasted clipboard image to a temporary file and inserts its absolute path into the editor.

1. Type `/ocr `, including the trailing space.
2. On Windows press `Alt+V`; on Linux/macOS press `Ctrl+V`.
3. Press Enter.
4. Review the recognized text that `/ocr` places back in the editor, add your question, and submit normally.

The slash command deliberately accepts exactly one absolute path. It does not parse `@` references, relative paths, quotes, flags, or URLs.

## Recognition example

Source image:

![Pi homepage OCR example](./assets/ocr-pi-homepage.png)

Result produced by the default local PP-OCRv6 tiny backend:

```text
F
HOME
DOCUMENTATION
NEWS
PACKAGES
MODELS
P
There are many agent harnesses
but this one is yours
Pi is a minimal agent harness.
Adapt Pi to your workflows, not the other way around.
CURL
POWERSHELL
NPM
PNPM
BUN
$ powershell -c "irm https://pi.dev/install.ps1 | iex"
[COPY]
PI
MANIPULATE THE WEBSITE ●
$ SCROLL TO CONTINUE
pi v0.68.1
escape interrupt · ctrl+c/ctrl+d clear/exit . / commands .! bash . ctrl+o more
Press ctrl+o to show full startup help and loaded resources.
Pi can explain its own features and look up its docs. Ask it how to use or extend
Pi.
[Context]
AGENTS.md
~/Development/pi.dev (main)
$0.000(sub) 0.0%/128k(auto)
(github-copilot) grok-code-fast-1· thinking of
```

The text is shown verbatim, including imperfect logo recognition (`F`, `P`) and layout-dependent line breaks.

### CPU and memory profile

The example above was also used for a cold-helper measurement on Windows. Model files were already installed, but no OCR helper process was alive when `ocr_image` was called.

Measurement conditions:

- source image: 2680×1893 PNG;
- backend: PP-OCRv6 tiny, `threads: 2`, `maxImageSide: 1600`;
- runtime: uv-managed CPython 3.12.12 through the extension's private venv;
- machine: 16 logical processors;
- sampling: Windows process cumulative CPU, working set, private bytes, and thread count approximately every 100 ms.

| Time after process appeared | CPU time used | Working set | Private bytes | Threads | Observation |
| ---: | ---: | ---: | ---: | ---: | --- |
| 0 ms | 0.000 s | 13.4 MiB | 8.1 MiB | 4 | Interpreter startup |
| 283 ms | 0.109 s | 48.3 MiB | 68.3 MiB | 5 | Imports/model initialization |
| 533 ms | 0.250 s | 107.7 MiB | 122.0 MiB | 11 | Image/model data loading |
| 785 ms | 0.438 s | **388.4 MiB** | **408.2 MiB** | 11 | Transient memory peak |
| 1,035 ms | 0.781 s | 150.0 MiB | 156.9 MiB | 28 | Recognition finishing |
| 1,287 ms | 1.047 s | 146.2 MiB | 152.7 MiB | 28 | CPU activity settled |
| 30,002 ms | 1.047 s | 146.2 MiB | 152.7 MiB | 28 | Waiting for configured idle timeout |

The heaviest one-second window used about **106.5% of one CPU core**, equivalent to **6.7% of the whole 16-logical-processor machine**. The real interpreter peaked at 388.4 MiB working set; the Windows venv launcher added about 4.0 MiB, making the observed combined peak approximately **392.4 MiB**. After recognition, the initialized helper retained about **150 MiB** until `idleTimeoutMs: 30000` expired, and both processes exited after roughly 31 seconds.

These figures describe one run on one machine and should be treated as an indicative profile rather than a fixed resource guarantee. Smaller images, warm helpers, model choice, ONNX Runtime, and CPU topology can change the result.

## Configuration

The editable JSON config is stored at:

```text
<getAgentDir()>/ocr/config.json
```

The base directory is resolved exclusively through Pi's exported `getAgentDir()` API; the extension does not assume or hardcode `~/.pi/agent`. `/ocr-status` shows the resolved path. `/ocr-setup` creates the file if absent and records the resolved interpreter after successful validation.

Default configuration:

```json
{
  "backend": "rapidocr",
  "timeoutMs": 30000,
  "backends": {
    "rapidocr": {
      "type": "rapidocr",
      "model": "tiny",
      "threads": 2,
      "maxImageSide": 1600,
      "idleTimeoutMs": 30000
    }
  }
}
```

After setup, `pythonPath` is added:

```json
{
  "type": "rapidocr",
  "pythonPath": "C:\\absolute\\path\\to\\python.exe",
  "model": "tiny",
  "threads": 2,
  "maxImageSide": 1600,
  "idleTimeoutMs": 30000
}
```

Changes are read before each OCR operation. Changing backend settings disposes the old adapter before the replacement is used.

### Resource controls

- `model`: `tiny` (default) or `small`.
- `threads`: ONNX Runtime intra-op CPU thread count.
- `maxImageSide`: RapidOCR preprocessing limit. Lower values reduce temporary memory but may hurt small-text accuracy.
- `idleTimeoutMs`: keep the initialized helper alive after a request. Set to `0` to exit immediately.
- `timeoutMs`: maximum time for one backend request.

`/ocr-setup` initializes the configured model and may download model files managed by RapidOCR. Changing to a model that has not been prepared can likewise download it on first use. Model files are runtime dependencies, not OCR-result caches.

## Custom command backend

The adapter layer also supports a user-configured persistent JSONL process:

```json
{
  "backend": "custom",
  "timeoutMs": 30000,
  "backends": {
    "custom": {
      "type": "command",
      "command": "/absolute/path/to/my-ocr",
      "args": ["--jsonl"],
      "env": {},
      "idleTimeoutMs": 30000
    }
  }
}
```

Request on stdin:

```json
{"id":"ocr-123","method":"recognize","imagePath":"/absolute/image.png"}
```

Success response on stdout:

```json
{
  "id": "ocr-123",
  "ok": true,
  "result": {
    "text": "recognized text",
    "blocks": [
      {
        "text": "recognized text",
        "confidence": 0.98,
        "polygon": [[10, 10], [200, 10], [200, 40], [10, 40]]
      }
    ],
    "metadata": {
      "model": "my-model",
      "durationMs": 120
    }
  }
}
```

Errors use `{ "id": "...", "ok": false, "error": { "message": "..." } }`. Protocol messages must be the only content written to stdout; diagnostics belong on stderr.

There is no automatic backend fallback. If the selected backend fails, the command/tool returns a detailed error and points to `/ocr-status`, `/ocr-setup`, and the config path.

## Development

```bash
npm --prefix packages/pi-ocr-local run check
npm --prefix packages/pi-ocr-local test
npm pack --dry-run --ignore-scripts --workspace @zegging/pi-ocr-local
```
