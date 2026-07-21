/**
 * Repro: drawing a shape with grid snapping enabled must land the new
 * shape on the grid (both corners), same as move / resize do.
 */
import { describe, expect, it, vi } from "vitest";
import { emptyScene, DEFAULT_GRID_SPACING } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const flushRAF = () => {
  vi.runAllTimers();
};

const ev = (type: string, x: number, y: number) => ({
  type,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: "mouse",
  button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  timeStamp: 0,
  preventDefault: () => undefined,
});

const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 800, height: 600 } } as Record<
    string,
    unknown
  >,
  { get: (o, k: string) => (k in o ? o[k] : () => undefined) },
) as never;

describe("snap-to-grid on shape creation", () => {
  it("shows a live rubber-band preview while drawing a frame", () => {
    vi.useFakeTimers();
    const handlers = new Map<string, (e: unknown) => void>();
    const host = {
      addEventListener: (t: string, fn: (e: unknown) => void) => handlers.set(t, fn),
      removeEventListener: (t: string) => handlers.delete(t),
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
      hasPointerCapture: () => true,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      style: { cursor: "" },
    } as never;
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: emptyScene(),
    });
    editor.setViewportSize(800, 600);
    editor.setActiveTool("draw-frame");
    flushRAF();

    handlers.get("pointerdown")!(ev("pointerdown", 20, 20));
    handlers.get("pointermove")!(ev("pointermove", 200, 160));
    flushRAF();

    // Regression: `isDrawingPhase` didn't know "draw-frame", so the
    // rubber-band never appeared while drawing a frame.
    expect(editor.drawingPreview).not.toBeNull();

    handlers.get("pointerup")!(ev("pointerup", 200, 160));
    flushRAF();
    expect([...editor.scene.elements.values()].length).toBe(1);
    vi.useRealTimers();
  });

  it("snaps a drag-drawn rect's corners to the grid", () => {
    vi.useFakeTimers();
    const handlers = new Map<string, (e: unknown) => void>();
    const host = {
      addEventListener: (t: string, fn: (e: unknown) => void) => handlers.set(t, fn),
      removeEventListener: (t: string) => handlers.delete(t),
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
      hasPointerCapture: () => true,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      style: { cursor: "" },
    } as never;
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: emptyScene(),
    });
    editor.setViewportSize(800, 600);
    editor.setGrid({ enabled: true, snap: true });
    editor.setActiveTool("draw-rect");
    flushRAF();

    handlers.get("pointerdown")!(ev("pointerdown", 13, 7));
    handlers.get("pointermove")!(ev("pointermove", 144, 123));
    flushRAF();

    // The LIVE rubber-band preview must already sit on the grid — the
    // original bug: only the final commit snapped, so drawing looked
    // like snapping was off.
    const g = DEFAULT_GRID_SPACING;
    const preview = editor.drawingPreview!;
    expect(preview.x % g).toBe(0);
    expect(preview.y % g).toBe(0);
    expect((preview.x + preview.width) % g).toBe(0);
    expect((preview.y + preview.height) % g).toBe(0);

    handlers.get("pointerup")!(ev("pointerup", 144, 123));
    flushRAF();

    const shapes = [...editor.scene.elements.values()];
    expect(shapes.length).toBe(1);
    const s = shapes[0]! as { position: { x: number; y: number }; width: number; height: number };
    expect(s.position.x % g).toBe(0);
    expect(s.position.y % g).toBe(0);
    expect((s.position.x + s.width) % g).toBe(0);
    expect((s.position.y + s.height) % g).toBe(0);
    vi.useRealTimers();
  });
});
