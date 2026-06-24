import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Dev server for `example/` — resolves workspace packages from source so the
// wrapper runs against in-tree code, and lets Vite handle the WASM / worker
// assets the editor loads via `new URL(..., import.meta.url)`.
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
  "renderer-canvas",
  "renderer-workers",
  "renderer-svg",
  "text-wasm",
  "raster-wasm",
  "state",
  "history",
  "templates",
  "templates-jsx",
  "serialization",
  "react-ui",
  "editor",
  "element",
  "vue",
];

export default defineConfig({
  root: path.join(here, "example"),
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: /^@oh-just-another\/([^/]+)\/(.+)$/,
        replacement: path.join(packagesRoot, "$1/src/$2"),
      },
      ...workspacePackages.map((name) => ({
        find: `@oh-just-another/${name}`,
        replacement: path.join(packagesRoot, name, "src/index.ts"),
      })),
    ],
  },
  server: { port: 5176, fs: { allow: [path.resolve(here, "../..")] } },
  optimizeDeps: {
    exclude: workspacePackages.map((name) => `@oh-just-another/${name}`),
  },
});
