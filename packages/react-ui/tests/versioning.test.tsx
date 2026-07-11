/**
 * Behavioural coverage for `<VersionPanel>`: capturing a snapshot writes
 * to the store, restoring loads the snapshot's scene into the editor,
 * diffing surfaces a summary, branching creates a new branch, and clicking
 * a branch header switches the current branch. The panel's window-dialog
 * calls (prompt / confirm / alert) are stubbed so the flows run headless.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { SnapshotStore, captureFromEditor } from "@oh-just-another/versioning";
import { DiagramProvider, VersionPanel } from "../src/index";

installBuiltinRenderers();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AUTHOR = { id: "u1", name: "Ada" };

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc", stroke: "#000", strokeWidth: 2 },
  width: 50,
  height: 50,
});

const mountEditor = (withRect = true): Editor => {
  let scene = emptyScene();
  if (withRect) ({ scene } = addElement(scene, rect("r1")));
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }),
  });
  const noop = new Proxy({} as Record<string, unknown>, {
    get: (_, key) =>
      key === "size"
        ? { width: 800, height: 600 }
        : key === "measureText"
          ? () => ({ width: 0 })
          : () => {},
  }) as never;
  return new Editor({
    host: host as never,
    mainTarget: noop,
    overlayTarget: noop,
    initialScene: scene,
  });
};

const renderPanel = (store: SnapshotStore, editor: Editor) =>
  render(
    <DiagramProvider editor={editor}>
      <VersionPanel store={store} author={AUTHOR} />
    </DiagramProvider>,
  );

describe("VersionPanel capture", () => {
  it("captures the editor's scene into the store on '+ capture'", () => {
    const store = new SnapshotStore();
    const editor = mountEditor();
    vi.spyOn(window, "prompt").mockReturnValue("My snapshot");

    const { getByText } = renderPanel(store, editor);
    expect(store.list().length).toBe(0);

    act(() => {
      fireEvent.click(getByText("+ capture"));
    });
    expect(store.list().length).toBe(1);
    expect(store.list()[0]?.message).toBe("My snapshot");
    expect(store.list()[0]?.author.name).toBe("Ada");
    editor.dispose();
  });

  it("falls back to 'Untitled snapshot' when the prompt is dismissed", () => {
    const store = new SnapshotStore();
    const editor = mountEditor();
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const { getByText } = renderPanel(store, editor);
    act(() => {
      fireEvent.click(getByText("+ capture"));
    });
    expect(store.list()[0]?.message).toBe("Untitled snapshot");
    editor.dispose();
  });
});

describe("VersionPanel snapshot rows", () => {
  it("renders captured snapshots with their message and author", () => {
    const store = new SnapshotStore();
    const editor = mountEditor();
    captureFromEditor(store, editor, { message: "v1", author: AUTHOR });
    const { container } = renderPanel(store, editor);
    expect(container.textContent).toContain("v1");
    expect(container.textContent).toContain("Ada");
    editor.dispose();
  });

  it("restores a snapshot's scene into the editor on ↻ (confirm accepted)", () => {
    const store = new SnapshotStore();
    const editor = mountEditor();
    // Capture the single-rect scene, then clear the editor.
    captureFromEditor(store, editor, { message: "with-rect", author: AUTHOR });
    editor.loadScene(emptyScene());
    expect(editor.scene.elements.size).toBe(0);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = renderPanel(store, editor);
    const restoreBtn = container.querySelector(
      'button[title="Restore this version"]',
    ) as HTMLButtonElement;
    act(() => {
      fireEvent.click(restoreBtn);
    });
    expect(editor.scene.elements.size).toBe(1);
    editor.dispose();
  });

  it("does not restore when confirm is declined", () => {
    const store = new SnapshotStore();
    const editor = mountEditor();
    captureFromEditor(store, editor, { message: "with-rect", author: AUTHOR });
    editor.loadScene(emptyScene());
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = renderPanel(store, editor);
    act(() => {
      fireEvent.click(container.querySelector('button[title="Restore this version"]')!);
    });
    expect(editor.scene.elements.size).toBe(0);
    editor.dispose();
  });

  it("shows a diff summary via alert on Δ", () => {
    const store = new SnapshotStore();
    const editor = mountEditor();
    captureFromEditor(store, editor, { message: "base", author: AUTHOR });
    // Diverge the current scene from the snapshot.
    editor.addElement(rect("r2"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { container } = renderPanel(store, editor);
    act(() => {
      fireEvent.click(container.querySelector('button[title="Diff with current scene"]')!);
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const message = alertSpy.mock.calls[0]?.[0] as string;
    expect(message).toContain("Shapes:");
    // One shape added since the snapshot.
    expect(message).toContain("+1");
    editor.dispose();
  });

  it("creates a new branch from a snapshot on ⎇ and switches to it", () => {
    const store = new SnapshotStore();
    const editor = mountEditor();
    captureFromEditor(store, editor, { message: "base", author: AUTHOR });
    vi.spyOn(window, "prompt").mockReturnValue("feature-x");

    const { container } = renderPanel(store, editor);
    expect(store.branches().length).toBe(1);
    act(() => {
      fireEvent.click(container.querySelector('button[title="Branch from here"]')!);
    });
    expect(store.branches().length).toBe(2);
    const created = store.branches().find((b) => b.name === "feature-x");
    expect(created).toBeDefined();
    // Newly-created branch becomes current.
    expect(store.currentBranchId).toBe(created?.id);
    editor.dispose();
  });
});

describe("VersionPanel branches", () => {
  it("switches the current branch when a branch header is clicked", () => {
    const store = new SnapshotStore();
    const editor = mountEditor();
    const first = captureFromEditor(store, editor, { message: "base", author: AUTHOR });
    const feature = store.branch({ name: "feature", fromVersion: first.id });
    const mainId = store.currentBranchId;
    // Sanity: start on main.
    expect(store.currentBranchId).toBe(mainId);

    const { getByText } = renderPanel(store, editor);
    act(() => {
      fireEvent.click(getByText("feature"));
    });
    expect(store.currentBranchId).toBe(feature.id);
    editor.dispose();
  });

  it("disables the capture button when no editor is mounted", () => {
    const store = new SnapshotStore();
    const { getByText } = render(<VersionPanel store={store} author={AUTHOR} />);
    expect((getByText("+ capture") as HTMLButtonElement).disabled).toBe(true);
  });
});
