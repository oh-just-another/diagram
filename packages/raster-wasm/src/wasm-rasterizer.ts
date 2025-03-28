import type { Vec2 } from "@oh-just-another/types";
import type { PathCommand } from "@oh-just-another/scene";
import { jsRasterizer, type Rasterizer } from "@oh-just-another/renderer-core";
import { DEFAULT_FLATTEN_TOLERANCE } from "./constants.js";

/**
 * WASM-backed `Rasterizer`. Until `loadModule(...)` swaps in a real
 * WASM build, `flatten` / `strokeToFill` delegate to the JS reference
 * implementation (`jsRasterizer`).
 *
 * Wire-format contract for a WASM build:
 *
 *   memory: WebAssembly.Memory
 *   alloc(bytes): number
 *   free(ptr, bytes): void
 *   flattenF32(commandsPtr, commandsLen, tolerance,
 *              outPtrOut, outCountOut): void
 *     – commands are a packed Float32 array: [kind, x, y, x2, y2,
 *       x3, y3, …] per command; the host writes the count of
 *       produced Vec2 to outCountOut and the pointer to outPtrOut.
 *   strokeToFillF32(polylinePtr, polylineLen, width, cap, join,
 *                   outPtrOut, outCountOut): void
 *     – cap / join are small enums encoded as i32.
 *
 * The host TypeScript copies command arrays into the WASM memory,
 * calls the export, reads the resulting Vec2 array, and frees.
 */

export interface WasmRasterizerExports {
  readonly memory: WebAssembly.Memory;
  readonly alloc: (bytes: number) => number;
  readonly free: (ptr: number, bytes: number) => void;
  readonly flattenF32: (
    commandsPtr: number,
    commandsLen: number,
    tolerance: number,
    outPtrOut: number,
    outCountOut: number,
  ) => void;
  readonly strokeToFillF32: (
    polylinePtr: number,
    polylineLen: number,
    width: number,
    cap: number,
    join: number,
    outPtrOut: number,
    outCountOut: number,
  ) => void;
}

export interface WasmRasterizerOptions {
  /** Default tolerance threaded through when callers omit it. */
  readonly defaultTolerance?: number;
}

const CAP_TO_ENUM: Record<"butt" | "round" | "square", number> = {
  butt: 0,
  round: 1,
  square: 2,
};
const JOIN_TO_ENUM: Record<"miter" | "round" | "bevel", number> = {
  miter: 0,
  round: 1,
  bevel: 2,
};

const COMMAND_KIND: Record<PathCommand["kind"], number> = {
  M: 0,
  L: 1,
  Q: 2,
  C: 3,
  Z: 4,
};

export class WasmRasterizer implements Rasterizer {
  private readonly defaultTolerance: number;
  private wasm: WasmRasterizerExports | null = null;

  constructor(options: WasmRasterizerOptions = {}) {
    this.defaultTolerance = options.defaultTolerance ?? DEFAULT_FLATTEN_TOLERANCE;
  }

  get isReady(): boolean {
    return this.wasm !== null;
  }

  async loadModule(
    source: string | URL | ArrayBuffer | Uint8Array | Response,
  ): Promise<void> {
    const bytes = await fetchModuleBytes(source);
    const { instance } = await WebAssembly.instantiate(bytes, {});
    this.wasm = instance.exports as unknown as WasmRasterizerExports;
  }

  /**
   * Load the bundled `rasterizer.wasm` shipped with this package.
   */
  static async loadBundled(
    options: WasmRasterizerOptions = {},
  ): Promise<WasmRasterizer> {
    const r = new WasmRasterizer(options);
    const url = new URL("../wasm/rasterizer.wasm", import.meta.url);
    await r.loadModule(url);
    return r;
  }

  flatten(commands: readonly PathCommand[], tolerance: number): readonly Vec2[] {
    const t = tolerance > 0 ? tolerance : this.defaultTolerance;
    if (!this.wasm) return jsRasterizer.flatten(commands, t);
    return this.flattenViaWasm(commands, t, this.wasm);
  }

  strokeToFill(
    polyline: readonly Vec2[],
    width: number,
    options?: { readonly cap?: "butt" | "round" | "square"; readonly join?: "miter" | "round" | "bevel" },
  ): readonly Vec2[] {
    if (!this.wasm) return jsRasterizer.strokeToFill(polyline, width, options);
    return this.strokeToFillViaWasm(polyline, width, options, this.wasm);
  }

