# @oh-just-another/headless

Server-side rendering for `@oh-just-another/scene` documents. Pure Node.js — no DOM, no Canvas2D, no browser shim. Produces SVG synchronously and PNG via an optional WASM dependency.

## Install

```bash
pnpm add @oh-just-another/headless
pnpm add @resvg/resvg-js   # only needed for renderToPng
```

`@resvg/resvg-js` is declared as an **optional peer dependency** — SVG-only consumers (servers that emit `image/svg+xml`, snapshot diffing, etc.) don't pay for the ~3 MB WASM payload.

## Usage

```ts
import { writeFile, readFile } from "node:fs/promises";
import { renderToSvg, renderToPng } from "@oh-just-another/headless";

const sceneJson = await readFile("scene.json", "utf8");

// SVG — synchronous, pure JS.
await writeFile("scene.svg", renderToSvg(sceneJson));

// PNG — async, requires @resvg/resvg-js. Retina-quality (scale: 2).
await writeFile("scene.png", await renderToPng(sceneJson, { scale: 2 }));
```

Both functions accept either an in-memory `Scene` (e.g. produced by `@scene` operations) or the JSON document `@serialization` emits.

## API

| Name                                    | Purpose                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `renderToSvg(scene, options?)`          | Scene → SVG string. Sync. ~0.2 ms / 100 shapes.                                                  |
| `renderToPng(scene, options?)`          | Scene → PNG `Uint8Array`. Async. Throws if `@resvg/resvg-js` is missing.                         |
| `RenderSceneToSvgOptions`               | `width`, `height`, `measureText`, `skipInstall`, standard `RenderSceneOptions` (`skipClear`, …). |
| `RenderToPngOptions` (extends SVG opts) | `scale`, `background`, `fitToWidth`, `fitToHeight`.                                              |

## Benchmarks

`pnpm --filter @oh-just-another/headless bench` (M-series Mac):

| Shapes | Mean time | Throughput |
| -----: | --------: | ---------: |
|     10 |  0.018 ms |  55K ops/s |
|    100 |   0.17 ms | 5.8K ops/s |
|   1000 |   1.87 ms |  534 ops/s |

Phase 8 target was < 50 ms for 100 shapes — there's roughly 300× of headroom.

## Design notes

- **Two paths, one entry point.** SVG is the fast, dependency-free path; PNG goes through resvg (Rust → WASM). Adding more rasterizers (skia, node-canvas) slots in beside `renderToPng` without changing the public API.
- **Optional peer-dependency for resvg-js.** Tree-shaking can't drop a static `import "@resvg/resvg-js"` — its wasm init has side effects. Loading it dynamically keeps the SVG-only path zero-cost and tree-shakable.
- **PNG via dynamic specifier-variable import.** The `import(/* @vite-ignore */ specifier)` form hides the module id from bundlers so they don't bake `@resvg/resvg-js` into the SVG-only output.

