# @oh-just-another/exporter

Document-grade export of `@oh-just-another/scene` documents — high-resolution PNG with DPI metadata, vector PDF, world-coordinate cropping. Builds on top of `@headless` (which itself uses `@renderer-svg`).

## Install

```bash
pnpm add @oh-just-another/exporter
# Peer deps — install only the ones you need:
pnpm add @resvg/resvg-js   # PNG  (~3 MB wasm)
pnpm add pdfkit svg-to-pdfkit   # PDF
```

All three peers are **optional** — the package only requires the ones for the formats you call into.

## Usage

```ts
import { writeFile, readFile } from "node:fs/promises";
import { exportPng, exportPdf } from "@oh-just-another/exporter";

const scene = await readFile("scene.json", "utf8");

// High-resolution PNG with print DPI metadata.
await writeFile(
  "scene@2x.png",
  await exportPng(scene, { scale: 2, dpi: 300, background: "#ffffff" }),
);

// Crop a region of the scene.
await writeFile(
  "thumb.png",
  await exportPng(scene, { region: { x: 0, y: 0, width: 400, height: 300 } }),
);

// PDF for printing — A4 portrait by default.
await writeFile(
  "scene.pdf",
  await exportPdf(scene, { pageSize: "Letter", orientation: "landscape", title: "Diagram" }),
);
```

## API

| Name                          | Purpose                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `exportPng(scene, options?)`  | Scene → PNG `Uint8Array`. Optional `region`, `scale`, `background`, `dpi`.                      |
| `exportPdf(scene, options?)`  | Scene → PDF `Uint8Array`. Optional `region`, `pageSize`, `orientation`, `margin`, doc metadata. |
| `setPngDpi(png, dpi)`         | Standalone helper to embed a `pHYs` chunk into any PNG.                                         |
| `BaseExportOptions`           | Shared: `region`, `width`, `height`, `background`.                                              |
| `ExportPngOptions`            | Adds `scale`, `dpi`.                                                                            |
| `ExportPdfOptions`            | Adds `pageSize`, `orientation`, `margin`, `title`, `author`, `subject`.                         |
| `ExportRegion`, `PdfPageSize` | Type aliases re-exported for convenience.                                                       |

## Design notes

- **Crop = synthetic viewport.** A `region` is implemented by handing the
  renderer a viewport with `pan = -region` and `size = region.{w,h}`. No
  extra clip-rect logic in the SVG/PDF pipeline — the renderer naturally
  produces an image of the right size.
- **DPI metadata via direct PNG chunk insertion.** resvg-js doesn't expose
  output `pHYs`, so `setPngDpi` walks the PNG byte stream, drops any
  existing `pHYs`, and writes a fresh one (with a hand-rolled CRC32) right
  before the first `IDAT`. Zero deps, ~100 lines.
- **PDF via pdfkit + svg-to-pdfkit, not via PNG-embed.** Embedding a raster
  PNG into a PDF would lose vector quality and inflate file size. Going
  through SVG keeps fonts and shapes crisp at any zoom.
- **Optional peer deps over direct deps.** Consumers pulling only `exportPng`
  don't get pdfkit's footprint; PDF-only callers don't drag in resvg. Each
  entry point loads its peers dynamically via `import(/* @vite-ignore */
specifier)` so bundlers don't bake them in.
- **`A4` / `Letter` etc. as string constants.** Custom sizes via `{ width,
height }` in PDF points (1pt = 1/72in). The CLI accepts the same plus a
  `WxH` shorthand.
