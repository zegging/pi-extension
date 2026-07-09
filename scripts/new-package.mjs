#!/usr/bin/env node
/**
 * Scaffold a new pi extension package under packages/<name>/.
 *
 * Layout produced:
 *   packages/<name>/
 *     package.json      — private, "pi.extensions" entry, peerDeps on pi
 *     tsconfig.json     — extends ../../tsconfig.base.json
 *     vitest.config.ts  — per-package overrides
 *     README.md         — install/usage template
 *     CHANGELOG.md      — Keep-a-Changelog format with [Unreleased] section
 *     src/index.ts      — default-exported pi entry stub
 *     tests/.gitkeep
 *
 * Usage:
 *   node scripts/new-package.mjs <name>
 *   npm run new -- <name>
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const NAME = process.argv[2];
if (!NAME || !/^[a-z0-9][a-z0-9-]*$/.test(NAME)) {
	console.error("Usage: node scripts/new-package.mjs <name>");
	console.error("  <name> must be kebab-case (a-z, 0-9, -).");
	process.exit(1);
}

const DIR = resolve("packages", NAME);
if (existsSync(DIR)) {
	console.error(`Error: ${DIR} already exists.`);
	process.exit(1);
}

mkdirSync(resolve(DIR, "src"), { recursive: true });
mkdirSync(resolve(DIR, "tests"), { recursive: true });

const pkg = {
	name: NAME,
	version: "0.1.0",
	private: true,
	type: "module",
	keywords: ["pi-package", "pi-extension"],
	description: `${NAME} pi extension.`,
	scripts: {
		clean: "echo 'nothing to clean'",
		build: "echo 'nothing to build'",
		check: "tsc --noEmit",
		test: "vitest run",
		"test:watch": "vitest",
		"test:coverage": "vitest run --coverage",
	},
	pi: {
		extensions: ["./src/index.ts"],
	},
	peerDependencies: {
		"@earendil-works/pi-ai": "*",
		"@earendil-works/pi-coding-agent": "*",
	},
};
writeFileSync(resolve(DIR, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

writeFileSync(
	resolve(DIR, "tsconfig.json"),
	JSON.stringify(
		{
			extends: "../../tsconfig.base.json",
			include: ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
		},
		null,
		2,
	) + "\n",
);

writeFileSync(
	resolve(DIR, "vitest.config.ts"),
	`import { defineConfig } from "vitest/config";

export default defineConfig({
\ttest: {
\t\tglobals: true,
\t\tenvironment: "node",
\t\tinclude: ["tests/**/*.test.ts"],
\t\tcoverage: {
\t\t\tprovider: "v8",
\t\t\treporter: ["text", "html"],
\t\t\tinclude: ["src/**/*.ts"],
\t\t},
\t\ttestTimeout: 15_000,
\t},
});
`,
);

writeFileSync(
	resolve(DIR, "src/index.ts"),
	`import type { PiExtension } from "@earendil-works/pi-coding-agent";

const extension: PiExtension = {
\tname: "${NAME}",
\tasync start(pi) {
\t\t// TODO: register providers, commands, hooks, tools here.
\t},
};

export default extension;
`,
);

writeFileSync(
	resolve(DIR, "README.md"),
	`# ${NAME}

Pi extension: **${NAME}**.

## Install

From this monorepo during development:

\`\`\`bash
pi -e ./packages/${NAME}
\`\`\`

As a git-distributed pi package (pinned to a release tag):

\`\`\`bash
# always-current release
pi install git:gitlab.qunhequnhe.com/huiti/pi-extension@${NAME}@latest

# pinned version (reproducible)
pi install git:gitlab.qunhequnhe.com/huiti/pi-extension@${NAME}@v0.1.0
\`\`\`

Tags are namespaced as \`<pkg>@vX.Y.Z\` so multiple packages coexist in one repo.
Re-run \`pi install ...@${NAME}@latest\` to pick up new releases without editing config.

## Release

\`\`\`bash
# from the monorepo root:
npm run release -- ${NAME} patch
\`\`\`

See \`../../README.md\` for the full release workflow.
`,
);

writeFileSync(
	resolve(DIR, "CHANGELOG.md"),
	`# Changelog

All notable changes to \`${NAME}\` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

### Changed

### Fixed

### Technical

## [0.1.0] — ${new Date().toISOString().slice(0, 10)}

### Added
- Initial scaffold.
`,
);

writeFileSync(resolve(DIR, "tests/.gitkeep"), "");

console.log(`\n✓ Created packages/${NAME}/`);
console.log("\nNext steps:");
console.log(`  1. Edit packages/${NAME}/src/index.ts`);
console.log("  2. npm install                       # link the new workspace");
console.log(`  3. pi -e ./packages/${NAME}          # test locally`);
console.log(`  4. npm run release -- ${NAME} patch  # when ready to tag`);
