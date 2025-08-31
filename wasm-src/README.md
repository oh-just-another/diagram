# wasm-src

Rust source for the two WebAssembly modules consumed by the
`@oh-just-another/text-wasm` and `@oh-just-another/raster-wasm` packages.

## Crates

### `text-shaper/`

Text shaping via `ttf-parser` + MSDF glyph rasterisation via `fdsm`.
Embeds a **3-family × 4-style font matrix** (12 faces; Roboto + Roboto
Mono are Apache-2.0, PT Serif is OFL — see `text-shaper/font/LICENSE`)
so a single fetch / read gives both the engine and the fonts.

Font id = `family_base + (bold?1:0) + (italic?2:0)`:

| family | base | files (R / B / I / BI) |
|---|---|---|
| sans (default) | 0 | `Roboto-{Regular,Bold,Italic,BoldItalic}.ttf` |
| serif | 4 | `PTSerif-{Regular,Bold,Italic,BoldItalic}.ttf` |
| mono | 8 | `RobotoMono-{Regular,Bold,Italic,BoldItalic}.ttf` |

So e.g. bold-italic serif = `4 + 1 + 2 = 7`. All faces are static
(a dedicated file per style — no variable-font instancing).

Exports:

| Name | Signature | Notes |
|---|---|---|
| `memory` | `WebAssembly.Memory` | linear memory, auto-exported |
| `alloc(n)` | `(usize) → *mut u8` | bump allocator |
| `free(ptr, n)` | `(*mut u8, usize) → ()` | no-op (bump = no reclaim) |
| `reset()` | `() → ()` | bump cursor back to 0 |
| `resolveFont(family_ptr, family_len, bold, italic)` | `(*const u8, usize, u32, u32) → u32` | CSS family + bold/italic → font id |
| `setFont(family_ptr, family_len, size_px, bold, italic)` | `(*const u8, usize, f32, u32, u32)` | sets size + current font (for `measure`) |
| `measure(text_ptr, text_len)` | `(*const u8, usize) → f32` | advance width in CSS-px (current font) |
| `glyphMetrics(font_id, code_point)` | `(u32, u32) → *const f32` | 6×f32: advance, bbox, UPM (font units) |
| `rasterizeGlyphMSDF(font_id, code_point, atlas_size, range)` | `(u32, u32, u32, f32) → *const u8` | `atlas_size²×3` RGB MSDF tile |

The MSDF tiles are generated **lazily at runtime** per glyph (inside
the wasm, by `fdsm`) and cached in a GPU atlas on the host — there's no
offline per-font generation step. Font selection is the host's job: it
calls `resolveFont(family, bold, italic)` → `fontId`, then passes
`fontId` into `glyphMetrics` / `rasterizeGlyphMSDF`. The host atlas keys
glyphs by `(fontId, codePoint)` so the same letter in two faces gets two
tiles in the shared texture.

Footprint: ~4 MB `.wasm` (12 embedded faces) after `opt-level = "z"` +
strip. Subset the `.ttf`s (Latin only, via `fonttools subset`) before
embedding if the size matters for low-end / mobile.

architecture (Canvas2D vs WebGL2) and how to add a font.

### `rasterizer/`

Bezier flatten + stroke-to-fill, no font embed. Exports:

| Name | Signature | Notes |
|---|---|---|
| `memory` / `alloc` / `free` / `reset` | (same as above) | shared ABI |
| `flattenF32(cmds_ptr, cmds_len, tolerance, out_ptr_out, out_count_out)` | flatten packed Float32 path into polyline |
| `strokeToFillF32(poly_ptr, poly_len, width, cap, join, out_ptr_out, out_count_out)` | offset polyline into fill polygon |

Footprint: ~16 KB `.wasm`.

## Building

```bash
# from repo root
pnpm build:wasm
```

That runs `scripts/build-wasm.sh`:

1. `cargo build --release --target wasm32-unknown-unknown` in each crate.
2. Copies the artifacts into `packages/text-wasm/wasm/` and
   `packages/raster-wasm/wasm/` (so `pnpm pack` ships them).

Toolchain requirement: `rustup target add wasm32-unknown-unknown`
(run once per machine).

## Why this layout

- **Source** (`wasm-src/*`) is intentionally outside `packages/*`
  so the npm packages stay JS-only and don't pull a Rust toolchain
  on `pnpm install`.
- **Artefacts** (`packages/*/wasm/*.wasm`) are checked into git so
  end-users of the npm packages don't need Rust either. Re-run
  `pnpm build:wasm` only when the Rust source changes.

## Adding a new export

1. Pick a name in camelCase for the TypeScript ABI.
2. In Rust: `#[no_mangle] #[export_name = "yourName"] pub extern "C" fn …`.
3. Mirror the signature in `WasmShaperExports` / `WasmRasterizerExports`.
4. Rebuild — `pnpm build:wasm`.
