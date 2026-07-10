# pi-extension

Monorepo of [pi](https://pi.dev/) extension packages.

Each package under `packages/*` is an independently versioned Pi package intended for npm distribution. The root repo is private-to-publishing (`private: true`); individual packages decide whether they are publishable.

## Layout

```text
pi-extension/
├── package.json          # npm workspaces = packages/*
├── tsconfig.base.json    # shared strict TS config
├── tsconfig.json         # root type-check
├── vitest.config.ts      # root test runner
├── scripts/
│   ├── publish.mjs       # npm pack validation + npm publish
│   ├── release.mjs       # version/changelog/tag helper
│   └── new-package.mjs   # scaffold a new packages/<name>
└── packages/
    └── <name>/           # one Pi extension package per directory
        ├── package.json  # npm metadata + "pi.extensions"
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── README.md
        ├── CHANGELOG.md
        ├── src/
        └── tests/
```

## Design decisions

- **Workspace isolation** — mirrors `~/project/pi`'s `packages/*` layout. Each package owns its version, changelog, tests, and npm metadata.
- **npm-first distribution** — consumers install with `pi install npm:<package>@<version>`.
- **No bundled Pi core packages** — packages that import Pi APIs declare Pi packages and `typebox` as `peerDependencies` with `"*"`, following Pi package docs.
- **Reviewable local smoke files** — real cluster request files live under `requests/` and are ignored by `requests/.gitignore`.

## Local development

```bash
npm install
npm test
npm run check

# run one extension from source
pi -e ./packages/pi-elasticsearch-http
```

## Adding a new extension

```bash
npm run new -- my-extension
npm install
pi -e ./packages/my-extension
```

Before publishing, fill in the generated package metadata (`description`, `repository`, `license`, etc.).

## Release and publishing

Canonical release path for `pi-elasticsearch-http`:

```bash
# choose patch | minor | major | explicit x.y.z
npm run release -- pi-elasticsearch-http minor
```

The release helper bumps the package version, promotes `CHANGELOG.md`, runs package `check` / `test` / `npm pack --dry-run`, creates the release commit and tag (`pi-elasticsearch-http@vX.Y.Z`), opens the next `[Unreleased]` section, then pushes the branch and tag.

Pushing the tag triggers `.github/workflows/publish-npm.yml`, which publishes `@zegging/pi-elasticsearch-http` to npm through Trusted Publishing. Do not run local `npm publish` for the normal path.

Verify the published version after GitHub Actions completes:

```bash
npm view @zegging/pi-elasticsearch-http version --registry https://registry.npmjs.org/
```

Manual fallback only when intentionally bypassing GitHub Actions / Trusted Publishing:

```bash
npm run publish:dry -- pi-elasticsearch-http
npm run publish -- pi-elasticsearch-http
```

See `AGENTS.md` for the full maintainer/agent release checklist.

## Installing published extensions

```bash
# latest npm version
pi install npm:@zegging/pi-elasticsearch-http

# pinned npm version
pi install npm:@zegging/pi-elasticsearch-http@0.1.1

# try without installing permanently
pi -e npm:@zegging/pi-elasticsearch-http@0.1.1
```

## Root scripts

| Command | What it does |
|---|---|
| `npm run clean` | `clean` in every workspace that defines it |
| `npm run build` | `build` in every workspace that defines it |
| `npm run check` | per-package `check` + root-level `tsc --noEmit` |
| `npm run test` | `vitest` per workspace |
| `npm run new -- <name>` | scaffold `packages/<name>/` |
| `npm run release -- <pkg> <bump>` | preferred package release flow: version/changelog/check/test/pack/commit/tag/push |
| `npm run publish:dry [-- <pkg>]` | validate npm package contents; manual fallback path |
| `npm run publish [-- <pkg>]` | manually publish package(s) to npm; normally GitHub Actions publishes from tags |
