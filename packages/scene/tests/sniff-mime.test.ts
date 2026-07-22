/**
 * Magic-byte MIME sniffing — the fallback for `BinaryFile`s stored with a
 * generic `application/octet-stream` mime (empty `File.type` at drop time).
 */
import { describe, expect, it } from "vitest";
import { sniffBinaryFileMime } from "../src/model/file.js";

const buf = (...bytes: (number | string)[]): ArrayBuffer => {
  const out: number[] = [];
  for (const b of bytes) {
    if (typeof b === "number") out.push(b);
    else for (const ch of b) out.push(ch.charCodeAt(0));
  }
  return new Uint8Array(out).buffer;
};

describe("sniffBinaryFileMime", () => {
  it("detects mp4 / mov (ISO-BMFF ftyp)", () => {
    expect(sniffBinaryFileMime(buf(0, 0, 0, 0x20, "ftypisom", 0, 0, 0, 0))).toBe("video/mp4");
  });
  it("detects webm (EBML)", () => {
    expect(sniffBinaryFileMime(buf(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0))).toBe("video/webm");
  });
  it("detects png", () => {
    expect(sniffBinaryFileMime(buf(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  });
  it("detects jpeg", () => {
    expect(sniffBinaryFileMime(buf(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });
  it("detects gif", () => {
    expect(sniffBinaryFileMime(buf("GIF89a"))).toBe("image/gif");
  });
  it("detects webp (RIFF container)", () => {
    expect(sniffBinaryFileMime(buf("RIFF", 1, 2, 3, 4, "WEBP"))).toBe("image/webp");
  });
  it("detects svg", () => {
    expect(sniffBinaryFileMime(buf('<svg xmlns="http'))).toBe("image/svg+xml");
  });
  it("returns null for unknown bytes and tiny buffers", () => {
    expect(sniffBinaryFileMime(buf(1, 2, 3, 4, 5, 6, 7, 8))).toBeNull();
    expect(sniffBinaryFileMime(buf(1))).toBeNull();
    expect(sniffBinaryFileMime(new ArrayBuffer(0))).toBeNull();
  });
});
