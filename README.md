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

All publishing commands in this section target the official npm registry:

```text
https://registry.npmjs.org/
```

### First publication of a new npm package

A package cannot normally use npm Trusted Publishing until it exists on npm and its Trusted Publisher has been configured. The first version therefore needs one authenticated maintainer publication.

1. Finish the package metadata, tests, README, and `[Unreleased]` changelog. Ensure `package.json` contains:

   ```json
   {
     "publishConfig": {
       "access": "public",
       "registry": "https://registry.npmjs.org/"
     }
   }
   ```

2. Run the repository checks and inspect the package contents:

   ```bash
   npm test
   npm run check
   npm pack --dry-run --ignore-scripts --workspace <npm-package-name>
   ```

3. Commit the implementation. For an initial `0.1.0` release, a new package may be staged at `0.0.0`, then released with:

   ```bash
   npm run release -- <package-directory> minor
   ```

   The helper creates and pushes `<package-directory>@v0.1.0`. The first tag workflow may fail to publish with npm `E404` because Trusted Publishing is not configured yet; this does not invalidate the release commit or tag.

4. Authenticate directly with the official npm registry. Complete browser authentication and 2FA locally—never paste the OTP, access token, `.npmrc`, or temporary authentication URL into documentation, issues, logs, or chat:

   ```bash
   npm login --auth-type=web --registry https://registry.npmjs.org/
   npm whoami --registry https://registry.npmjs.org/
   ```

5. Publish from the **package directory**, not the private monorepo root:

   ```bash
   cd packages/<package-directory>
   npm publish --access public --ignore-scripts --registry https://registry.npmjs.org/
   ```

6. Verify the package and visibility. A new package can take a few minutes to appear in registry reads even after `npm publish` reports success:

   ```bash
   npm access get status <npm-package-name> --registry https://registry.npmjs.org/
   npm view <npm-package-name>@0.1.0 version --registry https://registry.npmjs.org/
   ```

7. In the package settings on npmjs.com, add a GitHub Actions Trusted Publisher using non-secret repository metadata:

   ```text
   GitHub owner: <github-owner-or-organization>
   Repository: <repository-name>
   Workflow file: publish-npm.yml
   Environment: <only when the workflow uses one>
   ```

   Do not store an npm token in the repository for the normal release path. Trusted Publishing uses GitHub OIDC and the workflow's `id-token: write` permission.

### Subsequent releases

After Trusted Publishing is configured, use the package-scoped release helper:

```bash
# choose patch | minor | major | explicit x.y.z
npm run release -- <package-directory> patch
```

The helper:

1. refuses a dirty worktree;
2. bumps only the selected package version;
3. promotes its `[Unreleased]` changelog;
4. runs package `check`, `test`, and `npm pack --dry-run`;
5. creates the release commit and `<package-directory>@vX.Y.Z` tag;
6. opens the next `[Unreleased]` section;
7. pushes the branch and tag.

The tag triggers `.github/workflows/publish-npm.yml`, which publishes through npm Trusted Publishing with provenance. Ensure the workflow recognizes the package's tag pattern and maps it to the correct npm package name.

Verify GitHub Actions and npm afterward:

```bash
gh run list --workflow publish-npm.yml --limit 5
npm view <npm-package-name> version --registry https://registry.npmjs.org/
npm view <npm-package-name>@<version> version --registry https://registry.npmjs.org/
```

Manual fallback is only for an intentional Trusted Publishing bypass:

```bash
npm run publish:dry -- <package-directory>
npm run publish -- <package-directory>
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
