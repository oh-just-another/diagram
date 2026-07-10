import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { HelpDialog } from "../src/index";

/**
 * Every action with a keyboard binding must show its chips in the help dialog —
 * including keyTest-driven bindings (which carry a display-only `displayHotkey`
 * so the dialog can synthesize chips) and the `arrange` category (align / flip /
 * distribute), which must be present in the dialog's category order.
 */
const rowFor = (container: HTMLElement, label: string): HTMLElement | null => {
  const rows = [...container.querySelectorAll(".du-help-row")];
  const row = rows.find((r) => r.querySelector(".du-help-row-label")?.textContent === label);
  return row instanceof HTMLElement ? row : null;
};

const chipsFor = (container: HTMLElement, label: string): number => {
  const row = rowFor(container, label);
  if (!row) throw new Error(`help row not found: ${label}`);
  return row.querySelectorAll("kbd.du-help-key").length;
};

describe("HelpDialog shows every real key binding", () => {
  it("renders chips for keyTest-driven arrow / Enter bindings (not the — placeholder)", () => {
    const { container } = render(<HelpDialog open onClose={() => undefined} />);
    for (const label of [
      "Create connected node",
      "Navigate to adjacent node",
      "Nudge selection",
      "Edit / create",
    ]) {
      expect(chipsFor(container, label), label).toBeGreaterThan(0);
    }
  });

  it("renders the arrange category (align rows), which was previously dropped", () => {
    const { container } = render(<HelpDialog open onClose={() => undefined} />);
    // The Arrange island heading is present…
    const titles = [...container.querySelectorAll(".du-help-island-title")].map(
      (h) => h.textContent,
    );
    expect(titles).toContain("Arrange");
    // …and an align row shows its Cmd/Ctrl+Shift+Arrow chips.
    expect(chipsFor(container, "Align left")).toBeGreaterThan(0);
  });
});
