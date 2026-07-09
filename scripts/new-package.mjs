#!/usr/bin/env node
/**
 * Scaffold a new npm-publishable Pi extension package under packages/<name>/.
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
	description: `${NAME} Pi extension.`,
	type: "module",
	main: "./src/index.ts",
	files: ["src", "README.md", "CHANGELOG.md"],
	keywords: ["pi-package", "pi-extension"],
	license: "MIT",
	repository: {
		type: "git",
		url: "git+https://github.com/zegging/pi-extension.git",
		directory: `packages/${NAME}`,
	},
	publishConfig: {
		access: "public",
		registry: "https://registry.npmjs.org/",
	},
	scripts: {
		clean: "echo 'nothing to clean'",
		build: "echo 'nothing to build'",
		check: "tsc --noEmit",
		test: "vitest run",
		"test:watch": "vitest",
		"test:coverage": "vitest run --coverage",
		prepublishOnly: "npm run check && npm test",
	},
	pi: {
		extensions: ["./src/index.ts"],
	},
	peerDependencies: {
		"@earendil-works/pi-coding-agent": "*",
		typebox: "*",
	},
	devDependencies: {
		"@types/node": "^22.10.0",
		typescript: "^5.7.3",
		vitest: "^2.1.9",
	},
	engines: {
		node: ">=22.19.0",
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
	`import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function ${toIdentifier(NAME)}(pi: ExtensionAPI) {
\t// TODO: register providers, commands, hooks, tools here.
}
`,
);

writeFileSync(
	resolve(DIR, "README.md"),
	`# ${NAME}

Pi extension: **${NAME}**.

## Install

\`\`\`bash
pi install npm:${NAME}
pi install npm:${NAME}@0.1.0
\`\`\`

Local development from this monorepo:

\`\`\`bash
pi -e ./packages/${NAME}
\`\`\`

## Release

\`\`\`bash
npm run publish:dry -- ${NAME}
npm run publish -- ${NAME}
\`\`\`
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
console.log("  2. npm install");
console.log(`  3. pi -e ./packages/${NAME}`);
console.log(`  4. npm run publish:dry -- ${NAME}`);

function toIdentifier(name) {
	return name.replace(/(^|-)\w/g, (part) => part.replace("-", "").toUpperCase()).replace(/^\d/, "_$&");
}
