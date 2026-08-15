import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { elementId } from "@oh-just-another/types";
import { DEFAULT_LAYER_ID, emptyScene, orderBetween, type Element } from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { Editor as EditorClass, defaultActionRegistry } from "@oh-just-another/state";
import { Editor, type EditorAPI } from "../src/index";

installBuiltinRenderers();

// Force a deterministic, jsdom-mountable backend: Canvas2D, no WASM loads,
// no workers. (webgl2 can't create a GL context under jsdom.)
const FORCE = { renderer: "canvas2d", wasmText: false, wasmRaster: false, workers: false } as const;

const rect: Element = {
  id: elementId("r1"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  width: 50,
  height: 50,
};

type EditorProps = Parameters<typeof Editor>[0];

async function mountEditor(
  props: Omit<EditorProps, "ref"> = {},
): Promise<{ ref: React.RefObject<EditorAPI | null>; result: ReturnType<typeof render> }> {
  const ref = createRef<EditorAPI>();
  const result = render(<Editor ref={ref} capabilities={FORCE} {...props} />);
  await waitFor(() => {
    expect(ref.current?.editor).toBeTruthy();
  });
  act(() => {
    ref.current?.editor?.setViewportSize(800, 600);
  });
  return { ref, result };
}

afterEach(() => {
  cleanup();
});

describe("<Editor> — mount & capabilities", () => {
  it("resolves capabilities and exposes the editor via ref", async () => {
    const { ref } = await mountEditor();
    expect(ref.current?.editor).toBeTruthy();
    expect(ref.current?.capabilities?.renderer).toBe("canvas2d");
    expect(ref.current?.capabilities?.wasmText).toBe(false);
  });

  it("applies className to the mounted root", async () => {
    const { result } = await mountEditor({ className: "my-editor" });
    expect(result.container.querySelector(".my-editor")).not.toBeNull();
  });
});

describe("<Editor> — imperative API", () => {
  it("getScene returns the current scene; loadScene swaps it", async () => {
    const { ref } = await mountEditor();
    const before = ref.current?.getScene();
    expect(before).toBeTruthy();

    const next = ref.current?.getScene();
    expect(next).toBe(before); // stable until something changes

    const target = ref.current?.editor?.scene;
    expect(target).toBeTruthy();
    act(() => {
      ref.current?.loadScene({ ...target!, viewport: { ...target!.viewport, gridEnabled: true } });
    });
    expect(ref.current?.getScene().viewport.gridEnabled).toBe(true);
  });
});

describe("<Editor> — scene settings props", () => {
  it("is gridless by default", async () => {
    const { ref } = await mountEditor();
    expect(ref.current?.editor?.scene.viewport.gridEnabled).toBe(false);
  });

  it("enables the grid via the grid prop", async () => {
    const { ref } = await mountEditor({ grid: { enabled: true, style: "dots" } });
    expect(ref.current?.editor?.scene.viewport.gridEnabled).toBe(true);
    expect(ref.current?.editor?.scene.viewport.gridStyle).toBe("dots");
  });

  it("a persisted initialScene wins over the grid prop", async () => {
    // initialScene carries gridEnabled:false; the prop asks for true → data wins.
    const { ref } = await mountEditor({ initialScene: emptyScene(), grid: { enabled: true } });
    expect(ref.current?.editor?.scene.viewport.gridEnabled).toBe(false);
  });
});

describe("<Editor> — callbacks", () => {
  it("calls onReady exactly once with the editor exposed on the ref", async () => {
    const onReady = vi.fn();
    const { ref } = await mountEditor({ onReady });
    await new Promise((r) => setTimeout(r, 30)); // let any deferred remount land
    expect(onReady).toHaveBeenCalledTimes(1);
    // ...and with a single distinct editor instance (no orphaned first mount).
    expect(new Set(onReady.mock.calls.map((c) => c[0])).size).toBe(1);
    expect(onReady.mock.calls[0]?.[0]).toBe(ref.current?.editor);
  });

  it("fires onSceneChange when the scene mutates", async () => {
    const onSceneChange = vi.fn();
    const { ref } = await mountEditor({ onSceneChange });
    onSceneChange.mockClear();
    act(() => {
      ref.current?.editor?.addElement(rect);
    });
    await waitFor(() => {
      expect(onSceneChange).toHaveBeenCalled();
    });
  });

  it("fires onSelectionChange when the selection changes", async () => {
    const onSelectionChange = vi.fn();
    const { ref } = await mountEditor({ onSelectionChange });
    act(() => {
      ref.current?.editor?.addElement(rect, { select: false });
    });
    onSelectionChange.mockClear();
    act(() => {
      ref.current?.editor?.setSelection([rect.id]);
    });
    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenCalled();
    });
    const ids = onSelectionChange.mock.calls.at(-1)?.[0] as ReadonlySet<string>;
    expect(ids.has(rect.id)).toBe(true);
  });
});

