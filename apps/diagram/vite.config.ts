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
      // Sub-path imports (CSS, etc.) MUST come before the package-name
      // aliases — Vite matches strings in order and the broader entry
      // would otherwise swallow `@oh-just-another/react-ui/styles.css`
      // before it has a chance to resolve to the actual CSS file.
      {
        find: "@oh-just-another/react-ui/styles.css",
        replacement: path.join(packagesRoot, "react-ui/src/styles/diagram-ui.css"),
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
