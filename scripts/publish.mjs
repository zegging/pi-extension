#!/usr/bin/env node
/**
 * Publish public Pi extension packages in this monorepo to npm.
 *
 * Modeled after ~/project/pi/scripts/publish.mjs:
 * - discover publishable packages under packages/*
 * - validate npm pack contents first
 * - skip versions that are already published
 * - publish with --access public and --provenance
 *
 * Usage:
 *   node scripts/publish.mjs [--dry-run] [package-name]
 *   npm run publish:dry
 *   npm run publish -- pi-elasticsearch-http
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const NPM_REGISTRY = "https://registry.npmjs.org/";
const dryRun = process.argv.includes("--dry-run");
const packageFilter = process.argv.slice(2).find((arg) => arg !== "--dry-run");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--dry-run" && arg !== packageFilter);

if (unknownArgs.length > 0) {
	console.error("Usage: node scripts/publish.mjs [--dry-run] [package-name]");
	process.exit(1);
}

function commandForPlatform(command) {
	return process.platform === "win32" ? `${command}.cmd` : command;
}

function run(command, args, options = {}) {
	console.log(`$ ${[command, ...args].join(" ")}${options.cwd ? `  (cwd=${options.cwd})` : ""}`);
	const result = spawnSync(commandForPlatform(command), args, {
		cwd: options.cwd,
		encoding: "utf8",
		stdio: options.capture ? ["inherit", "pipe", "pipe"] : "inherit",
	});

	if (result.status !== 0) {
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
		throw new Error(output ? `Command failed: ${command} ${args.join(" ")}\n${output}` : `Command failed: ${command} ${args.join(" ")}`);
	}

	return result;
}

function readPackageJson(directory) {
	return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

function discoverPackages() {
	const packagesDir = "packages";
	return readdirSync(packagesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({ directory: join(packagesDir, entry.name), packageJson: readPackageJson(join(packagesDir, entry.name)) }))
		.filter((pkg) => pkg.packageJson.private !== true)
		.filter(
			(pkg) =>
				!packageFilter ||
				pkg.packageJson.name === packageFilter ||
				pkg.directory === packageFilter ||
				basename(pkg.directory) === packageFilter,
		);
}

function validatePackageJson(pkg) {
	const { packageJson, directory } = pkg;
	const required = ["name", "version", "description", "license", "repository", "files", "pi"];
	const missing = required.filter((key) => packageJson[key] === undefined);
	if (missing.length > 0) {
		throw new Error(`${directory}/package.json missing required npm publish field(s): ${missing.join(", ")}`);
	}
	if (!packageJson.keywords?.includes("pi-package")) {
		throw new Error(`${directory}/package.json must include keyword "pi-package".`);
	}
	if (!packageJson.pi.extensions?.length) {
		throw new Error(`${directory}/package.json must declare pi.extensions.`);
	}
}

function validatePack(directory) {
	const result = run("npm", ["pack", ".", "--dry-run", "--ignore-scripts", "--json"], { capture: true, cwd: directory });
	let parsed;
	try {
		parsed = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`Failed to parse npm pack --json output for ${directory}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
	}
	const packed = normalizeNpmPackJson(parsed);
	if (!packed || typeof packed !== "object" || !Array.isArray(packed.files)) {
		throw new Error(`Unexpected npm pack --json output for ${directory}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
	}
	console.log(`  ${packed.filename}: ${packed.files.length} files, ${packed.size} bytes packed, ${packed.unpackedSize} bytes unpacked`);
	for (const file of packed.files) {
		console.log(`    - ${file.path}`);
	}
	return packed;
}

function normalizeNpmPackJson(parsed) {
	if (Array.isArray(parsed)) return parsed[0];
	if (!parsed || typeof parsed !== "object") return undefined;
	if (Array.isArray(parsed.files)) return parsed;

	// npm versions differ here: some return `[packument]`, while newer npm can
	// return `{ "<package-name>": packument }`. Accept either to keep CI stable.
	const values = Object.values(parsed);
	return values.find((value) => value && typeof value === "object" && Array.isArray(value.files));
}

function isPublished(name, version) {
	const result = spawnSync(commandForPlatform("npm"), ["view", `${name}@${version}`, "version", "--json", "--registry", NPM_REGISTRY], {
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
	});

	if (result.status === 0 && result.stdout.trim()) return true;

	const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
	if (result.status !== 0 && (output.includes("E404") || output.includes("404 Not Found"))) return false;

	throw new Error(output ? `Failed to query ${name}@${version}\n${output}` : `Failed to query ${name}@${version}`);
}

const packages = discoverPackages();
if (packages.length === 0) {
	throw new Error(packageFilter ? `No publishable package matched ${packageFilter}.` : "No publishable packages found.");
}

console.log(`Publishing ${packages.length} package(s)${dryRun ? " (dry run)" : ""}:`);
for (const pkg of packages) console.log(`  - ${pkg.packageJson.name}@${pkg.packageJson.version} (${pkg.directory})`);
console.log();

const states = [];
for (const pkg of packages) {
	validatePackageJson(pkg);
	const { name, version } = pkg.packageJson;
	const published = isPublished(name, version);
	console.log(`${name}@${version} ${published ? "is already published; validating contents only." : "is not published; validating contents before publish."}`);
	validatePack(pkg.directory);
	states.push({ ...pkg, published });
	console.log();
}

if (dryRun) process.exit(0);

console.log("All packages validated; starting publication.\n");
for (const pkg of states) {
	const { name, version } = pkg.packageJson;
	if (pkg.published) {
		console.log(`Skipping ${name}@${version}: already published\n`);
		continue;
	}
	run("npm", ["publish", "--access", "public", "--provenance", "--ignore-scripts", "--registry", NPM_REGISTRY], { cwd: pkg.directory });
	console.log();
}
