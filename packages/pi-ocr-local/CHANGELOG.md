# Changelog

All notable changes to `@zegging/pi-ocr-local` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `/ocr <absolute-image-path>` command that recognizes a local image and places the text in Pi's editor.
- `ocr_image` LLM tool with sequential execution and Pi-standard output truncation.
- RapidOCR PP-OCRv6 tiny/small backend using an on-demand Python JSONL helper.
- `/ocr-setup` for explicit, confirmed installation into a private virtual environment without modifying global Python packages.
- `/ocr-status` with config, interpreter, and dependency diagnostics.
- Editable config under Pi's agent directory with CPU thread, image-size, model, timeout, and helper idle controls.
- Adapter registry and custom persistent JSONL command backend.
- Session-shutdown cleanup of all backend processes.
- README recognition example with its source image, verbatim PP-OCRv6 tiny output, and a sampled cold-helper CPU/memory profile.

### Changed
- Python discovery supports already-installed uv-managed interpreters via `--no-python-downloads`, preferring Python 3.12/3.11.

### Fixed

### Technical
- Uses Pi's `getAgentDir`, `pi.exec`, UI status/editor APIs, tool cancellation signal, and truncation utilities.
- OCR result caching is intentionally omitted.
