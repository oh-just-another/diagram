import { describe, expect, it } from "vitest";
import { fileId } from "@oh-just-another/types";
import {
  addBinaryFile,
  apply,
  createBinaryFile,
  emptyScene,
  getBinaryFile,
  removeBinaryFile,
  type Patch,
} from "../src/index";

const sampleFile = (id: string, byte = 0x42) =>
  createBinaryFile(fileId(id), new Uint8Array([byte, byte, byte]).buffer as ArrayBuffer, {
    mime: "image/png",
    name: `${id}.png`,
    createdAt: 1700000000000,
  });

describe("Scene.files registry", () => {
  it("emptyScene includes an empty files map", () => {
    const s = emptyScene();
    expect(s.files.size).toBe(0);
  });

  it("addBinaryFile inserts a file and roundtrips through getBinaryFile", () => {
    const s = addBinaryFile(emptyScene(), sampleFile("f1"));
    const got = getBinaryFile(s, fileId("f1"));
    expect(got?.mime).toBe("image/png");
    expect(got?.name).toBe("f1.png");
  });

  it("removeBinaryFile drops the entry", () => {
    let s = addBinaryFile(emptyScene(), sampleFile("f1"));
    s = removeBinaryFile(s, fileId("f1"));
    expect(s.files.size).toBe(0);
  });

  it("removeBinaryFile is no-op when id missing", () => {
    const empty = emptyScene();
    const after = removeBinaryFile(empty, fileId("nope"));
    expect(after).toBe(empty);
  });

  it("apply with a file patch (add → remove) round-trips", () => {
    const f = sampleFile("f1");
    const addP: Patch = { kind: "file", id: f.id, before: null, after: f };
    let s = apply(emptyScene(), addP);
    expect(s.files.has(f.id)).toBe(true);
    const rmP: Patch = { kind: "file", id: f.id, before: f, after: null };
    s = apply(s, rmP);
    expect(s.files.has(f.id)).toBe(false);
  });
});
