#!/usr/bin/env node
/**
 * Package-scoped release helper for the pi-extension monorepo.
 *
 * This prepares a package release for npm but does not publish it.
 * Publish with `npm run publish -- <pkg>` after the release commit/tag is pushed.
 *
 * Usage:
 *   node scripts/release.mjs <pkg> <patch|minor|major|x.y.z>
 *   npm run release -- <pkg> <patch|minor|major|x.y.z>
 *
 * Steps:
 *   1. Refuse dirty worktree.
 *   2. Bump packages/<pkg>/package.json version.
 *   3. Promote that package's CHANGELOG.md [Unreleased] section.
 *   4. Run package check/test and npm pack dry-run.
 *   5. Commit and tag <pkg>@vX.Y.Z.
 *   6. Add next-cycle [Unreleased] scaffold and commit.
 *   7. Push current branch and the version tag.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [PKG, TARGET] = process.argv.slice(2);
const BUMP_TYPES = new Set(["patch", "minor", "major"]);
const SEMVER = /^\d+\.\d+\.\d+$/;

if (!PKG || !TARGET || (!BUMP_TYPES.has(TARGET) && !SEMVER.test(TARGET))) {
	console.error("Usage: node scripts/release.mjs <pkg> <patch|minor|major|x.y.z>");
	process.exit(1);
}

const PKG_DIR = resolve("packages", PKG);
if (!existsSync(resolve(PKG_DIR, "package.json"))) {
	console.error(`Error: package not found: ${PKG_DIR}`);
	process.exit(1);
}

function run(cmd, { silent = false, cwd } = {}) {
	console.log(`$ ${cmd}${cwd ? `  (cwd=${cwd})` : ""}`);
	return execSync(cmd, { encoding: "utf8", stdio: silent ? "pipe" : "inherit", cwd: cwd ?? process.cwd() });
}

function readPkg() {
	return JSON.parse(readFileSync(resolve(PKG_DIR, "package.json"), "utf8"));
}

function cmpVersions(a, b) {
	const [ap, bp] = [a.split("."), b.split(".")].map((p) => p.map(Number));
	for (let i = 0; i < 3; i++) {
		const d = (ap[i] || 0) - (bp[i] || 0);
		if (d !== 0) return d;
	}
	return 0;
}

function assertClean() {
	const status = run("git status --porcelain", { silent: true }).trim();
	if (status) {
		console.error("Error: working directory is dirty. Commit or stash first.\n" + status);
		process.exit(1);
	}
}

function bumpVersion(target) {
	const current = readPkg().version;
	if (BUMP_TYPES.has(target)) {
		run(`npm version ${target} --no-git-tag-version`, { cwd: PKG_DIR });
	} else {
		if (cmpVersions(target, current) <= 0) {
			console.error(`Error: explicit version ${target} must be greater than current ${current}.`);
			process.exit(1);
		}
		run(`npm version ${target} --no-git-tag-version`, { cwd: PKG_DIR });
	}
	return readPkg().version;
}

function promoteUnreleased(version) {
	const path = resolve(PKG_DIR, "CHANGELOG.md");
	if (!existsSync(path)) return;
	const content = readFileSync(path, "utf8");
	if (!content.includes("## [Unreleased]")) {
		console.error(`Error: ${path} has no ## [Unreleased] section.`);
		process.exit(1);
	}
	const date = new Date().toISOString().slice(0, 10);
	writeFileSync(path, content.replace("## [Unreleased]", `## [${version}] — ${date}`));
}

function addUnreleased() {
	const path = resolve(PKG_DIR, "CHANGELOG.md");
	if (!existsSync(path)) return;
	const content = readFileSync(path, "utf8");
	const scaffold = "## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n\n### Technical\n\n";
	const updated = content.replace(/^(# Changelog\r?\n\r?\n[\s\S]*?\r?\n\r?\n)/, (_m, header) => `${header}${scaffold}`);
	if (updated === content) {
		console.error(`Error: failed to insert [Unreleased] section in ${path}.`);
		process.exit(1);
	}
	writeFileSync(path, updated);
}

function assertTagAvailable(tag) {
	const local = run(`git tag --list ${shellQuote(tag)}`, { silent: true }).trim();
	if (local) throw new Error(`Tag already exists locally: ${tag}`);
	const remote = run("git ls-remote --tags origin", { silent: true });
	if (remote.includes(`refs/tags/${tag}`)) throw new Error(`Tag already exists on origin: ${tag}`);
}

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function currentBranch() {
	return run("git rev-parse --abbrev-ref HEAD", { silent: true }).trim();
}

console.log(`\n=== Release ${PKG} (${TARGET}) ===\n`);
assertClean();
const version = bumpVersion(TARGET);
const tag = `${PKG}@v${version}`;
assertTagAvailable(tag);
promoteUnreleased(version);
run("npm run check --if-present", { cwd: PKG_DIR });
run("npm test --if-present", { cwd: PKG_DIR });
run("npm pack --dry-run --ignore-scripts", { cwd: PKG_DIR });
run(`git add packages/${PKG}/package.json packages/${PKG}/CHANGELOG.md package-lock.json`);
run(`git commit -m "Release ${PKG}@v${version}"`);
run(`git tag ${tag}`);
addUnreleased();
run(`git add packages/${PKG}/CHANGELOG.md`);
run(`git commit -m "chore(${PKG}): open [Unreleased] section after v${version}"`);
const branch = currentBranch();
run(`git push origin ${branch}`);
run(`git push origin ${tag}`);
console.log(`\n=== Prepared ${PKG}@${version}. Publish with: npm run publish -- ${PKG} ===`);
