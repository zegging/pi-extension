# Changelog

All notable changes to `pi-elasticsearch-http` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

### Changed

### Fixed

### Technical

## [0.1.0] — 2026-07-09

### Added
- Initial `pi-elasticsearch-http` Pi extension.
- `es_http` tool supporting `file + name`, `file + all`, and single-request `raw` input modes.
- Minimal `.http` / `.rest` parser with `###` separators, `# @name`, headers, body, JSON/NDJSON text, comments, and `{{variable}}` replacement.
- Workspace file boundary checks, origin validation, protected-header rejection, timeout handling, manual redirects, and no automatic retries.
- Conservative risk classifier with read-only allowlist, write confirmations, high-risk endpoint detection, and non-interactive refusal for confirm-required requests.
- Profile management command `/es-http add|list|default|remove|test`.
- Extension-specific config/auth files under `~/.pi/agent/es-http/`.
- Response truncation and temp-file full output path for truncated responses.
