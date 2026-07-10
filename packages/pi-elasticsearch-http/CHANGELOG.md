# Changelog

All notable changes to `pi-elasticsearch-http` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] — 2026-07-10

### Added
- `es_http_profiles` read-only tool that returns sanitized profile metadata (default profile, base URL, auth type, basic-auth username, timeout, header names) so agents can discover configured profiles without inspecting `~/.pi/agent/es-http/auth.json`.

### Changed
- Shared profile listing/formatting between `/es-http list` and the new `es_http_profiles` tool via `src/profiles.ts`.

### Fixed
- Confirmation preview for high-risk `es_http` requests now wraps long request lines (URLs, headers, body) instead of truncating them via `truncateToWidth`, so the exact request stays reviewable.
- `es_http` tool output now honors Pi's `ctrl+o` tool-output collapse/expand toggle: collapsed mode shows the HTTP status and truncation notice, while expanded mode shows the full formatted response.

### Technical
- Added regression tests for `frameConfirmLines` wrapping behaviour, `es_http` collapsed/expanded result rendering, and `summarizeProfiles` / `formatProfileListing` sanitization.

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
