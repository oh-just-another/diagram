/// <reference lib="dom" />
/* ^ TypeScript ships the `WebAssembly` namespace types only inside
 * lib.dom / lib.webworker; the API itself is a pure JS-engine global
 * (present in Node and browsers alike), so this is a types-only opt-in
 * — no DOM value is used by this module or package. */

/**
 * Normalise a wasm module source into raw bytes.
 *
 * Accepts an already-resolved `ArrayBuffer` / `Uint8Array` / `Response`, or a
 * URL / string to fetch. `file://` URLs are read straight from disk because
 * Node's WHATWG `fetch` refuses them (not implemented as of Node 22), so
 * bundled loaders keep working in tests / SSR / CLI contexts.
 *
 * `context` labels the error thrown on a failed fetch (e.g.
 * `"WasmRasterizer.loadModule"`).
 */
export const fetchModuleBytes = async (
  source: string | URL | ArrayBuffer | Uint8Array | Response,
  context: string,
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
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const res = await fetch(source);
  if (!res.ok) {
    throw new Error(`${context}: fetch failed (${res.status})`);
  }
  return res.arrayBuffer();
};

/**
 * Instantiate a WASM module, preferring `WebAssembly.instantiateStreaming`
 * when the source is a fetchable http(s) URL / Response — compilation
 * overlaps the download and skips the intermediate ArrayBuffer copy.
 * Falls back to the buffered `fetchModuleBytes` + `instantiate` path for
 * raw bytes, `file://` URLs (Node reads them from disk), hosts without
 * `instantiateStreaming`, or servers that mis-serve the wasm MIME type
 * (streaming compilation requires `application/wasm`).
 *
 * Shared by every wasm-backed package (`raster-wasm`, `text-wasm`) so
 * the streaming-with-fallback policy lives in one place.
 */
export const instantiateWasm = async (
  source: string | URL | ArrayBuffer | Uint8Array | Response,
  context: string,
): Promise<WebAssembly.Instance> => {
  const streamable =
    typeof WebAssembly.instantiateStreaming === "function" &&
    (source instanceof Response ||
      ((typeof source === "string" || source instanceof URL) &&
        !String(source).startsWith("file:")));
  if (streamable) {
    try {
      // Clone a passed-in Response so the buffered fallback can still
      // consume the original body if streaming compilation rejects.
      const res = source instanceof Response ? source.clone() : await fetch(source);
      const { instance } = await WebAssembly.instantiateStreaming(res, {});
      return instance;
    } catch {
      // Fall through to the buffered path — it re-fetches (or reads the
      // original Response) and surfaces the real compile error if the
      // module itself is broken.
    }
  }
  const bytes = await fetchModuleBytes(source, context);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance;
};

/** Minimal WASM bump-allocator surface used for FFI marshalling. */
export interface WasmArena {
  readonly alloc: (size: number) => number;
  readonly free: (ptr: number, size: number) => void;
  readonly memory: { readonly buffer: ArrayBufferLike };
}

/** Copy `bytes` into freshly-alloc'd WASM memory; returns the pointer + a `free` cleanup. */
export const allocBytes = (
  wasm: WasmArena,
  bytes: Uint8Array,
): { readonly ptr: number; readonly len: number; readonly free: () => void } => {
  const len = bytes.byteLength;
  const ptr = wasm.alloc(len);
  new Uint8Array(wasm.memory.buffer, ptr, len).set(bytes);
  return {
    ptr,
    len,
    free: () => {
      wasm.free(ptr, len);
    },
  };
};
