# AGENTS.md

This repository is a monorepo for Pi extension packages. Follow these notes when acting as a coding or release agent.

## Repository shape

- Root package is private and uses npm workspaces: `packages/*`.
- Each package is independently versioned and owns its own `package.json`, `README.md`, `CHANGELOG.md`, `src/`, and `tests/`.
- Packages include `packages/pi-elasticsearch-http` (`@zegging/pi-elasticsearch-http`) and `packages/pi-ocr-local` (`@zegging/pi-ocr-local`).

## Development checks

Run from the repository root unless a narrower package check is explicitly requested:

```bash
npm test
npm run check
```

For one package:

```bash
npm --prefix packages/<package-directory> test
npm --prefix packages/<package-directory> run check
```

## Release and publish workflow

Preferred release flow for a package:

```bash
# 1. Ensure worktree is clean and all intended code/docs are committed.
git status --short

# 2. Choose semver bump: patch | minor | major | explicit x.y.z.
# Use minor for new features/tools; patch for fixes/docs-only package releases.
npm run release -- pi-elasticsearch-http minor
# or
npm run release -- pi-ocr-local minor
```

`npm run release -- <pkg> <bump>` performs the release preparation:

1. Refuses a dirty worktree.
2. Bumps `packages/<pkg>/package.json`.
3. Promotes that package's `CHANGELOG.md` `[Unreleased]` section to `## [x.y.z] — YYYY-MM-DD`.
4. Runs package `check`, `test`, and `npm pack --dry-run --ignore-scripts`.
5. Commits `Release <pkg>@vX.Y.Z`.
6. Creates tag `<pkg>@vX.Y.Z`.
7. Opens the next `[Unreleased]` section and commits it.
8. Pushes the current branch and release tag.

Pushing a tag matching `pi-elasticsearch-http@v*` or `pi-ocr-local@v*` triggers `.github/workflows/publish-npm.yml`, which publishes the matching package to npm through npm Trusted Publishing. Do **not** run local `npm publish` for the normal path.

After running release, verify the GitHub Actions publish workflow completed and npm has the new version:

```bash
npm view @zegging/pi-elasticsearch-http version --registry https://registry.npmjs.org/
npm view @zegging/pi-elasticsearch-http@<version> version --registry https://registry.npmjs.org/
```

Manual fallback only if GitHub Actions / Trusted Publishing is intentionally bypassed:

```bash
npm run publish:dry -- pi-elasticsearch-http
npm run publish -- pi-elasticsearch-http
```

The publish script always uses `https://registry.npmjs.org/` so local npm registry defaults do not leak into release operations.

## Pre-release checklist

Before running `npm run release`:

- Working tree is clean, except intentional release changes are already committed.
- Package `CHANGELOG.md` `[Unreleased]` accurately summarizes user-facing changes.
- Package `README.md` examples are still current, especially pinned install versions if changed.
- `npm test` and `npm run check` pass at root.
- No local cluster endpoints, credentials, request smoke files, or secrets are added to git.

## Elasticsearch safety notes

- `requests/` contains local smoke files and must remain ignored unless the user explicitly asks to track a sanitized file.
- Never commit Elasticsearch credentials or auth storage from `~/.pi/agent/es-http/`.
- Use `es_http_profiles` to inspect profile metadata; it intentionally omits auth secrets and header values.
- For risky Elasticsearch write/delete requests, preserve confirmation semantics and default-to-No behavior.