  private flattenViaWasm(
    commands: readonly PathCommand[],
    tolerance: number,
    wasm: WasmRasterizerExports,
  ): readonly Vec2[] {
    const packed = packCommands(commands);
    const inPtr = wasm.alloc(packed.byteLength);
    new Uint8Array(wasm.memory.buffer, inPtr, packed.byteLength).set(
      new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength),
    );
    const outPtrOut = wasm.alloc(4);
    const outCountOut = wasm.alloc(4);
    try {
      wasm.flattenF32(inPtr, packed.length, tolerance, outPtrOut, outCountOut);
      const outPtr = readU32(wasm.memory, outPtrOut);
      const outCount = readU32(wasm.memory, outCountOut);
      return readVec2Array(wasm.memory, outPtr, outCount);
    } finally {
      wasm.free(inPtr, packed.byteLength);
      wasm.free(outPtrOut, 4);
      wasm.free(outCountOut, 4);
    }
  }

  private strokeToFillViaWasm(
    polyline: readonly Vec2[],
    width: number,
    options: { readonly cap?: "butt" | "round" | "square"; readonly join?: "miter" | "round" | "bevel" } | undefined,
    wasm: WasmRasterizerExports,
  ): readonly Vec2[] {
    const packed = packVec2Array(polyline);
    const inPtr = wasm.alloc(packed.byteLength);
    new Uint8Array(wasm.memory.buffer, inPtr, packed.byteLength).set(
      new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength),
    );
    const outPtrOut = wasm.alloc(4);
    const outCountOut = wasm.alloc(4);
    try {
      const cap = CAP_TO_ENUM[options?.cap ?? "butt"];
      const join = JOIN_TO_ENUM[options?.join ?? "miter"];
      wasm.strokeToFillF32(inPtr, polyline.length, width, cap, join, outPtrOut, outCountOut);
      const outPtr = readU32(wasm.memory, outPtrOut);
      const outCount = readU32(wasm.memory, outCountOut);
      return readVec2Array(wasm.memory, outPtr, outCount);
    } finally {
      wasm.free(inPtr, packed.byteLength);
      wasm.free(outPtrOut, 4);
      wasm.free(outCountOut, 4);
    }
  }
}

const fetchModuleBytes = async (
  source: string | URL | ArrayBuffer | Uint8Array | Response,
): Promise<ArrayBuffer> => {
  if (source instanceof ArrayBuffer) return source;
  if (source instanceof Uint8Array) {
    return source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    ) as ArrayBuffer;
  }
  if (source instanceof Response) return source.arrayBuffer();
  // file:// path goes through fs — Node's fetch doesn't accept it.
  const urlStr = typeof source === "string" ? source : source.href;
  if (urlStr.startsWith("file:")) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = fileURLToPath(urlStr);
    const buf = await readFile(path);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  const res = await fetch(source);
  if (!res.ok) {
    throw new Error(`WasmRasterizer.loadModule: fetch failed (${res.status})`);
  }
  return res.arrayBuffer();
};

const packCommands = (commands: readonly PathCommand[]): Float32Array => {
  // Variable-width pack — layout depends on command kind. Worst case is
  // C (cubic): kind + 6 floats = 7 entries. Allocate generously then trim.
  const buf = new Float32Array(commands.length * 7);
  let off = 0;
  for (const cmd of commands) {
    buf[off++] = COMMAND_KIND[cmd.kind];
    switch (cmd.kind) {
      case "M":
      case "L":
        buf[off++] = cmd.to.x;
        buf[off++] = cmd.to.y;
        break;
      case "Q":
        buf[off++] = cmd.control.x;
        buf[off++] = cmd.control.y;
        buf[off++] = cmd.to.x;
        buf[off++] = cmd.to.y;
        break;
      case "C":
        buf[off++] = cmd.control1.x;
        buf[off++] = cmd.control1.y;
        buf[off++] = cmd.control2.x;
        buf[off++] = cmd.control2.y;
        buf[off++] = cmd.to.x;
        buf[off++] = cmd.to.y;
        break;
      case "Z":
        break;
    }
  }
  return buf.slice(0, off);
};

const packVec2Array = (points: readonly Vec2[]): Float32Array => {
  const out = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    out[i * 2] = points[i]!.x;
    out[i * 2 + 1] = points[i]!.y;
  }
  return out;
};

const readU32 = (memory: WebAssembly.Memory, ptr: number): number =>
  new DataView(memory.buffer, ptr, 4).getUint32(0, true);

const readVec2Array = (
  memory: WebAssembly.Memory,
  ptr: number,
  count: number,
): readonly Vec2[] => {
  const view = new Float32Array(memory.buffer, ptr, count * 2);
  const out: Vec2[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = { x: view[i * 2]!, y: view[i * 2 + 1]! };
  }
  return out;
};
