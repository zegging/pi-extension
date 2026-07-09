#!/usr/bin/env node
/**
 * Multi-package release/tag script for the pi-extension monorepo.
 *
 * Scope: bump one package's version + move its CHANGELOG + git tag + push.
 * Does NOT run `npm publish` — every package in this monorepo is
 * `"private": true` and consumers install via git URLs pinned to a tag:
 *   pi install git:gitlab.qunhequnhe.com/huiti/pi-extension@<pkg>@vX.Y.Z
 *
 * Tag naming (scoped so multiple packages can coexist in one repo):
 *   <pkg>@vX.Y.Z    — immutable release marker
 *   <pkg>@latest    — force-moved to each new release commit
 *
 * Usage:
 *   node scripts/release.mjs <pkg> <patch|minor|major|x.y.z>
 *   npm run release -- <pkg> <patch|minor|major|x.y.z>
 *
 * Modeled on qunhe-provider/scripts/release.mjs, adapted for a monorepo:
 *   1. Refuse to run with a dirty working directory.
 *   2. cd into packages/<pkg>, bump (or set) package.json version.
 *   3. Promote `## [Unreleased]` → `## [x.y.z] — <date>` in that package's CHANGELOG.md.
 *   4. `npm run check` + `npm test` for that package only.
 *   5. git add + commit "Release <pkg>@vX.Y.Z" + tag <pkg>@vX.Y.Z + force-move <pkg>@latest.
 *   6. Insert a fresh empty `## [Unreleased]` scaffold.
 *   7. Commit the next-cycle changelog scaffold.
 *   8. Push branch + release tag + latest tag.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [PKG, TARGET] = process.argv.slice(2);
const BUMP_TYPES = new Set(["patch", "minor", "major"]);
const SEMVER = /^\d+\.\d+\.\d+$/;

if (!PKG || !TARGET || (!BUMP_TYPES.has(TARGET) && !SEMVER.test(TARGET))) {
	console.error("Usage: node scripts/release.mjs <pkg> <patch|minor|major|x.y.z>");
	console.error("Example: node scripts/release.mjs qunhe-provider patch");
	process.exit(1);
}

const PKG_DIR = resolve("packages", PKG);
if (!existsSync(PKG_DIR)) {
	console.error(`Error: package directory not found: ${PKG_DIR}`);
	process.exit(1);
}
if (!existsSync(resolve(PKG_DIR, "package.json"))) {
	console.error(`Error: ${PKG_DIR}/package.json not found.`);
	process.exit(1);
}

function run(cmd, { silent = false, cwd } = {}) {
	console.log(`$ ${cmd}${cwd ? `  (cwd=${cwd})` : ""}`);
	return execSync(cmd, {
		encoding: "utf8",
		stdio: silent ? "pipe" : "inherit",
		cwd: cwd ?? process.cwd(),
	});
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
	if (!existsSync(path)) {
		console.error(`Error: ${path} not found.`);
		process.exit(1);
	}
	const content = readFileSync(path, "utf8");
	if (!content.includes("## [Unreleased]")) {
		console.error(
			`Error: ${path} has no \`## [Unreleased]\` section. Add your release notes there first.`,
		);
		process.exit(1);
	}
	const date = new Date().toISOString().slice(0, 10);
	const updated = content.replace("## [Unreleased]", `## [${version}] — ${date}`);
	writeFileSync(path, updated);
	console.log(`  Promoted [Unreleased] → [${version}] — ${date}`);
}

function addUnreleased() {
	const path = resolve(PKG_DIR, "CHANGELOG.md");
	const content = readFileSync(path, "utf8");
	const scaffold = `## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n\n### Technical\n\n`;
	const updated = content.replace(
		/^(# Changelog\r?\n\r?\n[\s\S]*?\r?\n\r?\n)/,
		(_m, header) => `${header}${scaffold}`,
	);
	if (updated === content) {
		console.error(
			`Error: failed to insert [Unreleased] section — check ${path} header shape.`,
		);
		process.exit(1);
	}
	writeFileSync(path, updated);
	console.log("  Added new [Unreleased] scaffold.");
}

function assertClean() {
	const status = run("git status --porcelain", { silent: true }).trim();
	if (status) {
		console.error("Error: working directory is dirty. Commit or stash first.\n" + status);
		process.exit(1);
	}
}

function assertTagAvailable(tag) {
	const tags = run("git tag --list", { silent: true }).split("\n").map((t) => t.trim());
	if (tags.includes(tag)) {
		console.error(`Error: tag ${tag} already exists locally. Delete it or pick a different version.`);
		process.exit(1);
	}
	const remote = run("git ls-remote --tags origin", { silent: true });
	if (remote.includes(`refs/tags/${tag}`)) {
		console.error(`Error: tag ${tag} already exists on origin. Pick a different version.`);
		process.exit(1);
	}
}

function currentBranch() {
	return run("git rev-parse --abbrev-ref HEAD", { silent: true }).trim();
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

console.log(`\n=== pi-extension release: ${PKG} (${TARGET}) ===\n`);

console.log("[1/8] Checking working directory is clean...");
assertClean();

console.log("\n[2/8] Bumping version...");
const version = bumpVersion(TARGET);
const versionTag = `${PKG}@v${version}`;
const latestTag = `${PKG}@latest`;
console.log(`  → ${versionTag}`);
assertTagAvailable(versionTag);

console.log("\n[3/8] Promoting CHANGELOG.md [Unreleased]...");
promoteUnreleased(version);

console.log("\n[4/8] Running checks + tests for this package only...");
run("npm run check --if-present", { cwd: PKG_DIR });
run("npm test --if-present", { cwd: PKG_DIR });

console.log("\n[5/8] Committing version bump + changelog + tagging...");
// Include root package-lock.json if npm workspaces updated it.
run(`git add packages/${PKG}/package.json packages/${PKG}/CHANGELOG.md package-lock.json`);
run(`git commit -m "Release ${versionTag}"`);
run(`git tag ${versionTag}`);
// Force-move `<pkg>@latest` to point at the same commit as the new version tag.
run(`git tag -f ${latestTag}`);

console.log("\n[6/8] Adding [Unreleased] scaffold for next cycle...");
addUnreleased();

console.log("\n[7/8] Committing next-cycle scaffold...");
run(`git add packages/${PKG}/CHANGELOG.md`);
run(`git commit -m "chore(${PKG}): open [Unreleased] section after ${versionTag}"`);

console.log("\n[8/8] Pushing to origin...");
const branch = currentBranch();
run(`git push origin ${branch}`);
run(`git push origin ${versionTag}`);
// `<pkg>@latest` is a moving reference — force-push to overwrite the previous release.
run(`git push origin ${latestTag} --force`);

console.log(`\n=== Released ${versionTag} + ${latestTag} (pushed to origin) ===`);
