import { describe, expect, it } from "vitest";
import { DEFAULT_CANVAS_BACKGROUND, emptyScene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const makeHost = () =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  }) as never;

const makeEditor = (): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: emptyScene(),
  });

describe("Editor.setCanvasBackground", () => {
  it("persists in the viewport, undoes and redoes", () => {
    const editor = makeEditor();
    expect(editor.canvasBackground).toBe(DEFAULT_CANVAS_BACKGROUND);
    editor.setCanvasBackground("#000000");
    expect(editor.scene.viewport.background).toBe("#000000");
    expect(editor.canvasBackground).toBe("#000000");
    editor.undo();
    expect(editor.scene.viewport.background).toBeUndefined();
    editor.redo();
    expect(editor.canvasBackground).toBe("#000000");
  });

  it("null clears the field and a no-op write leaves history alone", () => {
    const editor = makeEditor();
    editor.setCanvasBackground("#ffffff");
    editor.setCanvasBackground(null);
    expect("background" in editor.scene.viewport).toBe(false);
    editor.setCanvasBackground(null);
    editor.undo();
    expect(editor.scene.viewport.background).toBe("#ffffff");
  });
});
