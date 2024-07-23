import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Resolve workspace packages to their source directories so vite transpiles
// the .ts files in real time and HMR picks up edits without an intermediate
// `tsc -b` step. Without this, vite reads each package's pre-built `dist/`,
// which goes stale the moment you change source — and lingering caches in
// `node_modules/.vite` keep serving the old bundle.
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
  root: ".",
  esbuild: {
    // Wire JSX in .tsx files straight into our templates-jsx runtime.
    jsx: "automatic",
    jsxImportSource: "@oh-just-another/templates-jsx",
  },
  resolve: {
    alias: [
      // Sub-path aliases first (more specific). esbuild's automatic JSX
      // imports `@oh-just-another/templates-jsx/jsx-runtime`, so we route that
      // explicitly to the source file.
      {
        find: "@oh-just-another/templates-jsx/jsx-runtime",
        replacement: path.join(packagesRoot, "templates-jsx/src/jsx-runtime.ts"),
      },
      {
        find: "@oh-just-another/templates-jsx/jsx-dev-runtime",
        replacement: path.join(packagesRoot, "templates-jsx/src/jsx-runtime.ts"),
      },
      ...workspacePackages.map((name) => ({
        find: `@oh-just-another/${name}`,
        replacement: path.join(packagesRoot, name, "src/index.ts"),
      })),
    ],
  },
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      // Let vite serve files from outside `apps/demo` (i.e. workspace sources).
      allow: [path.resolve(here, "../..")],
    },
    watch: {
      // Watch workspace source files too.
      ignored: ["!**/packages/**/src/**"],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    emptyOutDir: true,
  },
  optimizeDeps: {
    // Don't try to pre-bundle workspace packages — they go through alias.
    exclude: workspacePackages.map((name) => `@oh-just-another/${name}`),
  },
});
