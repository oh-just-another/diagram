import { describe, expect, it } from "vitest";
import { elementId as castElementId, linkId as castLinkId } from "@oh-just-another/types";
import { InteractionState } from "../src/editor/interaction-state.js";

/** Populate every field with a non-default value. */
const fill = (s: InteractionState): void => {
  s.drawingPreview = { x: 0, y: 0, width: 1, height: 1 };
  s.edgePreview = { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } };
  s.lassoPreview = { x: 0, y: 0, width: 2, height: 2 };
  s.hoveredLinkTarget = { elementId: castElementId("e1"), activeAnchor: null, mode: "element" };
  s.hoverCursorWorld = { x: 5, y: 5 };
  s.annotationDrag = null;
  s.linkDragFromAnchor = {
    fromElement: castElementId("e1"),
    fromWorld: { x: 0, y: 0 },
    anchorName: "top",
    origin: { x: 0, y: 0 },
    moved: false,
  };
  s.pendingLinkDropMenu = { linkId: castLinkId("l1"), side: "to", world: { x: 0, y: 0 } };
  s.lassoBaseSelection = new Set([castElementId("e1")]);
  s.lassoBaseLinks = new Set([castLinkId("l1")]);
  s.groupMoveOrigin = new Map([[castElementId("e1"), { x: 0, y: 0 }]]);
  s.groupLinkMoveOrigin = new Map();
  s.groupResizeOrigin = {
    combined: { x: 0, y: 0, width: 1, height: 1 },
    elements: new Map(),
    links: new Map(),
  };
  s.rotateGestureOrigin = { pivot: { x: 0, y: 0 }, origin: new Map() };
  s.resizeOriginElement = null;
  s.snapSuppressed = true;
  s.transformAltKey = true;
  s.transformShiftKey = true;
  s.lastClickAt = 123;
  s.lastClickWorldPoint = { x: 1, y: 1 };
  s.brushStroke = null;
  s.lastPointerWorld = { x: 9, y: 9 };
  s.dragElementId = castElementId("e1");
  s.additivePressAdded = castElementId("e1");
  s.containerHover = { id: castElementId("e1"), dropZone: { x: 0, y: 0, width: 1, height: 1 } };
  s.activePointers.set(1, { x: 0, y: 0 });
  s.touchPanCandidate = { x: 2, y: 2 };
  s.spaceHeld = true;
  s.panGesture = {
    pointerId: 1,
    button: 0,
    startPoint: { x: 0, y: 0 },
    lastPoint: { x: 0, y: 0 },
    moved: true,
  };
  s.suppressNextContextMenu = true;
  s.editingLinkCaption = castLinkId("l1");
};

describe("InteractionState", () => {
  it("defaults every field to null / false / 0 / empty", () => {
    const s = new InteractionState();
    expect(s.drawingPreview).toBeNull();
    expect(s.edgePreview).toBeNull();
    expect(s.lassoPreview).toBeNull();
    expect(s.hoveredLinkTarget).toBeNull();
    expect(s.hoverCursorWorld).toBeNull();
    expect(s.snapSuppressed).toBe(false);
    expect(s.transformAltKey).toBe(false);
    expect(s.transformShiftKey).toBe(false);
    expect(s.spaceHeld).toBe(false);
    expect(s.suppressNextContextMenu).toBe(false);
    expect(s.lastClickAt).toBe(0);
    expect(s.activePointers.size).toBe(0);
    expect(s.panGesture).toBeNull();
    expect(s.editingLinkCaption).toBeNull();
  });

  it("resetPreviews clears only the preview fields", () => {
    const s = new InteractionState();
    fill(s);
    s.resetPreviews();

    expect(s.drawingPreview).toBeNull();
    expect(s.edgePreview).toBeNull();
    expect(s.lassoPreview).toBeNull();
    expect(s.hoveredLinkTarget).toBeNull();
    expect(s.hoverCursorWorld).toBeNull();

    // Non-preview state is untouched.
    expect(s.linkDragFromAnchor).not.toBeNull();
    expect(s.groupMoveOrigin).not.toBeNull();
    expect(s.dragElementId).not.toBeNull();
    expect(s.spaceHeld).toBe(true);
    expect(s.activePointers.size).toBe(1);
    expect(s.editingLinkCaption).not.toBeNull();
  });

  it("reset returns every field to its default", () => {
    const s = new InteractionState();
    fill(s);
    s.reset();

    const fresh = new InteractionState();
    for (const key of Object.keys(fresh) as (keyof InteractionState)[]) {
      const val = s[key];
      if (val instanceof Map) {
        expect(val.size).toBe(0);
      } else {
        expect(val).toStrictEqual(fresh[key]);
      }
    }
  });
});
