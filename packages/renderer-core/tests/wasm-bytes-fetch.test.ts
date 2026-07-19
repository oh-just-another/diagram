import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchModuleBytes } from "../src/raster/wasm-bytes";

/**
 * Source-normalisation coverage for `fetchModuleBytes` — the `allocBytes`
 * half of the module is covered in `wasm-bytes.test.ts`.
 */

const BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // "\0asm"

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchModuleBytes", () => {
  it("returns an ArrayBuffer source as-is", async () => {
    const buf = BYTES.slice().buffer;
    await expect(fetchModuleBytes(buf, "test")).resolves.toBe(buf);
  });

  it("copies a Uint8Array view (respecting byteOffset) into a fresh buffer", async () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const view = backing.subarray(2, 5);
    const out = await fetchModuleBytes(view, "test");
    expect([...new Uint8Array(out)]).toEqual([1, 2, 3]);
    expect(out.byteLength).toBe(3);
  });

  it("unwraps a Response via arrayBuffer()", async () => {
    const res = new Response(BYTES.slice());
    const out = await fetchModuleBytes(res, "test");
    expect([...new Uint8Array(out)]).toEqual([...BYTES]);
  });

  it("reads file:// URLs from disk (string and URL forms)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wasm-bytes-"));
    const path = join(dir, "module.wasm");
    await writeFile(path, BYTES);
    const url = pathToFileURL(path);

    const fromUrl = await fetchModuleBytes(url, "test");
    expect([...new Uint8Array(fromUrl)]).toEqual([...BYTES]);

    const fromString = await fetchModuleBytes(url.href, "test");
    expect([...new Uint8Array(fromString)]).toEqual([...BYTES]);
  });

  it("fetches http URLs and returns the body bytes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(BYTES.slice()));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchModuleBytes("https://example.test/mod.wasm", "test");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://example.test/mod.wasm");
    expect([...new Uint8Array(out)]).toEqual([...BYTES]);
  });

  it("throws a context-labelled error on a failed fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(
      fetchModuleBytes("https://example.test/missing.wasm", "WasmRasterizer.loadModule"),
    ).rejects.toThrow(/WasmRasterizer\.loadModule: fetch failed \(404\)/);
  });
});
