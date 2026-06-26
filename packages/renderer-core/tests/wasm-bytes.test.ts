import { describe, expect, it, vi } from "vitest";
import { allocBytes, type WasmArena } from "../src/wasm-bytes";

/**
 * Fake bump-allocator arena over a fixed ArrayBuffer. `alloc` hands out a
 * monotonically increasing pointer; `free` is recorded for assertions.
 */
const makeArena = (capacity = 1024) => {
  const buffer = new ArrayBuffer(capacity);
  let next = 0;
  const free = vi.fn<(ptr: number, size: number) => void>();
  const alloc = vi.fn<(size: number) => number>((size: number) => {
    const ptr = next;
    next += size;
    return ptr;
  });
  const arena: WasmArena = { alloc, free, memory: { buffer } };
  return { arena, buffer, alloc, free };
};

describe("allocBytes", () => {
  it("allocates len bytes and copies them into memory at ptr", () => {
    const { arena, buffer, alloc } = makeArena();
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);

    const handle = allocBytes(arena, bytes);

    expect(alloc).toHaveBeenCalledTimes(1);
    expect(alloc).toHaveBeenCalledWith(5);
    expect(handle.len).toBe(5);

    // bytes are visible in the arena's memory at the returned ptr
    const view = new Uint8Array(buffer, handle.ptr, handle.len);
    expect([...view]).toEqual([10, 20, 30, 40, 50]);
  });

  it("writes at the pointer returned by alloc (non-zero offset)", () => {
    const { arena, buffer } = makeArena();
    // burn the first 16 bytes so the next alloc is offset.
    arena.alloc(16);
    const bytes = new Uint8Array([1, 2, 3]);

    const handle = allocBytes(arena, bytes);
    expect(handle.ptr).toBe(16);

    const view = new Uint8Array(buffer, handle.ptr, handle.len);
    expect([...view]).toEqual([1, 2, 3]);
    // memory before ptr is untouched
    expect([...new Uint8Array(buffer, 0, 16)]).toEqual(Array(16).fill(0));
  });

  it("reports len from the source byteLength", () => {
    const { arena } = makeArena();
    const bytes = new Uint8Array(7);
    const handle = allocBytes(arena, bytes);
    expect(handle.len).toBe(7);
  });

  it("free() invokes wasm.free with the same ptr and len", () => {
    const { arena, free } = makeArena();
    const bytes = new Uint8Array([9, 8, 7]);
    const handle = allocBytes(arena, bytes);

    expect(free).not.toHaveBeenCalled();
    handle.free();
    expect(free).toHaveBeenCalledTimes(1);
    expect(free).toHaveBeenCalledWith(handle.ptr, handle.len);
  });

  it("handles empty byte arrays", () => {
    const { arena, free } = makeArena();
    const handle = allocBytes(arena, new Uint8Array(0));
    expect(handle.len).toBe(0);
    handle.free();
    expect(free).toHaveBeenCalledWith(handle.ptr, 0);
  });

  it("copies only the source view, respecting byteOffset", () => {
    const { arena, buffer } = makeArena();
    // a sub-view that starts partway into a larger buffer
    const backing = new Uint8Array([0, 0, 100, 101, 102, 0]);
    const sub = backing.subarray(2, 5); // [100, 101, 102]

    const handle = allocBytes(arena, sub);
    expect(handle.len).toBe(3);
    const view = new Uint8Array(buffer, handle.ptr, handle.len);
    expect([...view]).toEqual([100, 101, 102]);
  });
});
