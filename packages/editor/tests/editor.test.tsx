import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { elementId } from "@oh-just-another/types";
import { DEFAULT_LAYER_ID, orderBetween, type Element } from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { Editor as EditorClass } from "@oh-just-another/state";
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
      ref.current?.loadScene({ ...target!, viewport: { ...target!.viewport, gridSize: 99 } });
    });
    expect(ref.current?.getScene().viewport.gridSize).toBe(99);
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
