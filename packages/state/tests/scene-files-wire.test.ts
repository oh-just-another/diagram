import { describe, expect, it } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const noopTarget = {
  save: () => {}, restore: () => {}, setTransform: () => {}, clear: () => {},
  setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
  setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
  setDashArray: () => {}, setFont: () => {}, setTextAlign: () => {},
  setTextBaseline: () => {}, beginPath: () => {}, closePath: () => {},
  moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
  bezierCurveTo: () => {}, rect: () => {}, ellipse: () => {},
  fill: () => {}, stroke: () => {}, fillText: () => {},
  measureText: () => ({ width: 0 }), drawImage: () => {},
  translate: () => {}, rotate: () => {}, scale: () => {},
  resetTransform: () => {}, size: { width: 100, height: 100 },
} as never;

const host = {
  addEventListener: () => {}, removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const makeEditor = (): Editor =>
  new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: emptyScene(),
  });

describe("Editor.addBinaryFile + Scene.files end-to-end", () => {
  it("addBinaryFile registers the file under a fresh id", async () => {
    const e = makeEditor();
    const blob = new Blob([new Uint8Array([1, 2, 3]).buffer], { type: "image/png" });
    const id = await e.addBinaryFile(blob, "pic.png");
    expect(typeof id).toBe("string");
    expect(e.scene.files.size).toBe(1);
    const stored = e.scene.files.get(id)!;
    expect(stored.mime).toBe("image/png");
    expect(stored.name).toBe("pic.png");
    expect(new Uint8Array(stored.data)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("addBinaryFile creates a history step that undo reverses", async () => {
    const e = makeEditor();
    const before = e.history.size;
    const blob = new Blob([new Uint8Array([0xff]).buffer], { type: "image/png" });
    const id = await e.addBinaryFile(blob);
    expect(e.history.size - before).toBe(1);
    expect(e.scene.files.has(id)).toBe(true);
    e.undo();
    expect(e.scene.files.has(id)).toBe(false);
  });

  it("default mime falls back to application/octet-stream", async () => {
    const e = makeEditor();
    const blob = new Blob([new Uint8Array([0]).buffer]); // no explicit type
    const id = await e.addBinaryFile(blob);
    expect(e.scene.files.get(id)?.mime).toBe("application/octet-stream");
  });
});
