# pi-extension

Monorepo of internal [pi](https://pi.dev/) extensions maintained by Qunhe.

Each package under `packages/*` is an **independently versioned pi extension**
distributed via **git tags** (no npm publish). Consumers install via
`pi install git:...@<pkg>@<tag>`.

## Layout

```
pi-extension/
├── package.json          # npm workspaces = packages/*
├── tsconfig.base.json    # shared strict TS config
├── tsconfig.json         # root type-check (references all packages)
├── vitest.config.ts      # root test runner (each pkg can override)
├── scripts/
│   ├── release.mjs       # bump + tag + push one package
│   └── new-package.mjs   # scaffold a new packages/<name>
└── packages/
    └── <name>/           # one pi extension per directory
        ├── package.json  # private, "pi.extensions", peerDeps on pi
        ├── tsconfig.json # extends ../../tsconfig.base.json
        ├── vitest.config.ts
        ├── README.md
        ├── CHANGELOG.md
        ├── src/
        └── tests/
```

## Design decisions

- **Multi-package isolation** — mirrors `~/project/pi`'s `packages/*` workspace
  layout. Each package has its own `package.json`, `tsconfig.json`,
  `vitest.config.ts`, `CHANGELOG.md`, and version number. The root only wires
  workspaces, shared TS config, and release tooling.
- **Git-tag releases (no npm publish)** — mirrors `~/project/qunhe-provider`.
  Every package is `"private": true`; the git tag *is* the release marker.
- **Scoped tag names** — because a single repo hosts many packages, tags are
  namespaced: `<pkg>@vX.Y.Z` (immutable) and `<pkg>@latest` (force-moved on
  each release). This prevents `v0.1.3` collisions between packages.
- **Peer-dep on pi** — packages depend on `@earendil-works/pi-ai` and
  `@earendil-works/pi-coding-agent` as `peerDependencies` (`"*"`), so the pi
  runtime provides the API and versions never conflict.

## Adding a new extension

```bash
npm run new -- my-extension
npm install
# edit packages/my-extension/src/index.ts
pi -e ./packages/my-extension          # local dev
```

## Releasing

```bash
# from the monorepo root, working tree must be clean:
npm run release -- <pkg> patch     # or: minor | major | 1.2.3
```

The script (see `scripts/release.mjs`) does — for that one package only:

1. Assert the working directory is clean.
2. Bump `packages/<pkg>/package.json` version.
3. Promote `## [Unreleased]` → `## [x.y.z] — <date>` in that package's `CHANGELOG.md`.
4. Run `npm run check` + `npm test` inside that package.
5. Commit + create tag `<pkg>@vX.Y.Z` + force-move `<pkg>@latest`.
6. Insert a fresh `## [Unreleased]` scaffold and commit it.
7. Push branch + version tag + latest tag.

No CI is triggered, no npm registry is contacted.

## Installing a released extension

```bash
# always-current release for a specific package
pi install git:gitlab.qunhequnhe.com/huiti/pi-extension@<pkg>@latest

# pinned version (reproducible setups)
pi install git:gitlab.qunhequnhe.com/huiti/pi-extension@<pkg>@v0.1.0

# untagged master (bleeding edge)
pi install git:gitlab.qunhequnhe.com/huiti/pi-extension

# SSH (avoids credential prompts)
pi install git:git@gitlab.qunhequnhe.com:huiti/pi-extension@<pkg>@latest
```

## Root scripts

| Command                           | What it does                                          |
| --------------------------------- | ----------------------------------------------------- |
| `npm run clean`                   | `clean` in every workspace that defines it            |
| `npm run build`                   | `build` in every workspace that defines it            |
| `npm run check`                   | per-package `check` + root-level `tsc --noEmit`       |
| `npm run test`                    | `vitest` per workspace (each package owns its config) |
| `npm run new -- <name>`           | scaffold `packages/<name>/`                           |
| `npm run release -- <pkg> <bump>` | tag + push one package                                |
