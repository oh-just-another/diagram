import { describe, expect, it } from "vitest";
import { linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addLink,
  emptyScene,
  orderBetween,
  type Scene,
  type Link,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const link = (): Link => ({
  id: linkId("L"),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 200, y: 0 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
});

const sceneWith = (l: Link): Scene => addLink(emptyScene(), l).scene;

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
  resetTransform: () => {}, size: { width: 800, height: 600 },
} as never;

const makeEditor = () =>
  new Editor({
    host: { addEventListener: () => {}, removeEventListener: () => {}, setPointerCapture: () => {},
      releasePointerCapture: () => {}, hasPointerCapture: () => true,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), style: { cursor: "" } } as never,
    mainTarget: noopTarget, overlayTarget: noopTarget,
    initialScene: sceneWith(link()),
  });

const labelOf = (editor: Editor) => [...editor.scene.links.values()][0]!.label;

describe("link caption inline editing", () => {
  it("begin → commit sets the label text", () => {
    const editor = makeEditor();
    editor.beginLinkCaptionEdit(linkId("L"));
    expect(editor.editingLinkCaption).toBe(linkId("L"));
    editor.commitLinkCaptionEdit("hello");
    expect(editor.editingLinkCaption).toBeNull();
    expect(labelOf(editor)?.text).toBe("hello");
  });

  it("committing empty text removes the label", () => {
    const editor = makeEditor();
    editor.beginLinkCaptionEdit(linkId("L"));
    editor.commitLinkCaptionEdit("hi");
    expect(labelOf(editor)?.text).toBe("hi");
    editor.beginLinkCaptionEdit(linkId("L"));
    editor.commitLinkCaptionEdit("   ");
    expect(labelOf(editor)).toBeUndefined();
  });

  it("cancel leaves the label untouched", () => {
    const editor = makeEditor();
    editor.beginLinkCaptionEdit(linkId("L"));
    editor.commitLinkCaptionEdit("keep");
    editor.beginLinkCaptionEdit(linkId("L"));
    editor.cancelLinkCaptionEdit();
    expect(editor.editingLinkCaption).toBeNull();
    expect(labelOf(editor)?.text).toBe("keep");
  });

  it("linkLabelWorld returns the path midpoint", () => {
    const editor = makeEditor();
    const p = editor.linkLabelWorld(linkId("L"));
    expect(p?.x).toBeCloseTo(100, 0);
    expect(p?.y).toBeCloseTo(0, 0);
  });
});
