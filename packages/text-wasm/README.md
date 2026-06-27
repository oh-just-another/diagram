# @oh-just-another/text-wasm

[![npm version](https://img.shields.io/npm/v/@oh-just-another/text-wasm.svg)](https://www.npmjs.com/package/@oh-just-another/text-wasm)

WASM-backed `TextShaper` for the diagram renderer.

L2. Implements `@oh-just-another/renderer-core`'s `TextShaper` interface. Until a WASM module is loaded, `measure` uses a synchronous geometric estimate so first paint isn't blank; `loadModule(...)` swaps in a real shaper at runtime. No module is bundled — the host picks the engine that matches its font pipeline.

## Install

```bash
pnpm add @oh-just-another/text-wasm
```

## Quick start

```ts
import { WasmTextShaper } from "@oh-just-another/text-wasm";

const shaper = new WasmTextShaper();
await shaper.loadModule("/text-shaper.wasm"); // optional — without it, the fallback estimate is used

// pass into the editor
const editor = new Editor({ textShaper: shaper /* … */ });
```

## Expected WASM exports

```ts
interface WasmShaperExports {
  memory: WebAssembly.Memory;
  alloc(bytes: number): number;
  free(ptr: number, bytes: number): void;
  setFont(familyPtr: number, familyLen: number, size: number): void;
  measure(textPtr: number, textLen: number): number; // advance width in CSS px
}
```

Any toolchain that emits a `WebAssembly.Instance` matching this shape works (Rust + `wasm-bindgen` with `#[no_mangle]` exports, AssemblyScript, hand-crafted `.wat`, …). Optional `glyphMetrics` / `rasterizeGlyphMSDF` exports, when present, feed `@oh-just-another/glyph-atlas`.
