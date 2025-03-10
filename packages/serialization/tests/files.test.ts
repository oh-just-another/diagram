import { describe, expect, it } from "vitest";
import { fileId } from "@oh-just-another/types";
import {
  addBinaryFile,
  createBinaryFile,
  emptyScene,
} from "@oh-just-another/scene";
import { parseFiles, serializeFiles, stringifyFiles } from "../src/files";

const bytesOf = (...values: number[]) => new Uint8Array(values).buffer as ArrayBuffer;

const sceneWithFiles = (...entries: ReturnType<typeof createBinaryFile>[]) =>
  entries.reduce((s, f) => addBinaryFile(s, f), emptyScene());

describe("files sidecar serializer", () => {
  it("serializeFiles emits version=1 + per-file entry with base64 data", () => {
    const f = createBinaryFile(fileId("f1"), bytesOf(0x10, 0x20, 0x30), {
      mime: "image/png",
      name: "pic.png",
      createdAt: 1700000000000,
    });
    const out = serializeFiles(sceneWithFiles(f));
    expect(out.version).toBe(1);
    expect(out.files).toHaveLength(1);
    const e = out.files[0]!;
    expect(e.id).toBe("f1");
    expect(e.mime).toBe("image/png");
    expect(e.name).toBe("pic.png");
    expect(e.createdAt).toBe(1700000000000);
    expect(typeof e.data).toBe("string");
    expect(e.data.length).toBeGreaterThan(0);
  });

  it("parseFiles reverses serializeFiles (byte-exact)", () => {
    const f = createBinaryFile(fileId("f1"), bytesOf(0x10, 0x20, 0x30, 0xff, 0x00, 0x7f), {
      mime: "application/octet-stream",
    });
    const json = stringifyFiles(sceneWithFiles(f));
    const restored = parseFiles(json);
    const back = restored.get(fileId("f1"))!;
    expect(back.mime).toBe("application/octet-stream");
    expect([...new Uint8Array(back.data)]).toEqual([0x10, 0x20, 0x30, 0xff, 0x00, 0x7f]);
  });

  it("parseFiles rejects unsupported version", () => {
    const broken = JSON.stringify({ version: 99, files: [] });
    expect(() => parseFiles(broken)).toThrow(/unsupported/);
  });

  it("handles large files via chunked base64 encoder", () => {
    const N = 100_000;
    const big = new Uint8Array(N);
    for (let i = 0; i < N; i++) big[i] = i % 256;
    const f = createBinaryFile(fileId("big"), big.buffer as ArrayBuffer, { mime: "image/png" });
    const json = stringifyFiles(sceneWithFiles(f));
    const back = parseFiles(json).get(fileId("big"))!;
    expect(back.data.byteLength).toBe(N);
    const bytes = new Uint8Array(back.data);
    expect(bytes[0]).toBe(0);
    expect(bytes[N - 1]).toBe((N - 1) % 256);
  });
});
