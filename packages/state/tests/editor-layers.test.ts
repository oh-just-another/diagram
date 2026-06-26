import { describe, expect, it } from "vitest";
import { elementId, layerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

// Covers the editor's layer wrappers (history + notify + active-layer
// retargeting) — the existing layers test only exercises the pure scene-level
// compute functions — plus the link helpers and a few thin public setters.

const rect = (id: string, opts: { x?: number; y?: number; href?: string } = {}): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: opts.x ?? 0, y: opts.y ?? 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
  ...(opts.href !== undefined ? { href: opts.href } : {}),
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const makeHost = () =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  }) as never;

const editorWith = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

describe("editor layer operations", () => {
  it("create / setActive / rename / toggle visibility + lock (with no-op guards)", () => {
    const e = editorWith(sceneWith(rect("a")));
    expect(e.activeLayerId).toBe(DEFAULT_LAYER_ID);

    const l2 = e.createLayer("Layer 2");
    expect(e.scene.layers.has(l2)).toBe(true);
    expect(e.activeLayerId).toBe(l2); // a fresh layer becomes active

    e.setActiveLayer(DEFAULT_LAYER_ID);
    expect(e.activeLayerId).toBe(DEFAULT_LAYER_ID);
    e.setActiveLayer(layerId("missing")); // unknown → no-op
    e.setActiveLayer(DEFAULT_LAYER_ID); // already active → no-op

    e.renameLayer(l2, "Renamed");
    expect(e.scene.layers.get(l2)?.name).toBe("Renamed");
    e.renameLayer(layerId("missing"), "X"); // unknown → no-op
    e.renameLayer(l2, "Renamed"); // unchanged → no-op

    const vis = e.scene.layers.get(l2)!.visible;
    e.toggleLayerVisibility(l2);
    expect(e.scene.layers.get(l2)!.visible).toBe(!vis);
    e.toggleLayerVisibility(layerId("missing")); // no-op

    e.toggleLayerLock(l2);
    expect(e.scene.layers.get(l2)!.locked).toBe(true);
    e.toggleLayerLock(layerId("missing")); // no-op
  });

  it("removeLayer retargets the active layer; moveSelectionToLayer shifts shapes", () => {
    const e = editorWith(sceneWith(rect("a"), rect("b")));
    const l2 = e.createLayer("L2"); // active = l2
    e.setSelection([elementId("a"), elementId("b")]);
    e.moveSelectionToLayer(l2);
    expect(e.scene.elements.get(elementId("a"))?.layerId).toBe(l2);

    e.removeLayer(l2); // removing the active layer retargets to a survivor
    expect(e.scene.layers.has(l2)).toBe(false);
    expect(e.activeLayerId).toBe(DEFAULT_LAYER_ID);
  });
});

describe("link helpers", () => {
  it("openLink no-ops without DOM and on unsafe input", () => {
    const e = editorWith(sceneWith(rect("a")));
    expect(() => e.openLink("https://example.com")).not.toThrow();
    expect(() => e.openLink(null)).not.toThrow();
    expect(() => e.openLink("javascript:alert(1)")).not.toThrow();
  });

  it("linkAt returns a shape's href under the cursor, else null", () => {
    const e = editorWith(sceneWith(rect("a", { href: "https://x.com" })));
    expect(e.linkAt({ x: 25, y: 25 })?.href).toBe("https://x.com");
    expect(e.linkAt({ x: 999, y: 999 })).toBeNull();
  });
});

describe("misc public setters", () => {
  it("peer cursors / selections / debug zones / cursor-move subscription", () => {
    const e = editorWith(sceneWith(rect("a")));
    expect(() => e.setPeerCursors([])).not.toThrow();
    expect(() => e.setPeerSelections([])).not.toThrow();
    e.setDebugHitZones(true);
    e.setDebugHitZones(true); // unchanged → early return
    e.setDebugHitZones(false);
    const off = e.onCursorMove(noop);
    expect(typeof off).toBe("function");
    off();
  });

  it("toggleLockSelection locks then unlocks the selection", () => {
    const e = editorWith(sceneWith(rect("a"), rect("b")));
    e.toggleLockSelection(); // empty selection → no-op
    e.setSelection([elementId("a"), elementId("b")]);
    e.toggleLockSelection();
    expect(e.scene.elements.get(elementId("a"))?.locked).toBe(true);
    e.toggleLockSelection();
    expect(e.scene.elements.get(elementId("a"))?.locked).not.toBe(true);
  });
});
