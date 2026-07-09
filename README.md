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

## Publishing

Validate package contents without publishing:

```bash
npm run publish:dry
# or one package only
npm run publish:dry -- pi-elasticsearch-http
```

Publish public npm packages that are not already published at their current version:

```bash
npm run publish
# or one package only
npm run publish -- pi-elasticsearch-http
```

The publish script is modeled on `~/project/pi/scripts/publish.mjs`:

1. Discover publishable packages under `packages/*` (`private !== true`).
2. Validate required npm/Pi package metadata.
3. Check whether `<name>@<version>` is already on npm.
4. Run `npm pack --dry-run --ignore-scripts --json` and show packed files.
5. On real publish, run `npm publish --access public --provenance --ignore-scripts`.

## Installing published extensions

```bash
# latest npm version
pi install npm:pi-elasticsearch-http

# pinned npm version
pi install npm:pi-elasticsearch-http@0.1.0

# try without installing permanently
pi -e npm:pi-elasticsearch-http@0.1.0
```

## Root scripts

| Command | What it does |
|---|---|
| `npm run clean` | `clean` in every workspace that defines it |
| `npm run build` | `build` in every workspace that defines it |
| `npm run check` | per-package `check` + root-level `tsc --noEmit` |
| `npm run test` | `vitest` per workspace |
| `npm run new -- <name>` | scaffold `packages/<name>/` |
| `npm run publish:dry [-- <pkg>]` | validate npm package contents |
| `npm run publish [-- <pkg>]` | publish package(s) to npm |
| `npm run release -- <pkg> <bump>` | version/changelog/tag helper for one package |
