/**
 * View › "Flow connectors" / "Comments" switches drive the editor's view
 * toggles and stay in sync with them.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { Editor, type EditorAPI } from "../src/index";

installBuiltinRenderers();

const FORCE = { renderer: "canvas2d", wasmText: false, wasmRaster: false, workers: false } as const;

afterEach(() => {
  cleanup();
});

const openView = (): void => {
  act(() => {
    screen.getByRole("button", { name: "Main menu" }).click();
  });
  act(() => {
    screen.getByText("View").click();
  });
};

const checkedOf = (label: string): string | null =>
  screen.getByText(label).closest("[aria-checked]")?.getAttribute("aria-checked") ?? null;

describe("<Editor> — View toggles", () => {
  it("Flow connectors and Comments switches flip the editor state and their checkmarks", async () => {
    const ref = createRef<EditorAPI>();
    render(<Editor ref={ref} capabilities={FORCE} />);
    await waitFor(() => {
      expect(ref.current?.editor).toBeTruthy();
    });
    const ed = ref.current!.editor!;
    openView();
    expect(checkedOf("Flow connectors")).toBe("true");
    expect(checkedOf("Comments")).toBe("true");
    act(() => {
      screen.getByText("Flow connectors").click();
    });
    expect(ed.showConnectors).toBe(false);
    expect(checkedOf("Flow connectors")).toBe("false");
    act(() => {
      screen.getByText("Comments").click();
    });
    expect(ed.showComments).toBe(false);
    expect(checkedOf("Comments")).toBe("false");
    // Programmatic change reaches the menu (subscription, not local state).
    act(() => {
      ed.setShowConnectors(true);
    });
    expect(checkedOf("Flow connectors")).toBe("true");
  });
});
