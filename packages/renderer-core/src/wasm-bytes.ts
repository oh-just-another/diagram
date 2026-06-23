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
