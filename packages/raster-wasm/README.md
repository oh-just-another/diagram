# @oh-just-another/raster-wasm

WASM-backed `Rasterizer` implementation for the diagram renderer (Phase 47).

Default fallback: delegates to the pure-JS `jsRasterizer` shipped by `@oh-just-another/renderer-core`. Plug a real WASM build (Skia path-ops port, custom Rust, AssemblyScript, …) via `loadModule(...)` once it's fetched.

```ts
import { WasmRasterizer } from "@oh-just-another/raster-wasm";

const rasterizer = new WasmRasterizer();
await rasterizer.loadModule("/raster.wasm"); // optional — JS fallback used until then

const editor = new Editor({ rasterizer, /* … */ });
```

## Expected WASM exports

```ts
interface WasmRasterizerExports {
  memory: WebAssembly.Memory;
  alloc(bytes: number): number;
  free(ptr: number, bytes: number): void;
  flattenF32(
    commandsPtr: number,
    commandsLen: number,
    tolerance: number,
    outPtrOut: number,
    outCountOut: number,
  ): void;
  strokeToFillF32(
    polylinePtr: number,
    polylineLen: number,
    width: number,
    cap: number, // 0=butt, 1=round, 2=square
    join: number, // 0=miter, 1=round, 2=bevel
    outPtrOut: number,
    outCountOut: number,
  ): void;
}
```

Commands are packed into a Float32 array: `[kindEnum, x0, y0, x1?, y1?, x2?, y2?]` per command (variable width). Output Vec2 arrays are returned by writing `outPtr` + `outCount` to caller-provided host pointers.

