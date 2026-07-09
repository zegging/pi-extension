import { defineConfig } from "vitest/config";

// Root vitest config — each package can (and should) provide its own
// packages/<name>/vitest.config.ts to override include/exclude/timeouts.
// This root config exists so `npm test` at the top level still works.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["packages/*/tests/**/*.test.ts"],
		testTimeout: 15_000,
	},
});
