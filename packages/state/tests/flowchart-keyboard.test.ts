import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { defaultActionRegistry } from "../src/actions/index.js";

// Excalidraw-style flowchart keyboard model: Cmd/Ctrl+Arrow grows a preview
// CREATE session (committed on Cmd/Ctrl release), Alt+Arrow navigates the link
// graph, Cmd/Ctrl+Shift+Arrow aligns. These tests drive the editor API and the
// action dispatch directly (no DOM keyup — that lives in the React host).

const rect = (id: string, x = 0, y = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 60,
  height: 40,
});

const link = (id: string, from: string, to: string): Link => ({
  id: linkId(id),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "floating", elementId: elementId(from) },
  to: { kind: "floating", elementId: elementId(to) },
  order: orderBetween(null, null),
  style: {},
});

const sceneWith = (els: Element[], links: Link[] = []): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  for (const l of links) s = addLink(s, l).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;

const makeHost = (w = 400, h = 400) =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    style: { cursor: "" },
  }) as never;

const makeEditor = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const arrow = (
  key: string,
  mods: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {},
): KeyboardEvent =>
  ({
    key,
    code: key,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    preventDefault: noop,
  }) as unknown as KeyboardEvent;

describe("Editor flowchart CREATE session", () => {
  it("growFlowchart builds a preview without touching scene or history", () => {
    const editor = makeEditor(sceneWith([rect("src")]));
    editor.setSelection([elementId("src")]);
    editor.growFlowchart("right");
    // Preview populated…
    expect(editor.flowchartPreview).not.toBeNull();
    expect(editor.flowchartPreview!.elements).toHaveLength(1);
    expect(editor.flowchartPreview!.links).toHaveLength(1);
    // …but the scene is untouched (preview only).
    expect(editor.scene.elements.size).toBe(1);
    expect(editor.scene.links.size).toBe(0);
    expect(editor.canUndo).toBe(false);
  });

  it("repeated same-direction grow bumps the sibling count; a new direction resets it", () => {
    const editor = makeEditor(sceneWith([rect("src")]));
    editor.setSelection([elementId("src")]);
    editor.growFlowchart("right");
    editor.growFlowchart("right");
    editor.growFlowchart("right");
    expect(editor.flowchartPreview!.elements).toHaveLength(3);
    editor.growFlowchart("down");
    expect(editor.flowchartPreview!.elements).toHaveLength(1);
  });

  it("commitFlowchart adds the pending nodes+links as one undo step and selects the first", () => {
    const editor = makeEditor(sceneWith([rect("src")]));
    editor.setSelection([elementId("src")]);
    editor.growFlowchart("right");
    editor.growFlowchart("right");
    const pendingFirst = editor.flowchartPreview!.elements[0]!.id;
    const first = editor.commitFlowchart();
    expect(first).toBe(pendingFirst);
    expect(editor.flowchartPreview).toBeNull();
    expect(editor.scene.elements.size).toBe(3); // src + 2 siblings
    expect(editor.scene.links.size).toBe(2);
    expect([...editor.selection]).toEqual([pendingFirst]);
    // A single undo removes every committed node+link.
    editor.undo();
    expect(editor.scene.elements.size).toBe(1);
    expect(editor.scene.links.size).toBe(0);
  });

  it("cancelFlowchart discards the preview without mutating the scene", () => {
    const editor = makeEditor(sceneWith([rect("src")]));
    editor.setSelection([elementId("src")]);
    editor.growFlowchart("right");
    editor.cancelFlowchart();
    expect(editor.flowchartPreview).toBeNull();
    expect(editor.scene.elements.size).toBe(1);
    expect(editor.commitFlowchart()).toBeNull(); // nothing to commit
  });

  it("cancelInteraction clears an active session", () => {
    const editor = makeEditor(sceneWith([rect("src")]));
    editor.setSelection([elementId("src")]);
    editor.growFlowchart("right");
    editor.cancelInteraction();
    expect(editor.flowchartPreview).toBeNull();
  });

  it("growFlowchart is a no-op unless exactly one element is selected", () => {
    const editor = makeEditor(sceneWith([rect("a"), rect("b", 200)]));
    editor.setSelection([elementId("a"), elementId("b")]);
    editor.growFlowchart("right");
    expect(editor.flowchartPreview).toBeNull();
  });
});

