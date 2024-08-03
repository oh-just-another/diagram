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
  "renderer-svg",
  "state",
  "history",
  "templates",
  "templates-jsx",
  "serialization",
  "react-ui",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: workspacePackages.map((name) => ({
      find: `@oh-just-another/${name}`,
      replacement: path.join(packagesRoot, name, "src/index.ts"),
    })),
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
