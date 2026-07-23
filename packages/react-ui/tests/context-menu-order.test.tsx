import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_MENU } from "../src/menus/context-menu";

/**
 * Pins the context-menu section order: clipboard → styles → comments →
 * z-order/layers → selection & arrange → lock → delete → viewport. The
 * grouping mirrors the target toolbar/menu design (see design docs) and
 * regressions here silently reshuffle the whole right-click UX.
 */

const indexOf = (id: string): number => {
  const i = DEFAULT_CONTEXT_MENU.findIndex((item) => item.kind === "action" && item.id === id);
  if (i === -1) throw new Error(`Action ${id} missing from DEFAULT_CONTEXT_MENU`);
  return i;
};

describe("DEFAULT_CONTEXT_MENU order", () => {
  it("keeps the section order stable", () => {
    const order = [
      "copy",
      "duplicate-selection",
      "copy-style",
      "add-comment",
      "bring-to-front",
      "bring-forward",
      "send-backward",
      "send-to-back",
      "move-to-layer",
      "select-all",
      "group-selection",
      "toggle-lock",
      "unlock-element",
      "delete-selection",
      "zoom-in",
      "clear-canvas",
    ];
    const positions = order.map(indexOf);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it("keeps delete after every other mutating selection op", () => {
    expect(indexOf("delete-selection")).toBeGreaterThan(indexOf("duplicate-selection"));
    expect(indexOf("delete-selection")).toBeGreaterThan(indexOf("toggle-lock"));
    expect(indexOf("delete-selection")).toBeLessThan(indexOf("zoom-in"));
  });
});