describe("Editor navigateFlowchart", () => {
  it("prefers the linked graph neighbour over a nearer unlinked shape", () => {
    // `far` is linked and sits at x=300; `near` is unlinked and closer (x=90).
    // Graph nav must pick the LINKED node, distinguishing it from spatial nearest.
    const editor = makeEditor(
      sceneWith(
        [rect("src", 0, 0), rect("near", 90, 0), rect("far", 300, 0)],
        [link("l1", "src", "far")],
      ),
    );
    editor.setSelection([elementId("src")]);
    editor.navigateFlowchart("right");
    expect([...editor.selection]).toEqual([elementId("far")]);
  });

  it("falls back to the spatially nearest element when no neighbour lies that way", () => {
    // `north` is linked but sits ABOVE; a bare `east` sits to the right.
    const editor = makeEditor(
      sceneWith(
        [rect("src", 0, 0), rect("north", 0, -200), rect("east", 200, 0)],
        [link("l1", "src", "north")],
      ),
    );
    editor.setSelection([elementId("src")]);
    editor.navigateFlowchart("right");
    // No graph neighbour to the right → spatial nearest (`east`).
    expect([...editor.selection]).toEqual([elementId("east")]);
  });

  it("is a no-op unless exactly one element is selected", () => {
    const editor = makeEditor(sceneWith([rect("a"), rect("b", 200)]));
    editor.navigateFlowchart("right");
    expect(editor.selection.size).toBe(0);
  });
});

describe("flowchart keyboard dispatch (registry)", () => {
  it("Cmd/Ctrl+Arrow dispatches growFlowchart (create session), not select-closest", () => {
    const editor = makeEditor(sceneWith([rect("src")]));
    editor.setSelection([elementId("src")]);
    const handled = defaultActionRegistry.dispatchHotkey(arrow("ArrowRight", { meta: true }), {
      editor,
    });
    expect(handled).toBe(true);
    expect(editor.flowchartPreview).not.toBeNull();
    expect(editor.flowchartPreview!.elements).toHaveLength(1);
    // Scene untouched — this is a preview, not the old immediate spawn.
    expect(editor.scene.elements.size).toBe(1);
    editor.cancelFlowchart();
  });

  it("Alt+Arrow dispatches navigateFlowchart", () => {
    const editor = makeEditor(
      sceneWith([rect("src", 0, 0), rect("east", 200, 0)], [link("l1", "src", "east")]),
    );
    editor.setSelection([elementId("src")]);
    const handled = defaultActionRegistry.dispatchHotkey(arrow("ArrowRight", { alt: true }), {
      editor,
    });
    expect(handled).toBe(true);
    expect([...editor.selection]).toEqual([elementId("east")]);
  });

  it("Cmd/Ctrl+Shift+Arrow dispatches align (not create)", () => {
    const editor = makeEditor(sceneWith([rect("a", 0, 0), rect("b", 100, 40)]));
    editor.setSelection([elementId("a"), elementId("b")]);
    const handled = defaultActionRegistry.dispatchHotkey(
      arrow("ArrowLeft", { meta: true, shift: true }),
      { editor },
    );
    expect(handled).toBe(true);
    // Aligned left: both shapes share the minimum x.
    const a = editor.scene.elements.get(elementId("a"))!;
    const b = editor.scene.elements.get(elementId("b"))!;
    expect(a.position.x).toBe(b.position.x);
    // No create session was opened.
    expect(editor.flowchartPreview).toBeNull();
  });

  it("Cmd/Ctrl+Arrow does not double-fire (create session grows by exactly one)", () => {
    const editor = makeEditor(sceneWith([rect("src")]));
    editor.setSelection([elementId("src")]);
    defaultActionRegistry.dispatchHotkey(arrow("ArrowRight", { meta: true }), { editor });
    expect(editor.flowchartPreview!.elements).toHaveLength(1);
    editor.cancelFlowchart();
  });
});
