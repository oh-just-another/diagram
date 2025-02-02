# @oh-just-another/text-wasm

WASM-backed `TextShaper` implementation for the diagram renderer (Phase 46).

Default fallback: a synchronous geometric estimate so first paint isn't blank. Plug a real WASM module (HarfBuzz / harfbuzzjs / ICU4X / canvaskit-text) via `loadModule(...)` once it is fetched.

```ts
import { WasmTextShaper } from "@oh-just-another/text-wasm";

const shaper = new WasmTextShaper();
await shaper.loadModule("/text-shaper.wasm"); // optional — without it, fallback is used

// pass into the editor
const editor = new Editor({ textShaper: shaper, /* … */ });
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

Any toolchain that emits a `WebAssembly.Instance` matching this shape works (Rust + `wasm-bindgen` with `#[no_mangle]` exports, AssemblyScript, hand-crafted `.wat`, …). The kernel does not ship a bundled module — hosts pick the engine that matches their font pipeline.

