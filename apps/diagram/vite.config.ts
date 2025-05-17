import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(here, "../../packages");

const workspacePackages = [
  "types",
  "math",
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
  "network",
  "collab",
  "react-ui",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Sub-path imports (`@oh-just-another/<pkg>/<file>` — typically CSS
      // stylesheets) are mapped to `packages/<pkg>/src/<file>`. Must come
      // before the bare package-name aliases so the broader entry doesn't
      // swallow them. The generic regex covers any sub-path.
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
  server: {
    port: 5174,
    fs: { allow: [path.resolve(here, "../..")] },
  },
  build: { outDir: "dist", sourcemap: true, emptyOutDir: true },
  optimizeDeps: {
    exclude: workspacePackages.map((name) => `@oh-just-another/${name}`),
  },
});
