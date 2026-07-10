import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { HelpDialog } from "../src/index";

/**
 * The flowchart arrow bindings are keyTest-driven (modifier combos the
 * declarative matcher can't express), but they also carry a display-only
 * `hotkey` array so the help dialog can synthesize real key chips instead of
 * the "—" placeholder shown for chip-less actions.
 */
const rowFor = (container: HTMLElement, label: string): HTMLElement => {
  const rows = [...container.querySelectorAll(".du-help-row")];
  const row = rows.find((r) => r.querySelector(".du-help-row-label")?.textContent === label);
  if (!(row instanceof HTMLElement)) throw new Error(`help row not found: ${label}`);
  return row;
};

describe("HelpDialog flowchart bindings", () => {
  it("renders key chips (not the — placeholder) for create + navigate", () => {
    const { container } = render(<HelpDialog open onClose={() => undefined} />);
    for (const label of ["Create connected node", "Navigate to adjacent node"]) {
      const row = rowFor(container, label);
      // Four directional chips (one per arrow), so no "—" placeholder.
      const chips = row.querySelectorAll("kbd.du-help-key");
      expect(chips.length).toBeGreaterThan(0);
      const firstSep = row.querySelector(".du-help-keys-separator");
      expect(firstSep?.textContent ?? "or").not.toBe("—");
    }
  });
});
