// Self-contained browser bundle for `<script type="module">` / CDN use:
// React, the editor and react-ui are bundled in, so a plain HTML page only
// needs this one module.
//
// The editor reaches its WASM, fonts and the offscreen render worker via
// `new URL("../<dir>/<file>", import.meta.url)` / `new Worker(new URL(...))`,
// which esbuild leaves literal. So full-quality CDN delivery is a matter of
// putting the right files where those URLs resolve at runtime:
//   - the worker is built as its own bundle into `dist/render-worker.js`
//     (the factory loads `new URL("./render-worker.js", import.meta.url)`);
//   - the `.wasm` and `.woff2` assets are copied to `<pkg>/wasm` and
//     `<pkg>/fonts` (the bundles sit in `dist/`, so `../wasm` / `../fonts`
//     resolve to the package root — reachable on a CDN that serves the
//     whole published package).
// Everything still degrades gracefully: a missing asset falls back to
// JS / main-thread rendering and the system font.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const packagesRoot = join(pkg, "..");
const dist = join(pkg, "dist");

/** Shared esbuild options for the browser bundles. */
const common = {
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
};

// 1. Main entry — the custom element plus everything it mounts.
await build({
  ...common,
  entryPoints: [join(pkg, "src/index.ts")],
  outfile: join(dist, "oh-diagram.global.js"),
});

// 2. The offscreen render worker, as its own module bundle. The factory
//    spawns `new Worker(new URL("./render-worker.js", import.meta.url),
//    { type: "module" })`, which resolves next to the main bundle.
await build({
  ...common,
  entryPoints: [join(packagesRoot, "renderer-canvas/src/render-worker.ts")],
  outfile: join(dist, "render-worker.js"),
});

// 3. Copy the runtime assets to where the `../wasm` / `../fonts` URLs resolve.
const copyAssets = async (srcDir, destName) => {
  const dest = join(pkg, destName);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(srcDir, dest, { recursive: true });
};

await copyAssets(join(packagesRoot, "text-wasm/wasm"), "wasm");
await cp(join(packagesRoot, "raster-wasm/wasm/rasterizer.wasm"), join(pkg, "wasm/rasterizer.wasm"));
await copyAssets(join(packagesRoot, "fonts/fonts"), "fonts");

console.log("[build-cdn] emitted render-worker.js + copied wasm/ and fonts/");
