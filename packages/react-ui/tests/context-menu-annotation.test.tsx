import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@oh-just-another/state";
import { annotationId, type AnnotationId } from "@oh-just-another/types";
import { DEFAULT_CONTEXT_MENU, type ContextMenuItem } from "../src/menus/context-menu";

/**
 * The three annotation-pin items (Open thread / Toggle resolved / Delete
 * annotation) only show up when the right-click landed on a pin, and
 * clicking them dispatches the right Editor command.
 */

const findAction = (id: string): Extract<ContextMenuItem, { kind: "action" }> => {
  const found = DEFAULT_CONTEXT_MENU.find((item) => item.kind === "action" && item.id === id);
  if (!found || found.kind !== "action") {
    throw new Error(`Action ${id} missing from DEFAULT_CONTEXT_MENU`);
  }
  return found;
};

const editorWith = (hit: AnnotationId | null, overrides: Partial<Editor> = {}): Editor =>
  ({
    hitAnnotation: vi.fn(() => hit),
    setSelectedAnnotation: vi.fn(),
    toggleAnnotationResolved: vi.fn(),
    removeAnnotation: vi.fn(),
    ...overrides,
  }) as unknown as Editor;

const ctx = { worldPoint: { x: 0, y: 0 }, screenPoint: { x: 0, y: 0 } };

describe("annotation pin context menu items", () => {
  it("open-thread: visible when pin is under cursor, hidden otherwise", () => {
    const item = findAction("open-thread");
    expect(item.visible?.(editorWith(annotationId("a1")), ctx)).toBe(true);
    expect(item.visible?.(editorWith(null), ctx)).toBe(false);
  });

  it("open-thread click calls setSelectedAnnotation with the hit id", () => {
    const item = findAction("open-thread");
    const editor = editorWith(annotationId("a1"));
    item.onClick(editor, ctx);
    expect(editor.setSelectedAnnotation).toHaveBeenCalledWith(annotationId("a1"));
  });

  it("resolve-annotation click calls toggleAnnotationResolved", () => {
    const item = findAction("resolve-annotation");
    const editor = editorWith(annotationId("a1"));
    item.onClick(editor, ctx);
    expect(editor.toggleAnnotationResolved).toHaveBeenCalledWith(annotationId("a1"));
  });

  it("remove-annotation click calls removeAnnotation", () => {
    const item = findAction("remove-annotation");
    const editor = editorWith(annotationId("a1"));
    item.onClick(editor, ctx);
    expect(editor.removeAnnotation).toHaveBeenCalledWith(annotationId("a1"));
  });

  it("no-op when pointer lands away from any pin (visible=false guards)", () => {
    const editor = editorWith(null);
    for (const id of ["open-thread", "resolve-annotation", "remove-annotation"]) {
      const item = findAction(id);
      expect(item.visible?.(editor, ctx)).toBe(false);
    }
  });
});
