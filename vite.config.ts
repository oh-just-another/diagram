import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Root vite config used by `vite-node` for ad-hoc scripts in `scripts/`.
// Aliases every `@oh-just-another/<name>` import to the package's source so
// scripts run without a prior `pnpm build`.
const here = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(here, "./packages");

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
  resolve: {
    alias: workspacePackages.map((name) => ({
      find: `@oh-just-another/${name}`,
      replacement: path.join(packagesRoot, name, "src/index.ts"),
    })),
  },
});
