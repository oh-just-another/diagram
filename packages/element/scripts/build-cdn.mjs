// Self-contained browser bundle for `<script type="module">` / CDN use:
// React, the editor and react-ui are bundled in, so a plain HTML page only
// needs this one module. WASM and worker chunks are emitted alongside and
// referenced relatively, so serving `dist/` as-is keeps them reachable
// (the editor falls back to JS / main-thread rendering if they 404).
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");

await build({
  entryPoints: [join(pkg, "src/index.ts")],
  outfile: join(pkg, "dist/oh-diagram.global.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: true,
  jsx: "automatic",
  loader: { ".wasm": "file" },
  // Node built-ins are only reached on the server-side wasm-from-disk path
  // (a dynamic `import("node:fs/promises")`), never in the browser, so leave
  // them unbundled rather than failing the browser build.
  external: ["node:*"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});
