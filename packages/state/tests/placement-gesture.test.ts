/**
 * `beginPlacement` (library drag-to-place) is an element gesture: the
 * editor exposes the placed element as `placementId` from the first
 * notify until commit / cancel, so gesture-gated chrome (selection
 * toolbar, minimap repaint) hides for it like for a move.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import { DEFAULT_LAYER_ID, emptyScene, orderBetween, type Element } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const host = () =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  }) as never;

const makeEditor = (): Editor =>
  new Editor({
    host: host(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: emptyScene(),
  });

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

describe("beginPlacement gesture state", () => {
  it("sets placementId while placing and clears it on commit", () => {
    const e = makeEditor();
    const shape = rect("p1");
    const seen: (string | null)[] = [];
    const off = e.subscribe(() => seen.push(e.placementId));
    const p = e.beginPlacement(shape);
    expect(e.placementId).toBe(shape.id);
    expect(seen.at(-1)).toBe(shape.id);
    p.update({ x: 100, y: 100 });
    expect(e.placementId).toBe(shape.id);
    p.commit();
    expect(e.placementId).toBeNull();
    expect(seen.at(-1)).toBeNull();
    off();
  });

  it("clears placementId on cancel", () => {
    const e = makeEditor();
    const shape = rect("p2");
    const p = e.beginPlacement(shape);
    p.cancel();
    expect(e.placementId).toBeNull();
    expect(e.scene.elements.has(shape.id)).toBe(false);
  });
});
