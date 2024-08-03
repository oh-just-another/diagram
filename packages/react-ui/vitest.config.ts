import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve workspace packages straight from their source so tests reflect
// in-tree code (no `pnpm build` round-trip per edit).
const here = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(here, "../../packages");
const workspacePackages = [
  "types",
  "math",
  "scene",
  "renderer-core",
  "renderer-canvas",
  "renderer-svg",
  "state",
  "history",
  "templates",
  "templates-jsx",
  "serialization",
];

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: workspacePackages.map((name) => ({
      find: `@oh-just-another/${name}`,
      replacement: path.join(packagesRoot, name, "src/index.ts"),
    })),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "src/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.tsx",
      "tests/**/*.{test,spec}.ts",
      "tests/**/*.{test,spec}.tsx",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/index.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
    },
  },
});
