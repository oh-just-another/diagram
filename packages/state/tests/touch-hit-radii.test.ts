import { describe, expect, it } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import {
  ANCHOR_START_HIT_SLOP,
  ANCHOR_DOT_CLICK_RADIUS,
  TOUCH_ANCHOR_START_HIT_SLOP,
  TOUCH_ANCHOR_DOT_CLICK_RADIUS,
  HANDLE_HIT_SLOP,
  TOUCH_HANDLE_HIT_SLOP,
  LINK_HIT_THRESHOLD,
  TOUCH_LINK_HIT_THRESHOLD,
} from "../src/constants.js";

/**
 * §6 — on a coarse (touch) pointer the editor enlarges the hit zones so a
 * finger can grab handles, link bodies, and the link-start anchor dots. The
 * drawn affordances stay the same size; only the hit radii grow. Explicit
 * `inputMode` avoids the matchMedia auto-detection (no window in node).
 */
const noopTarget = new Proxy(
  {},
  {
    get: (_t, k) => (k === "size" ? { width: 100, height: 100 } : () => undefined),
  },
) as never;

const host = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const make = (inputMode: "mouse" | "touch") =>
  new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: emptyScene(),
    inputMode,
  }) as unknown as {
    anchorStartHitSlop: number;
    anchorClickRadius: number;
    handleHitSlop: number;
    edgeHitThreshold: number;
    dispose: () => void;
  };

describe("touch-sized hit radii (§6)", () => {
  it("mouse mode uses the small mouse radii", () => {
    const e = make("mouse");
    expect(e.anchorStartHitSlop).toBe(ANCHOR_START_HIT_SLOP);
    expect(e.anchorClickRadius).toBe(ANCHOR_DOT_CLICK_RADIUS);
    expect(e.handleHitSlop).toBe(HANDLE_HIT_SLOP);
    expect(e.edgeHitThreshold).toBe(LINK_HIT_THRESHOLD);
    e.dispose();
  });

  it("touch mode enlarges every hit radius", () => {
    const e = make("touch");
    expect(e.anchorStartHitSlop).toBe(TOUCH_ANCHOR_START_HIT_SLOP);
    expect(e.anchorClickRadius).toBe(TOUCH_ANCHOR_DOT_CLICK_RADIUS);
    expect(e.handleHitSlop).toBe(TOUCH_HANDLE_HIT_SLOP);
    expect(e.edgeHitThreshold).toBe(TOUCH_LINK_HIT_THRESHOLD);
    // …and each is strictly bigger than its mouse counterpart.
    expect(e.anchorStartHitSlop).toBeGreaterThan(ANCHOR_START_HIT_SLOP);
    expect(e.anchorClickRadius).toBeGreaterThan(ANCHOR_DOT_CLICK_RADIUS);
    expect(e.handleHitSlop).toBeGreaterThan(HANDLE_HIT_SLOP);
    e.dispose();
  });
});
