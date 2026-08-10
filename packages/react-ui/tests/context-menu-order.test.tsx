import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_MENU, type ContextMenuItem } from "../src/menus/context-menu";

/**
 * Pins the context-menu section order: clipboard → styles → comments →
 * arrange/align/layout/layers → selection → lock → delete. Viewport and
 * clear-canvas entries live in the static chrome, not here. The
 * grouping mirrors the target toolbar/menu design (see design docs) and
 * regressions here silently reshuffle the whole right-click UX.
 */

// Flatten submenus in place so nested ids keep their parent's position.
const flatten = (items: readonly ContextMenuItem[]): readonly ContextMenuItem[] =>
  items.flatMap((item) => (item.kind === "submenu" ? [item, ...flatten(item.items)] : [item]));
const FLAT = flatten(DEFAULT_CONTEXT_MENU);

const indexOf = (id: string): number => {
  const i = FLAT.findIndex((item) => item.kind !== "divider" && item.id === id);
  if (i === -1) throw new Error(`Action ${id} missing from DEFAULT_CONTEXT_MENU`);
  return i;
};

describe("DEFAULT_CONTEXT_MENU order", () => {
  it("keeps the section order stable", () => {
    const order = [
      "copy",
      "duplicate-selection",
      "unlock-all",
      "copy-style",
      "add-text",
      "add-sticky",
      "add-comment",
      "go-to-start-view",
      "set-current-view-as-start",
      "toggle-grid",
      "snap-to-grid",
      "snapObjects",
      "showObjectSize",
      "suggestObjectSize",
      "wheel-mode",
      "wheel-mode-auto",
      "zoom-to-fit",
      "arrange",
      "bring-to-front",
      "bring-forward",
      "send-backward",
      "send-to-back",
      "flip-horizontal",
      "align",
      "align-left",
      "distribute-vertical",
      "layout",
      "arrange-grid",
      "auto-arrange",
      "move-to-layer",
      "select-all",
      "group-selection",
      "toggle-lock",
      "unlock-element",
      "delete-selection",
    ];
    const positions = order.map(indexOf);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  const submenuIds = (id: string): readonly string[] => {
    const sub = DEFAULT_CONTEXT_MENU.find((i) => i.kind === "submenu" && i.id === id);
    if (sub?.kind !== "submenu") throw new Error(`Submenu ${id} missing`);
    return sub.items.map((i) => (i.kind === "divider" ? "-" : i.id));
  };

  it("groups order / flip / align / distribute / layout under three submenus", () => {
    expect(submenuIds("arrange")).toEqual([
      "bring-to-front",
      "bring-forward",
      "send-backward",
      "send-to-back",
      "-",
      "flip-horizontal",
      "flip-vertical",
    ]);
    expect(submenuIds("align")).toEqual([
      "align-left",
      "align-h-center",
      "align-right",
      "-",
      "align-top",
      "align-v-center",
      "align-bottom",
      "-",
      "distribute-horizontal",
      "distribute-vertical",
    ]);
    expect(submenuIds("layout")).toEqual([
      "arrange-grid",
      "arrange-stack-h",
      "arrange-stack-v",
      "-",
      "auto-arrange",
    ]);
    // None of the nested ids leak to the top level.
    const nested = new Set([
      ...submenuIds("arrange"),
      ...submenuIds("align"),
      ...submenuIds("layout"),
    ]);
    expect(DEFAULT_CONTEXT_MENU.some((i) => i.kind === "action" && nested.has(i.id))).toBe(false);
  });

  it("keeps delete after every other mutating selection op", () => {
    expect(indexOf("delete-selection")).toBeGreaterThan(indexOf("duplicate-selection"));
    expect(indexOf("delete-selection")).toBeGreaterThan(indexOf("toggle-lock"));
    expect(indexOf("delete-selection")).toBe(FLAT.length - 1);
  });
});
