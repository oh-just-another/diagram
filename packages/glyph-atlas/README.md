# @oh-just-another/glyph-atlas

L1 MSDF glyph atlas — pre-rasterised glyphs packed into a single WebGL2 texture for sharp text at any zoom. No runtime dependencies.

Glyphs are baked on first request through a pluggable MSDF shaper and packed into a uniform grid (every tile is the same size, so placement is O(1) — no shelf packing). The atlas owns the GPU texture and only re-uploads the tiles that changed, so steady-state cost is near-zero for a stable glyph set.

## Install

```bash
pnpm add @oh-just-another/glyph-atlas
```

## Usage

```ts
import { GlyphAtlas, type MsdfShaper } from "@oh-just-another/glyph-atlas";

// `shaper` is any object satisfying MsdfShaper — structurally compatible
// with @text-wasm's WasmTextShaper (glyphMetrics + rasterizeGlyphMSDF).
const atlas = new GlyphAtlas(shaper, { atlasSize: 1024, tileSize: 64 });

const glyph = atlas.getOrRasterize("A".codePointAt(0)!); // AtlasGlyph | null (null = atlas full)

// Upload dirty tiles into a WebGL2 texture (created lazily, reused across frames):
const texture = atlas.uploadTo(gl);

// On teardown:
atlas.dispose(gl);
```

## API

`GlyphAtlas` is the main class:

- `getOrRasterize(codePoint, fontId?)` — resolve a slot, baking on first request; `null` only when the atlas is full and the glyph isn't cached.
- `resolveFontId(family, bold?, italic?)` — map a CSS font stack to the shaper's font id.
- `uploadTo(gl)` — push dirty tiles to a (lazily created, atlas-owned) `WebGLTexture`.
- `dispose(gl?)` — release the GPU texture; the CPU mirror stays so it can re-upload without re-baking.
- Read-only `atlasSize` / `tileSize` / `range` / `columns` / `capacity` / `glyphCount` / `cpuBuffer`.

## Exports

| Name                                                       | Kind  | Notes                                                            |
| ---------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| `GlyphAtlas`                                               | class | The atlas cache + GPU texture manager.                           |
| `MsdfShaper`                                               | type  | Minimum shaper interface (`glyphMetrics`, `rasterizeGlyphMSDF`). |
| `AtlasGlyph`                                               | type  | A glyph's atlas placement + font metrics.                        |
| `GlyphAtlasOptions`                                        | type  | `{ atlasSize?, tileSize?, range? }`.                             |
| `DEFAULT_ATLAS_SIZE`, `DEFAULT_TILE_SIZE`, `DEFAULT_RANGE` | const | Defaults for the constructor options.                            |
