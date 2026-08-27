/**
 * `Editor.insertScene` merges an imported fragment — elements, links and
 * files — into the current scene at a target point with fresh ids, as one
 * undo step, keeping links wired to the remapped elements.
 */
import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  endpointElementId,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
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

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 100,
  height: 50,
});

const fragment = (): Scene => {
  let s = emptyScene();
  ({ scene: s } = addElement(s, rect("a", 0, 0)));
  ({ scene: s } = addElement(s, rect("b", 300, 0)));
  const link: Link = {
    id: linkId("l1"),
    layerId: DEFAULT_LAYER_ID,
    from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
    to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    order: orderBetween(null, null),
    style: { stroke: "#000" },
    routing: "orthogonal",
  };
  ({ scene: s } = addLink(s, link));
  return s;
};

describe("Editor.insertScene", () => {
  it("inserts elements + links with fresh ids, centred on the target, as one undo step", () => {
    const e = makeEditor();
    const ids = e.insertScene(fragment(), { x: 1000, y: 1000 });
    expect(ids.length).toBe(2);
    expect(ids).not.toContain(elementId("a"));
    // Fragment bounds 0..400 × 0..50 → centre (200, 25) lands on (1000, 1000).
    const [na, nb] = ids.map((id) => e.scene.elements.get(id)!);
    expect(na!.position).toEqual({ x: 800, y: 975 });
    expect(nb!.position).toEqual({ x: 1100, y: 975 });
    expect(e.scene.links.size).toBe(1);
    const link = [...e.scene.links.values()][0]!;
    expect(link.id).not.toBe(linkId("l1"));
    expect(endpointElementId(link.from)).toBe(na!.id);
    expect(endpointElementId(link.to)).toBe(nb!.id);
    expect([...e.selection]).toEqual(ids);
    e.undo();
    expect(e.scene.elements.size).toBe(0);
    expect(e.scene.links.size).toBe(0);
  });

  it("persists a data-URL image as a BinaryFile the inserted shape points at", () => {
    const e = makeEditor();
    // 1×1 transparent PNG.
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    let s = emptyScene();
    ({ scene: s } = addElement(s, {
      ...rect("img", 0, 0),
      type: "image",
      src: png,
    } as unknown as Element));
    const [id] = e.insertScene(s, { x: 0, y: 0 });
    const inserted = e.scene.elements.get(id!) as { fileId?: string; src: string };
    expect(inserted.fileId).toBeDefined();
    expect(e.scene.files.size).toBe(1);
    const file = [...e.scene.files.values()][0]!;
    expect(file.mime).toBe("image/png");
    expect(file.data.byteLength).toBeGreaterThan(20);
    e.undo();
    expect(e.scene.files.size).toBe(0);
  });

  it("inserts twice without id collisions and is a no-op for an empty fragment", () => {
    const e = makeEditor();
    e.insertScene(fragment(), { x: 0, y: 0 });
    e.insertScene(fragment(), { x: 500, y: 500 });
    expect(e.scene.elements.size).toBe(4);
    expect(e.scene.links.size).toBe(2);
    expect(e.insertScene(emptyScene())).toEqual([]);
  });
});
