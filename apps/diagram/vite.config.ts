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
  "editor",
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
    // `0.0.0.0` so the dev server is reachable from other devices on the
    // local network: a peer opens `http://<host-local-ip>:5174` in their
    // browser and lands on the same `<DiagramShell>`.
    host: "0.0.0.0",
    fs: { allow: [path.resolve(here, "../..")] },
    // Reverse-proxy `/relay` → local relay server. Keeps the WS connection
    // same-origin so there is no CORS / mixed-content issue when the page is
    // served over `http://` and the relay over `ws://`, and a remote peer
    // opening `http://<host-ip>:5174` reaches the relay on the host machine
    // without any setup of their own. Hosts that point at an external relay
    // set `VITE_RELAY_URL=ws(s)://...` and the client bypasses the proxy.
    proxy: {
      "/relay": {
        target: "ws://localhost:1234",
        ws: true,
        rewrite: (p) => p.replace(/^\/relay/, ""),
      },
    },
  },
  build: { outDir: "dist", sourcemap: true, emptyOutDir: true },
  optimizeDeps: {
    exclude: workspacePackages.map((name) => `@oh-just-another/${name}`),
  },
});
