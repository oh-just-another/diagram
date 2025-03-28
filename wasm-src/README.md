# wasm-src

Rust source for the two WebAssembly modules consumed by the
`@oh-just-another/text-wasm` and `@oh-just-another/raster-wasm` packages.

## Crates

### `text-shaper/`

Text shaping via `ttf-parser`. Embeds **Roboto Regular** (~500 KB)
inside the wasm so a single fetch / read gives both the engine and
the font. Exports:

| Name | Signature | Notes |
|---|---|---|
| `memory` | `WebAssembly.Memory` | linear memory, auto-exported |
| `alloc(n)` | `(usize) → *mut u8` | bump allocator |
| `free(ptr, n)` | `(*mut u8, usize) → ()` | no-op (bump = no reclaim) |
| `reset()` | `() → ()` | bump cursor back to 0 |
| `setFont(family_ptr, family_len, size_px)` | `(*const u8, usize, f32)` | `family` ignored — only Roboto |
| `measure(text_ptr, text_len)` | `(*const u8, usize) → f32` | advance width in CSS-px |

Footprint: ~590 KB `.wasm` after `opt-level = "z"` + strip.

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
