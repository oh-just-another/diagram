/**
 * Sticky-note and emoji plugin types: size presets, the author strip,
 * glyph replacement, label editing on stickies and wire round-trip via
 * the custom-element schema.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  isElementHidden,
  orderBetween,
  type Element,
  type Scene,
  type StickyElement,
  type EmojiElement,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { STICKY_SIZE_PRESETS } from "../src/constants.js";

const sticky = (id: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "sticky",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#fff9b1" },
    width: 160,
    height: 160,
  }) as unknown as Element;

const emoji = (id: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "emoji",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    glyph: "😀",
    size: 48,
  }) as unknown as Element;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = {
  measureText: (s: string) => ({ width: typeof s === "string" ? s.length * 7 : 0 }),
};
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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    style: { cursor: "" },
  }) as never;

const editorWith = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

describe("sticky notes", () => {
  it("setStickySize applies a square preset (undoable, skips non-stickies)", () => {
    const e = editorWith(sceneWith(sticky("s"), emoji("e")));
    const l = STICKY_SIZE_PRESETS.find((p) => p.id === "l")!;
    e.setStickySize([elementId("s"), elementId("e")], l.side);
    const after = e.scene.elements.get(elementId("s")) as StickyElement;
    expect(after.width).toBe(l.side);
    expect(after.height).toBe(l.side);
    expect((e.scene.elements.get(elementId("e")) as EmojiElement).size).toBe(48);
    e.undo();
    expect((e.scene.elements.get(elementId("s")) as StickyElement).width).toBe(160);
  });

  it("toggleStickyAuthor turns the strip on and fills the author name", () => {
    const e = editorWith(sceneWith(sticky("s")));
    e.setCommentAuthor({ id: "u1", name: "Rustam" });
    e.toggleStickyAuthor([elementId("s")]);
    const after = e.scene.elements.get(elementId("s")) as StickyElement;
    expect(after.showAuthor).toBe(true);
    expect(after.authorName).toBe("Rustam");
    e.toggleStickyAuthor([elementId("s")]);
    expect((e.scene.elements.get(elementId("s")) as StickyElement).showAuthor).toBe(false);
  });

  it("double-click text editing works on stickies (embedded label)", () => {
    const e = editorWith(sceneWith(sticky("s")));
    e.beginTextEdit(elementId("s"));
    e.setEditingText("todo", 4, 4);
    e.commitTextEdit();
    expect(
      (e.scene.elements.get(elementId("s")) as unknown as { label?: { text: string } }).label?.text,
    ).toBe("todo");
  });

  it("hidden/locked semantics apply like any other element", () => {
    const e = editorWith(sceneWith(sticky("s")));
    e.setSelection([elementId("s")]);
    e.toggleLockSelection();
    expect(e.hitTest({ x: 50, y: 50 }).kind).toBe("empty");
    e.unlockElement(elementId("s"));
    expect(isElementHidden(e.scene, e.scene.elements.get(elementId("s"))!)).toBe(false);
  });
});

describe("emoji elements", () => {
  it("setEmojiGlyph replaces the glyph (undoable)", () => {
    const e = editorWith(sceneWith(emoji("e")));
    e.setEmojiGlyph([elementId("e")], "🚀");
    expect((e.scene.elements.get(elementId("e")) as EmojiElement).glyph).toBe("🚀");
    e.undo();
    expect((e.scene.elements.get(elementId("e")) as EmojiElement).glyph).toBe("😀");
  });
});

describe("sticky tags and reactions", () => {
  it("setStickyTags replaces the list and clears with []", () => {
    const e = editorWith(sceneWith(sticky("s")));
    e.setStickyTags([elementId("s")], ["idea", "todo"]);
    expect((e.scene.elements.get(elementId("s")) as StickyElement).tags).toEqual(["idea", "todo"]);
    e.setStickyTags([elementId("s")], []);
    expect((e.scene.elements.get(elementId("s")) as StickyElement).tags).toBeUndefined();
  });

  it("toggleStickyReaction: own click adds then removes; other users stack", () => {
    const e = editorWith(sceneWith(sticky("s")));
    e.setCommentAuthor({ id: "u1", name: "One" });
    e.toggleStickyReaction(elementId("s"), "🔥");
    expect((e.scene.elements.get(elementId("s")) as StickyElement).reactions).toEqual([
      { glyph: "🔥", users: ["u1"] },
    ]);
    // Another collaborator reacting stacks the counter…
    e.setCommentAuthor({ id: "u2", name: "Two" });
    e.toggleStickyReaction(elementId("s"), "🔥");
    expect((e.scene.elements.get(elementId("s")) as StickyElement).reactions).toEqual([
      { glyph: "🔥", users: ["u1", "u2"] },
    ]);
    // …while re-clicking your OWN reaction removes it.
    e.toggleStickyReaction(elementId("s"), "🔥");
    expect((e.scene.elements.get(elementId("s")) as StickyElement).reactions).toEqual([
      { glyph: "🔥", users: ["u1"] },
    ]);
    e.setCommentAuthor({ id: "u1", name: "One" });
    e.toggleStickyReaction(elementId("s"), "🔥");
    expect((e.scene.elements.get(elementId("s")) as StickyElement).reactions).toBeUndefined();
  });
});
