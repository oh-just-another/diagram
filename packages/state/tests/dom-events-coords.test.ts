import { describe, expect, it } from "vitest";
import { fromPointerEvent, fromWheelEvent } from "../src/dom-events.js";

/**
 * Pointer / wheel coordinate mapping is host-relative: the domain point is
 * always `client − host.getBoundingClientRect()`, in CSS pixels, regardless
 * of where the host sits in the page (offset by chrome, scrolled, inset by a
 * docked panel) or the input device (mouse / touch / pen / trackpad). Pinned
 * across a spread of host rects and pointer types.
 */

// Minimal host stub returning a fixed bounding rect.
const hostAt = (left: number, top: number): HTMLElement =>
  ({ getBoundingClientRect: () => ({ left, top, right: 0, bottom: 0, width: 0, height: 0, x: left, y: top, toJSON() {} }) }) as unknown as HTMLElement;

const ptr = (over: Partial<PointerEvent>): PointerEvent =>
  ({
    type: "pointerdown",
    pointerType: "mouse",
    clientX: 0,
    clientY: 0,
    buttons: 1,
    pointerId: 1,
    timeStamp: 0,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...over,
  }) as PointerEvent;

describe("fromPointerEvent — host-relative coordinates", () => {
  const cases = [
    { desc: "origin host", left: 0, top: 0, clientX: 120, clientY: 80, ex: 120, ey: 80 },
    { desc: "host offset by top bar", left: 0, top: 48, clientX: 120, clientY: 80, ex: 120, ey: 32 },
    { desc: "host inset by left panel", left: 252, top: 0, clientX: 300, clientY: 200, ex: 48, ey: 200 },
    { desc: "scrolled page (negative rect)", left: -40, top: -300, clientX: 10, clientY: 10, ex: 50, ey: 310 },
    { desc: "fractional DPR-ish rect", left: 12.5, top: 7.25, clientX: 112.5, clientY: 57.25, ex: 100, ey: 50 },
  ];
  for (const c of cases) {
    it(c.desc, () => {
      const data = fromPointerEvent(ptr({ clientX: c.clientX, clientY: c.clientY }), hostAt(c.left, c.top));
      expect(data.point.x).toBeCloseTo(c.ex, 6);
      expect(data.point.y).toBeCloseTo(c.ey, 6);
    });
  }

  it("maps pointerType to mouse / touch / pen", () => {
    const host = hostAt(0, 0);
    expect(fromPointerEvent(ptr({ pointerType: "mouse" }), host).kind).toBe("mouse");
    expect(fromPointerEvent(ptr({ pointerType: "touch" }), host).kind).toBe("touch");
    expect(fromPointerEvent(ptr({ pointerType: "pen" }), host).kind).toBe("pen");
    // Unknown device (e.g. some trackpads report "") falls back to mouse.
    expect(fromPointerEvent(ptr({ pointerType: "" }), host).kind).toBe("mouse");
  });

  it("carries modifier keys (trackpad ctrl-zoom, shift-constrain, etc.)", () => {
    const data = fromPointerEvent(ptr({ ctrlKey: true, shiftKey: true }), hostAt(0, 0));
    expect(data.modifiers).toEqual({ shift: true, ctrl: true, alt: false, meta: false });
  });
});

describe("fromWheelEvent — host-relative + trackpad deltas", () => {
  const wheel = (over: Partial<WheelEvent>): WheelEvent =>
    ({
      clientX: 0,
      clientY: 0,
      deltaX: 0,
      deltaY: 0,
      deltaZ: 0,
      timeStamp: 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...over,
    }) as WheelEvent;

  it("point is host-relative; ctrl+wheel (pinch-zoom on trackpads) is flagged", () => {
    const data = fromWheelEvent(wheel({ clientX: 200, clientY: 100, deltaY: -53, ctrlKey: true }), hostAt(50, 20));
    expect(data.point).toEqual({ x: 150, y: 80 });
    expect(data.deltaY).toBe(-53);
    expect(data.modifiers.ctrl).toBe(true); // trackpad pinch = ctrl+wheel
  });
});
