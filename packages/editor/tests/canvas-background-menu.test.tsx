/**
 * Board › Background color: the rows set the scene's paper colour, the
 * default row clears it, and the root's `--du-canvas-bg` follows the scene.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { Editor, type EditorAPI } from "../src/index";
import { CANVAS_BACKGROUND_PRESETS } from "../src/constants";

installBuiltinRenderers();

const FORCE = { renderer: "canvas2d", wasmText: false, wasmRaster: false, workers: false } as const;

afterEach(() => {
  cleanup();
});

const click = (label: string): void => {
  act(() => {
    screen.getByText(label).click();
  });
};

describe("<Editor> — Board › Background color", () => {
  it("lists every preset, applies a colour to the scene and the root, and the default clears it", async () => {
    const ref = createRef<EditorAPI>();
    const { container } = render(<Editor ref={ref} capabilities={FORCE} />);
    await waitFor(() => {
      expect(ref.current?.editor).toBeTruthy();
    });
    const ed = ref.current!.editor!;
    const root = container.querySelector<HTMLElement>("[data-diagram-root]")!;
    act(() => {
      screen.getByRole("button", { name: "Main menu" }).click();
    });
    click("Board");
    click("Background color");
    for (const preset of CANVAS_BACKGROUND_PRESETS)
      expect(screen.getByText(preset.label)).toBeTruthy();
    click("Black");
    expect(ed.scene.viewport.background).toBe("#000000");
    await waitFor(() => {
      expect(root.style.getPropertyValue("--du-canvas-bg")).toBe("#000000");
    });
    act(() => {
      screen.getByRole("button", { name: "Main menu" }).click();
    });
    click("Board");
    click("Background color");
    click("Light gray");
    expect(ed.scene.viewport.background).toBeUndefined();
    await waitFor(() => {
      expect(root.style.getPropertyValue("--du-canvas-bg")).toBe("");
    });
  });
});
