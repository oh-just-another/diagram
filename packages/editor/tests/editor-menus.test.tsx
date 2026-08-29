/**
 * Main-menu rows, the zoom pill, the templates library and the ref API of
 * `<Editor>`: every row dispatches to the editor (or the host callbacks) the
 * way its label promises. Downloads and the clipboard are stubbed — jsdom
 * has neither `URL.createObjectURL` nor `navigator.clipboard`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { elementId } from "@oh-just-another/types";
import { DEFAULT_LAYER_ID, addElement, orderBetween, type Element } from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { defaultActionRegistry, type Editor as EditorClass } from "@oh-just-another/state";
import { Editor, type EditorAPI } from "../src/index";

installBuiltinRenderers();

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

async function mountEditor(props: Omit<EditorProps, "ref"> = {}): Promise<{
  ref: React.RefObject<EditorAPI | null>;
  ed: EditorClass;
  result: ReturnType<typeof render>;
}> {
  const ref = createRef<EditorAPI>();
  const result = render(<Editor ref={ref} capabilities={FORCE} {...props} />);
  await waitFor(() => {
    expect(ref.current?.editor).toBeTruthy();
  });
  const ed = ref.current!.editor!;
  act(() => {
    ed.setViewportSize(800, 600);
  });
  return { ref, ed, result };
}

const withRect = (ed: EditorClass): void => {
  act(() => {
    ed.loadScene(addElement(ed.scene, rect).scene);
  });
};

const click = (label: string): void => {
  act(() => {
    screen.getByText(label).click();
  });
};

/** Close the main menu if a row left it open (keepOpen rows). */
const closeMenu = (): void => {
  if (screen.queryByText("Board") === null) return;
  act(() => {
    screen.getByRole("button", { name: "Main menu" }).click();
  });
};

/** Open the main menu, a section, optionally a nested submenu, then click a row. */
const viaMenu = (...path: string[]): void => {
  closeMenu();
  act(() => {
    screen.getByRole("button", { name: "Main menu" }).click();
  });
  for (const label of path) click(label);
};

const checkedOf = (label: string): string | null =>
  screen.getByText(label).closest("[aria-checked]")?.getAttribute("aria-checked") ?? null;

let createObjectURL: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createObjectURL = vi.fn(() => "blob:test");
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("<Editor> — ref API", () => {
  it("tool, selection, history and zoom-to-fit reach the editor", async () => {
    const { ref, ed } = await mountEditor();
    withRect(ed);
    const api = ref.current!;
    act(() => {
      api.setActiveTool("hand");
    });
    expect(api.getActiveTool()?.type).toBe("hand");
    expect(ed.activeTool.type).toBe("hand");
    act(() => {
      api.setSelection([rect.id]);
    });
    expect([...api.getSelection()]).toEqual([rect.id]);
    act(() => {
      ed.deleteSelected();
    });
    expect(ed.scene.elements.size).toBe(0);
    act(() => {
      api.undo();
    });
    expect(ed.scene.elements.size).toBe(1);
    act(() => {
      api.redo();
    });
    expect(ed.scene.elements.size).toBe(0);
    const fit = vi.spyOn(ed, "zoomToFit");
    act(() => {
      api.zoomToFit();
    });
    expect(fit).toHaveBeenCalledTimes(1);
  });
});

describe("<Editor> — Board menu", () => {
  it("Save as JSON and Export › SVG download a blob", async () => {
    const { ed } = await mountEditor();
    withRect(ed);
    viaMenu("Board", "Save as JSON");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    viaMenu("Board", "Export", "SVG");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("Open… opens a file picker", async () => {
    await mountEditor();
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    viaMenu("Board", "Open…");
    expect(inputClick).toHaveBeenCalledTimes(1);
  });

  it("Copy as image and the PNG exports report through onNotify when unsupported / empty", async () => {
    const onNotify = vi.fn();
    await mountEditor({ onNotify });
    viaMenu("Board", "Copy as image");
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("clipboard"));
    for (const row of [
      "PNG (transparent)",
      "PNG (with background)",
      "PNG (with background + grid)",
    ]) {
      onNotify.mockClear();
      viaMenu("Board", "Export", row);
      await waitFor(() => {
        expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("empty"));
      });
    }
  });

  it("Include in export switches flip and keep the menu open", async () => {
    await mountEditor();
    viaMenu("Board", "Export");
    for (const label of ["Sticky reactions", "Sticky tags", "Sticky author"]) {
      expect(checkedOf(label)).toBe("true");
      click(label);
      expect(checkedOf(label)).toBe("false");
    }
  });

  it("start view rows and Reset canvas (behind onConfirm)", async () => {
    const onConfirm = vi.fn(() => false);
    const { ed } = await mountEditor({ onConfirm });
    withRect(ed);
    expect(ed.startView).toBeNull();
    viaMenu("Board", "Set current view as start");
    expect(ed.startView).not.toBeNull();
    const go = vi.spyOn(ed, "goToStartView");
    viaMenu("Board", "Start view");
    expect(go).toHaveBeenCalledTimes(1);
    viaMenu("Board", "Reset canvas");
    expect(onConfirm).toHaveBeenCalledWith(expect.stringContaining("Reset canvas"));
    expect(ed.scene.elements.size).toBe(1);
    onConfirm.mockReturnValue(true);
    viaMenu("Board", "Reset canvas");
    expect(ed.scene.elements.size).toBe(0);
  });
});

