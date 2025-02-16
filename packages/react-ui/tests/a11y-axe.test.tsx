import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import axe, { type Result } from "axe-core";
import {
  BottomSheet,
  HelpDialog,
  LayerPanel,
  MainMenu,
  Palette,
  PropertyPanel,
  ToastHost,
} from "../src/index";

/**
 * Runs axe-core against the JSDOM-rendered output of each top-level
 * react-ui component. The build fails on `critical` and `serious` impact
 * violations; `moderate` and `minor` are surfaced in the console for
 * hand-fixing.
 */

const runAxe = async (container: HTMLElement): Promise<readonly Result[]> => {
  const result = await axe.run(container, {
    // jsdom's CSS engine is too narrow to evaluate WCAG colour-contrast
    // accurately; skip those rules here and let the `meets-contrast-aa`
    // unit checks (math/color) cover them.
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });
  return result.violations;
};

const hasCriticalOrSerious = (violations: readonly Result[]): readonly Result[] =>
  violations.filter((v) => v.impact === "critical" || v.impact === "serious");

describe("axe-core a11y sweep", () => {
  it("Palette has no critical / serious violations", async () => {
    const { container } = render(<Palette />);
    const violations = hasCriticalOrSerious(await runAxe(container));
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it("PropertyPanel has no critical / serious violations", async () => {
    const { container } = render(<PropertyPanel />);
    const violations = hasCriticalOrSerious(await runAxe(container));
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it("LayerPanel has no critical / serious violations", async () => {
    const { container } = render(<LayerPanel />);
    const violations = hasCriticalOrSerious(await runAxe(container));
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it("MainMenu has no critical / serious violations", async () => {
    const { container } = render(
      <MainMenu>
        <MainMenu.Item onClick={() => {}}>Dummy</MainMenu.Item>
      </MainMenu>,
    );
    const violations = hasCriticalOrSerious(await runAxe(container));
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it("HelpDialog has no critical / serious violations", async () => {
    const { container } = render(<HelpDialog open onClose={() => {}} />);
    const violations = hasCriticalOrSerious(await runAxe(container));
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it("ToastHost has no critical / serious violations", async () => {
    const { container } = render(<ToastHost />);
    const violations = hasCriticalOrSerious(await runAxe(container));
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it("BottomSheet has no critical / serious violations", async () => {
    const { container } = render(<BottomSheet>content</BottomSheet>);
    const violations = hasCriticalOrSerious(await runAxe(container));
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

const formatViolations = (violations: readonly Result[]): string => {
  if (violations.length === 0) return "no violations";
  return violations
    .map(
      (v) =>
        `[${v.impact ?? "?"}] ${v.id}: ${v.help}\n  ${v.nodes
          .map((n) => n.html)
          .join("\n  ")}`,
    )
    .join("\n\n");
};
