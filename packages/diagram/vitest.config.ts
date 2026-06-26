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
  "events",
  "tokens",
  "scene",
  "renderer-core",
  "history",
  "glyph-atlas",
  "curve-mesh",
  "renderer-workers",
  "renderer-canvas",
  "renderer-svg",
  "state",
  "serialization",
  "templates",
  "templates-jsx",
  "raster-wasm",
  "text-wasm",
  "versioning",
  "react-ui",
  "editor",
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
    include: ["src/**/*.{test,spec}.ts", "src/**/*.{test,spec}.tsx", "tests/**/*.{test,spec}.ts"],
  },
});