describe("<Editor> — Edit menu", () => {
  it("every row calls the matching editor method / action", async () => {
    const { ed } = await mountEditor();
    withRect(ed);
    const rows: readonly [string, keyof EditorClass][] = [
      ["Undo", "undo"],
      ["Redo", "redo"],
      ["Cut", "cutSelected"],
      ["Copy", "copySelected"],
      ["Paste", "paste"],
      ["Select all", "selectAll"],
      ["Delete selected", "deleteSelected"],
    ];
    for (const [label, method] of rows) {
      const spy = vi.spyOn(ed, method as never).mockImplementation((() => undefined) as never);
      viaMenu("Edit", label);
      expect(spy, label).toHaveBeenCalledTimes(1);
    }
    const dispatch = vi.spyOn(defaultActionRegistry, "dispatch").mockImplementation(() => true);
    viaMenu("Edit", "Commands");
    expect(dispatch).toHaveBeenCalledWith(
      "open-command-palette",
      expect.objectContaining({ editor: ed }),
    );
    viaMenu("Edit", "Find");
    expect(dispatch).toHaveBeenCalledWith("open-search", expect.objectContaining({ editor: ed }));
  });
});

describe("<Editor> — View / Preferences menus", () => {
  it("theme, grid snap, object dimensions, minimap and the preference switches", async () => {
    const { ed, result } = await mountEditor();
    viaMenu("View", "Theme", "Dark");
    expect(result.container.querySelector('[data-theme="dark"]')).not.toBeNull();
    const snapBefore = ed.snapToGridEnabled;
    viaMenu("View", "Grid", "Snap to grid");
    expect(ed.snapToGridEnabled).toBe(!snapBefore);
    viaMenu("View", "Object dimensions");
    expect(ed.preferences.showObjectSize).toBe(false);
    viaMenu("View", "Minimap");
    expect(result.container.querySelector(".du-minimap-dock")).not.toBeNull();
    viaMenu("Preferences", "Snap objects");
    expect(ed.preferences.snapObjects).toBe(false);
    viaMenu("Preferences", "Suggest object size");
    expect(ed.preferences.suggestObjectSize).toBe(false);
  });

  it("Hotkeys opens the help dialog; its ✕ closes it", async () => {
    await mountEditor();
    viaMenu("Hotkeys");
    const close = await screen.findByRole("button", { name: "Close help" });
    act(() => {
      close.click();
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Close help" })).toBeNull();
    });
  });
});

describe("<Editor> — templates library", () => {
  it("More shapes opens the library; Close library closes it", async () => {
    await mountEditor();
    act(() => {
      screen.getByRole("button", { name: "Shapes and lines" }).click();
    });
    act(() => {
      screen.getByRole("menuitem", { name: "More shapes" }).click();
    });
    const close = await screen.findByRole("button", { name: "Close library" });
    act(() => {
      close.click();
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Close library" })).toBeNull();
    });
  });

  it("on a coarse-pointer layout the library is a bottom sheet", async () => {
    const mq = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    vi.spyOn(window, "matchMedia").mockImplementation(() => mq as unknown as MediaQueryList);
    await mountEditor();
    act(() => {
      screen.getByRole("button", { name: "Shapes and lines" }).click();
    });
    act(() => {
      screen.getByRole("menuitem", { name: "More shapes" }).click();
    });
    const close = await screen.findByRole("button", { name: "Close library" });
    act(() => {
      close.click();
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Close library" })).toBeNull();
    });
  });
});

describe("<Editor> — zoom pill and window keys", () => {
  it("zoom out / in / fit buttons and the menu's minimap + fit rows", async () => {
    const { ed, result } = await mountEditor();
    withRect(ed);
    act(() => {
      screen.getByRole("button", { name: /^Zoom out/ }).click();
    });
    expect(ed.scene.viewport.zoom).toBeLessThan(1);
    act(() => {
      screen.getByRole("button", { name: /^Zoom in/ }).click();
    });
    expect(ed.scene.viewport.zoom).toBeCloseTo(1, 5);
    const fit = vi.spyOn(ed, "zoomToFit");
    act(() => {
      screen.getByRole("button", { name: /^Fit to screen/ }).click();
    });
    expect(fit).toHaveBeenCalledTimes(1);
    act(() => {
      screen.getByRole("button", { name: "Zoom menu" }).click();
    });
    click("Show minimap");
    expect(result.container.querySelector(".du-minimap-dock")).not.toBeNull();
    act(() => {
      screen.getByRole("button", { name: "Zoom menu" }).click();
    });
    click("Fit to screen");
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it("a stray keyup / window blur with no flowchart session is a no-op", async () => {
    const { ed } = await mountEditor();
    const commit = vi.spyOn(ed, "commitFlowchart");
    act(() => {
      fireEvent.keyUp(window, { key: "Meta" });
      fireEvent.blur(window);
    });
    expect(commit).not.toHaveBeenCalled();
    expect(ed.flowchartPreview).toBeNull();
  });
});