describe("<Editor> — slots & chrome flags", () => {
  it("renders a top-bar slot, and hideTopBar removes it", async () => {
    const slot = () => <span data-testid="slot-x">SLOT</span>;
    const { result } = await mountEditor({ renderTopBarRight: slot });
    expect(screen.getByTestId("slot-x")).toBeTruthy();
    result.unmount();

    await mountEditor({ renderTopBarRight: slot, hideTopBar: true });
    expect(screen.queryByTestId("slot-x")).toBeNull();
  });
});

describe("<Editor> — minimap", () => {
  it("is off by default", async () => {
    await mountEditor();
    expect(screen.queryByLabelText("Diagram minimap")).toBeNull();
  });

  it("renders with the `minimap` prop and hides in zen mode", async () => {
    const { ref } = await mountEditor({ minimap: true });
    expect(screen.queryByLabelText("Diagram minimap")).not.toBeNull();
    // Zen hides every chrome surface, the minimap included.
    act(() => {
      const ed = ref.current?.editor;
      if (ed) defaultActionRegistry.dispatch("toggle-zen-mode", { editor: ed });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Diagram minimap")).toBeNull();
    });
  });
});

describe("<Editor> — theme scoping", () => {
  it("applies data-theme to its own root, not the global <html>", async () => {
    const { result } = await mountEditor({ theme: "dark" });
    const root = result.container.querySelector("[data-diagram-root]");
    expect(root?.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("omits data-theme for system theme (falls through to the stylesheet)", async () => {
    const { result } = await mountEditor({ theme: "system" });
    const root = result.container.querySelector("[data-diagram-root]");
    expect(root?.hasAttribute("data-theme")).toBe(false);
  });
});

describe("<Editor> — prop permutations", () => {
  it("mounts with persisted / controlled theme variants", async () => {
    const { ref: r1 } = await mountEditor({ persistTheme: true, defaultTheme: "light" });
    expect(r1.current?.editor).toBeTruthy();
    cleanup();
    const { ref: r2 } = await mountEditor({ persistTheme: "custom-theme-key", theme: "dark" });
    expect(r2.current?.editor).toBeTruthy();
  });

  it("registers provided file-drop handlers on the editor", async () => {
    const spy = vi.spyOn(EditorClass.prototype, "registerFileDropHandler");
    const handler = { accept: () => false, handle: () => undefined };
    await mountEditor({ fileDropHandlers: [handler as never] });
    expect(spy).toHaveBeenCalledWith(handler);
    spy.mockRestore();
  });

  it("removes chrome when the hide* flags are set", async () => {
    const { result: full } = await mountEditor({});
    const fullButtons = full.container.querySelectorAll("button").length;
    full.unmount();

    const { result: bare } = await mountEditor({
      hideToolbar: true,
      hideMainMenu: true,
      hideBottomBar: true,
      hideZoomControls: true,
      hideLibraryButton: true,
      hideHelpButton: true,
      hideContextMenu: true,
      hideSelectionPanel: true,
      hideResetToContent: true,
    });
    // Hiding the toolbar / menu / zoom / help / library strips many buttons.
    expect(bare.container.querySelectorAll("button").length).toBeLessThan(fullButtons);
  });

  it("renders slots in every bar position", async () => {
    const slot = (id: string) => () => <span data-testid={id}>x</span>;
    await mountEditor({
      renderTopBarLeft: slot("tl"),
      renderTopBarCenter: slot("tc"),
      renderBottomBarLeft: slot("bl"),
      renderBottomBarCenter: slot("bc"),
      renderBottomBarRight: slot("br"),
      renderMainMenuExtras: slot("mm"),
    });
    expect(screen.getByTestId("tl")).toBeTruthy();
    expect(screen.getByTestId("bc")).toBeTruthy();
  });
});

describe("<Editor> — zoom menu", () => {
  it("opens from the zoom percentage and lists the view rows + presets", async () => {
    const { ref } = await mountEditor({ minimap: true });
    const trigger = screen.getByRole("button", { name: "Zoom menu" });
    expect(trigger.textContent).toBe("100%");
    act(() => {
      trigger.click();
    });
    for (const label of [
      "Hide minimap",
      "Grid",
      "Object dimensions",
      "Fit to screen",
      "50%",
      "2000%",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // A preset sets the absolute zoom and closes the menu.
    act(() => {
      screen.getByText("400%").click();
    });
    expect(ref.current?.editor?.scene.viewport.zoom).toBeCloseTo(4, 5);
    expect(screen.queryByText("Fit to screen")).toBeNull();
    expect(trigger.textContent).toBe("400%");
  });

  it("the Object dimensions switch flips the preference and keeps the menu open", async () => {
    const { ref } = await mountEditor({});
    act(() => {
      screen.getByRole("button", { name: "Zoom menu" }).click();
    });
    const sw = screen.getByRole("switch", { name: "Object dimensions" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    act(() => {
      sw.click();
    });
    expect(ref.current?.editor?.preferences.showObjectSize).toBe(false);
    expect(
      screen.getByRole("switch", { name: "Object dimensions" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("the minimap row and the M key toggle the minimap", async () => {
    await mountEditor({ minimap: true });
    expect(screen.queryByLabelText("Diagram minimap")).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));
    });
    expect(screen.queryByLabelText("Diagram minimap")).toBeNull();
    act(() => {
      screen.getByRole("button", { name: "Zoom menu" }).click();
    });
    act(() => {
      screen.getByText("Show minimap").click();
    });
    expect(screen.queryByLabelText("Diagram minimap")).not.toBeNull();
  });
});

describe("<Editor> — nested main menu", () => {
  it("shows the five sections and opens View › Grid / Preferences › Mouse or trackpad", async () => {
    const { ref } = await mountEditor({});
    act(() => {
      screen.getByRole("button", { name: "Main menu" }).click();
    });
    for (const label of ["Board", "Edit", "View", "Preferences", "Hotkeys"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Sections are collapsed until hovered / clicked.
    expect(screen.queryByText("Undo")).toBeNull();
    act(() => {
      screen.getByText("View").click();
    });
    expect(screen.getByRole("switch", { name: "Object dimensions" })).toBeTruthy();
    act(() => {
      screen.getByText("Grid").click();
    });
    expect(screen.getByText("Dot grid")).toBeTruthy();
    act(() => {
      screen.getByText("Dot grid").click();
    });
    expect(ref.current?.editor?.scene.viewport.gridStyle).toBe("dots");
    expect(ref.current?.editor?.gridEnabled).toBe(true);
    // Preferences › Mouse or trackpad is a radio list over the wheel mode.
    act(() => {
      screen.getByRole("button", { name: "Main menu" }).click();
    });
    act(() => {
      screen.getByText("Preferences").click();
    });
    act(() => {
      screen.getByText("Mouse or trackpad").click();
    });
    act(() => {
      screen.getByText("Trackpad").click();
    });
    expect(ref.current?.editor?.preferences.wheelMode).toBe("trackpad");
  });
});
