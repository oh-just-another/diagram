/**
 * Golden reference scenes — the single source of truth for the visual
 * regression harness.
 *
 * The same set drives three consumers:
 *   1. `packages/renderer-svg` golden test — pure-JS SVG output (deterministic,
 *      platform-independent, exact-string compared).
 *   2. `packages/headless` golden test — SVG + rasterised PNG (via resvg +
 *      pixelmatch; PNG is platform-sensitive, compared with a diff-ratio budget).
 *   3. `apps/e2e` Playwright spec — WebGL2 + Canvas2D screenshots of the
 *      playground, cross-backend divergence check.
 *
 * The scenes are built programmatically with `@oh-just-another/scene` factories
 * (never hand-authored field literals) so they stay in lockstep with the real
 * model. `fixtures/generate.ts` serialises them to `fixtures/scenes/<id>.json`
 * for the browser consumer; the Node tests import the factories directly.
 *
 * Coverage target (the risky, WebGL2-heavy layer): primitives (sharp / rounded
 * rect, ellipse, polygon, curved path), stroke / fill / opacity / dash styles,
 * rotation, text at multiple zooms (MSDF path), straight / orthogonal / elbow /
 * bezier edges with arrowheads, image (data-URI), groups / frames, block-arrow
 * and brush, and isolation-dim (render-option variant).
 */
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Element,
  type FractionalIndex,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { elementId, linkId } from "@oh-just-another/types";

/**
 * Distributive `Omit` — plain `Omit<Union, K>` collapses a union to its common
 * keys (losing `width` / `text` / `points` / …). Distributing preserves each
 * variant, so an object literal is excess-checked against the matching member.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Element input to the builder: any variant, minus the auto-filled fields. */
type ElementInput = DistributiveOmit<Element, "layerId" | "order"> & {
  readonly order?: FractionalIndex;
};

/** Link input to the builder: minus the auto-filled fields. */
type LinkInput = Omit<Link, "layerId" | "order"> & { readonly order?: FractionalIndex };

/** A single reference scene plus the render knobs the Node path needs. */
export interface GoldenScene {
  /** Stable slug — names the JSON / SVG / PNG baseline files and the URL id. */
  readonly id: string;
  /** Human-readable summary of what the scene exercises. */
  readonly title: string;
  /** Build a fresh immutable `Scene`. Pure — no shared mutable state. */
  readonly build: () => Scene;
  /**
   * Ids to render dimmed (modern-style isolation). Consumed only by the Node
   * renderers, which map it onto `RenderSceneOptions.dimElements`. Absent =
   * no dim pass.
   */
  readonly dimElementIds?: readonly string[];
  /** Alpha for {@link dimElementIds}. Default 0.2 when dim ids are present. */
  readonly dimOpacity?: number;
}

/**
 * Incremental scene builder. Keeps a running fractional z-order key so every
 * added element gets a strictly-increasing `order` — deterministic paint
 * sequence across runs (equal keys would fall back to Map insertion order,
 * which is fine here but explicit is safer for a regression baseline).
 */
class SceneBuilder {
  private scene: Scene;
  private lastOrder: FractionalIndex | null = null;

  constructor(width: number, height: number, zoom = 1) {
    const s = emptyScene();
    this.scene = {
      ...s,
      viewport: { ...s.viewport, size: { width, height }, zoom },
    };
  }

  private nextOrder(): FractionalIndex {
    const order = orderBetween(this.lastOrder, null);
    this.lastOrder = order;
    return order;
  }

  add(element: ElementInput): this {
    const full = {
      layerId: DEFAULT_LAYER_ID,
      order: element.order ?? this.nextOrder(),
      ...element,
    } as Element;
    this.scene = addElement(this.scene, full).scene;
    return this;
  }

  link(edge: LinkInput): this {
    const full = {
      layerId: DEFAULT_LAYER_ID,
      order: edge.order ?? this.nextOrder(),
      ...edge,
    } as Link;
    this.scene = addLink(this.scene, full).scene;
    return this;
  }

  done(): Scene {
    return this.scene;
  }
}

const eid = (raw: string) => elementId(raw);

