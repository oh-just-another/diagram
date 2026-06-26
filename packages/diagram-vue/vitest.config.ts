import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// Resolve workspace packages straight from source so tests reflect in-tree
// code without a `pnpm build` round-trip.
const here = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(here, "../../packages");
const workspacePackages = [
  "fonts",
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
  "diagram",
];

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: workspacePackages.map((name) => ({
      find: `@oh-just-another/${name}`,
      replacement: path.join(packagesRoot, name, "src/index.ts"),
    })),
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
  },
});