// 1x1 opaque-red PNG, base64 — smallest possible bitmap for the image path.
const RED_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const goldenScenes: readonly GoldenScene[] = [
  {
    id: "rect-sharp",
    title: "Sharp-cornered rectangle, fill + stroke",
    build: () =>
      new SceneBuilder(240, 180)
        .add({
          id: eid("r"),
          type: "rectangle",
          position: { x: 40, y: 40 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#4c8bf5", stroke: "#1a3c73", strokeWidth: 4 },
          width: 160,
          height: 100,
        })
        .done(),
  },
  {
    id: "rect-rounded",
    title: "Rounded rectangle, adaptive + explicit radius",
    build: () =>
      new SceneBuilder(240, 180)
        .add({
          id: eid("r"),
          type: "rectangle",
          position: { x: 30, y: 30 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: {
            fill: "#f5a623",
            stroke: "#8a5a00",
            strokeWidth: 3,
            roundness: { type: "round", value: 24 },
          },
          width: 180,
          height: 120,
        })
        .done(),
  },
  {
    id: "ellipse",
    title: "Ellipse, translucent fill over stroke",
    build: () =>
      new SceneBuilder(240, 180)
        .add({
          id: eid("bg"),
          type: "rectangle",
          position: { x: 20, y: 20 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#e0e0e0" },
          width: 200,
          height: 140,
        })
        .add({
          id: eid("e"),
          type: "ellipse",
          position: { x: 50, y: 40 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#e0245e", stroke: "#7a0f30", strokeWidth: 3, opacity: 0.6 },
          width: 140,
          height: 100,
        })
        .done(),
  },
  {
    id: "diamond",
    title: "Polygon — 4-point diamond",
    build: () =>
      new SceneBuilder(200, 200)
        .add({
          id: eid("d"),
          type: "polygon",
          position: { x: 100, y: 100 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#17bf63", stroke: "#0c6b38", strokeWidth: 3 },
          points: [
            { x: 0, y: -70 },
            { x: 70, y: 0 },
            { x: 0, y: 70 },
            { x: -70, y: 0 },
          ],
        })
        .done(),
  },
  {
    id: "polygon-hex",
    title: "Polygon — dashed hexagon",
    build: () => {
      const r = 80;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return { x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) };
      });
      return new SceneBuilder(220, 220)
        .add({
          id: eid("h"),
          type: "polygon",
          position: { x: 110, y: 110 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#794bc4", stroke: "#3d2668", strokeWidth: 4, dashArray: [12, 8] },
          points: pts,
        })
        .done();
    },
  },
  {
    id: "path-curves",
    title: "Path with cubic + quadratic curves, no fill",
    build: () =>
      new SceneBuilder(260, 180)
        .add({
          id: eid("p"),
          type: "path",
          position: { x: 20, y: 20 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { stroke: "#1d9bf0", strokeWidth: 5, lineCap: "round", lineJoin: "round" },
          commands: [
            { kind: "M", to: { x: 0, y: 120 } },
            {
              kind: "C",
              control1: { x: 40, y: 0 },
              control2: { x: 120, y: 0 },
              to: { x: 160, y: 120 },
            },
            { kind: "Q", control: { x: 200, y: 40 }, to: { x: 220, y: 120 } },
          ],
        })
        .done(),
  },
  {
    id: "styles-stroke-fill",
    title: "Stroke widths, dash, opacity, stroke-align variations",
    build: () =>
      new SceneBuilder(360, 160)
        .add({
          id: eid("a"),
          type: "rectangle",
          position: { x: 20, y: 30 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#4c8bf5", stroke: "#000", strokeWidth: 1 },
          width: 90,
          height: 90,
        })
        .add({
          id: eid("b"),
          type: "rectangle",
          position: { x: 135, y: 30 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#4c8bf5", stroke: "#000", strokeWidth: 8, dashArray: [6, 6] },
          width: 90,
          height: 90,
        })
        .add({
          id: eid("c"),
          type: "rectangle",
          position: { x: 250, y: 30 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: {
            fill: "#4c8bf5",
            strokeWidth: 6,
            stroke: "#e0245e",
            strokeAlign: "inside",
            opacity: 0.5,
          },
          width: 90,
          height: 90,
        })
        .done(),
  },
  {
    id: "rotated",
    title: "Rotated rectangle + rotated ellipse",
    build: () =>
      new SceneBuilder(260, 220)
        .add({
          id: eid("r"),
          type: "rectangle",
          position: { x: 70, y: 60 },
          rotation: Math.PI / 6,
          scale: { x: 1, y: 1 },
          style: { fill: "#f5a623", stroke: "#8a5a00", strokeWidth: 3 },
          width: 120,
          height: 70,
        })
        .add({
          id: eid("e"),
          type: "ellipse",
          position: { x: 120, y: 120 },
          rotation: -Math.PI / 4,
          scale: { x: 1, y: 1 },
          style: { fill: "#17bf63", stroke: "#0c6b38", strokeWidth: 3, opacity: 0.7 },
          width: 120,
          height: 60,
        })
        .done(),
  },
  {
    id: "text-basic",
    title: "Text element, default zoom",
    build: () =>
      new SceneBuilder(300, 120)
        .add({
          id: eid("t"),
          type: "text",
          position: { x: 20, y: 40 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          text: "Diagram 42",
          fontFamily: "sans-serif",
          fontSize: 32,
          style: { fill: "#111827" },
        })
        .done(),
  },
  {
    id: "text-styled",
    title: "Text — bold, italic, underline, centered",
    build: () =>
      new SceneBuilder(320, 160)
        .add({
          id: eid("t1"),
          type: "text",
          position: { x: 20, y: 20 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          text: "Bold Heading",
          fontFamily: "sans-serif",
          fontSize: 28,
          maxWidth: 280,
          style: {
            fill: "#7c3aed",
            fontWeight: "bold",
            textAlign: "center",
            textDecoration: { underline: true },
          },
        })
        .add({
          id: eid("t2"),
          type: "text",
          position: { x: 20, y: 80 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          text: "italic strikethrough",
          fontFamily: "sans-serif",
          fontSize: 22,
          style: {
            fill: "#374151",
            fontStyle: "italic",
            textDecoration: { strikethrough: true },
          },
        })
        .done(),
  },
  {
    id: "text-zoomed",
    title: "Text at viewport zoom 2.5 (MSDF up-scale path)",
    build: () =>
      new SceneBuilder(300, 120, 2.5)
        .add({
          id: eid("t"),
          type: "text",
          position: { x: 12, y: 16 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          text: "Zoomed",
          fontFamily: "sans-serif",
          fontSize: 20,
          style: { fill: "#0f172a", fontWeight: "bold" },
        })
        .done(),
  },
  {
    id: "edges-straight-ortho",
    title: "Straight + orthogonal edges with arrowheads",
    build: () => {
      const b = new SceneBuilder(360, 240);
      b.add({
        id: eid("n1"),
        type: "rectangle",
        position: { x: 30, y: 30 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: { fill: "#dbeafe", stroke: "#1e3a8a", strokeWidth: 2, roundness: { type: "round" } },
        width: 100,
        height: 60,
      });
      b.add({
        id: eid("n2"),
        type: "rectangle",
        position: { x: 230, y: 150 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: { fill: "#dcfce7", stroke: "#14532d", strokeWidth: 2, roundness: { type: "round" } },
        width: 100,
        height: 60,
      });
      b.link({
        id: linkId("straight"),
        from: { kind: "anchor", elementId: eid("n1"), anchor: { kind: "named", name: "right" } },
        to: { kind: "anchor", elementId: eid("n2"), anchor: { kind: "named", name: "top" } },
        routing: "straight",
        style: { stroke: "#1e3a8a", strokeWidth: 2 },
        arrowheads: { to: "filledArrow", size: 12 },
      });
      b.link({
        id: linkId("ortho"),
        from: { kind: "anchor", elementId: eid("n1"), anchor: { kind: "named", name: "bottom" } },
        to: { kind: "anchor", elementId: eid("n2"), anchor: { kind: "named", name: "left" } },
        routing: "orthogonal",
        style: { stroke: "#b91c1c", strokeWidth: 2 },
        arrowheads: { from: "circle", to: "arrow", size: 12 },
      });
      return b.done();
    },
  },
  {
    id: "edges-bezier-labeled",
    title: "Bezier edge with waypoints, label, ERD + diamond arrowheads",
    build: () => {
      const b = new SceneBuilder(360, 240);
      b.add({
        id: eid("n1"),
        type: "ellipse",
        position: { x: 30, y: 90 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: { fill: "#fef3c7", stroke: "#92400e", strokeWidth: 2 },
        width: 90,
        height: 60,
      });
      b.add({
        id: eid("n2"),
        type: "ellipse",
        position: { x: 240, y: 90 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: { fill: "#ede9fe", stroke: "#5b21b6", strokeWidth: 2 },
        width: 90,
        height: 60,
      });
      b.link({
        id: linkId("bez"),
        from: { kind: "anchor", elementId: eid("n1"), anchor: { kind: "named", name: "right" } },
        to: { kind: "anchor", elementId: eid("n2"), anchor: { kind: "named", name: "left" } },
        routing: "bezier",
        waypoints: [{ x: 180, y: 40 }],
        style: { stroke: "#5b21b6", strokeWidth: 2 },
        arrowheads: { from: "erdMany", to: "diamond", size: 14 },
        label: { text: "relates", position: 0.5 },
      });
      return b.done();
    },
  },
  {
    id: "image",
    title: "Image element from data-URI, scaled",
    build: () =>
      new SceneBuilder(200, 160)
        .add({
          id: eid("bg"),
          type: "rectangle",
          position: { x: 10, y: 10 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#f1f5f9", stroke: "#334155", strokeWidth: 2 },
          width: 180,
          height: 140,
        })
        .add({
          id: eid("img"),
          type: "image",
          position: { x: 40, y: 40 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: {},
          src: RED_PIXEL_PNG,
          width: 120,
          height: 80,
        })
        .done(),
  },
  {
    id: "image-crop",
    title: "Cropped image — centre 50% stretched to fill the box",
    build: () =>
      new SceneBuilder(200, 160)
        .add({
          id: eid("bg"),
          type: "rectangle",
          position: { x: 10, y: 10 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#f1f5f9", stroke: "#334155", strokeWidth: 2 },
          width: 180,
          height: 140,
        })
        .add({
          id: eid("img"),
          type: "image",
          position: { x: 40, y: 40 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: {},
          src: RED_PIXEL_PNG,
          width: 120,
          height: 80,
          // Keep the centre 50% of the source, stretched over the 120×80 box.
          crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        })
        .done(),
  },
  {
    id: "group-frame",
    title: "Frame with children + a group of two shapes",
    build: () => {
      const b = new SceneBuilder(360, 260);
      b.add({
        id: eid("frame"),
        type: "frame",
        position: { x: 20, y: 20 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: {},
        width: 180,
        height: 200,
        name: "Group A",
      });
      b.add({
        id: eid("f-child-1"),
        type: "rectangle",
        position: { x: 50, y: 70 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: { fill: "#93c5fd" },
        width: 120,
        height: 50,
        frameId: eid("frame"),
      });
      b.add({
        id: eid("f-child-2"),
        type: "ellipse",
        position: { x: 50, y: 140 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: { fill: "#fca5a5" },
        width: 120,
        height: 50,
        frameId: eid("frame"),
      });
      b.add({
        id: eid("group"),
        type: "group",
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: {},
      });
      b.add({
        id: eid("g-child-1"),
        type: "rectangle",
        position: { x: 240, y: 60 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: { fill: "#6ee7b7", stroke: "#065f46", strokeWidth: 2 },
        width: 90,
        height: 60,
        parentId: eid("group"),
      });
      b.add({
        id: eid("g-child-2"),
        type: "rectangle",
        position: { x: 240, y: 150 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        style: { fill: "#fcd34d", stroke: "#92400e", strokeWidth: 2 },
        width: 90,
        height: 60,
        parentId: eid("group"),
      });
      return b.done();
    },
  },
  {
    id: "block-arrow-brush",
    title: "Block-arrow + variable-width brush stroke",
    build: () =>
      new SceneBuilder(320, 200)
        .add({
          id: eid("arrow"),
          type: "block-arrow",
          position: { x: 30, y: 30 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#2563eb", stroke: "#1e3a8a", strokeWidth: 2 },
          width: 160,
          height: 70,
          direction: "right",
          headRatio: 0.4,
          bodyThickness: 0.5,
        })
        .add({
          id: eid("brush"),
          type: "brush",
          position: { x: 40, y: 130 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#111827" },
          points: [
            { x: 0, y: 20, width: 2 },
            { x: 50, y: 0, width: 6 },
            { x: 120, y: 30, width: 10 },
            { x: 200, y: 5, width: 4 },
          ],
        })
        .done(),
  },
  {
    id: "brush-closed-fill",
    title: "Closed brush stroke with filled enclosed area",
    build: () =>
      new SceneBuilder(200, 200)
        .add({
          id: eid("brush"),
          type: "brush",
          position: { x: 40, y: 40 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          closed: true,
          style: { stroke: "#111827", fill: "#fca5a5" },
          points: [
            { x: 0, y: 0, width: 3 },
            { x: 110, y: 10, width: 3 },
            { x: 120, y: 110, width: 3 },
            { x: 15, y: 105, width: 3 },
            { x: 4, y: 6, width: 3 },
          ],
        })
        .done(),
  },
  {
    id: "isolation-dim",
    title: "Isolation dim — two of three shapes at reduced alpha",
    dimElementIds: ["b", "c"],
    dimOpacity: 0.2,
    build: () =>
      new SceneBuilder(320, 140)
        .add({
          id: eid("a"),
          type: "rectangle",
          position: { x: 20, y: 30 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#2563eb" },
          width: 80,
          height: 80,
        })
        .add({
          id: eid("b"),
          type: "rectangle",
          position: { x: 120, y: 30 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#16a34a" },
          width: 80,
          height: 80,
        })
        .add({
          id: eid("c"),
          type: "ellipse",
          position: { x: 220, y: 30 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          style: { fill: "#dc2626" },
          width: 80,
          height: 80,
        })
        .done(),
  },
];

/** Lookup a golden scene by id. Throws on an unknown id (caller bug). */
export const getGoldenScene = (id: string): GoldenScene => {
  const found = goldenScenes.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown golden scene id: ${id}`);
  return found;
};
