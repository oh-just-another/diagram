import {
  DEFAULT_LAYER_ID,
  addEdge,
  addShape,
  emptyScene,
  orderBetween,
  type Edge,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import {
  DEFAULT_EDGE_STYLE,
  DEFAULT_SHAPE_STYLES,
  HUE_TONES,
} from "@oh-just-another/tokens";
import { edgeId, shapeId } from "@oh-just-another/types";
import type { GraphDocument } from "./graph.js";
import { layoutGraph } from "./layout.js";

/**
 * Convert a backend-neutral `GraphDocument` into a `Scene`. Runs layout
 * (`layoutGraph`) first, then materialises each node as a built-in shape
 * and each edge as a `straight`-routed connector between named anchors.
 *
 * Scene viewport size is fitted around the layouted bounding box plus a
 * small margin so the result looks centered when handed to the renderer.
 */
export const graphToScene = (graph: GraphDocument): Scene => {
  const { nodes, edges } = layoutGraph(graph);

  let scene = emptyScene();
  let order = orderBetween(null, null);

  // Track shape ids so edge endpoints can reference them later.
  const idMap = new Map<string, ReturnType<typeof shapeId>>();

  for (const n of nodes) {
    const id = shapeId(`node-${n.id}`);
    idMap.set(n.id, id);

    const fill = n.fill ?? defaultFill(n.shape);
    const stroke = n.stroke ?? HUE_TONES.light.gray.textHigh;
    // Identity / placement / order — fields every shape variant accepts.
    const base = {
      id,
      layerId: DEFAULT_LAYER_ID,
      position: n.position,
      rotation: 0,
      scale: { x: 1, y: 1 },
      order,
      style: { fill, stroke, strokeWidth: 1.5 },
    } as const;
    order = orderBetween(order, null);

    let shape: Shape;
    switch (n.shape ?? "rectangle") {
      case "ellipse":
      case "round":
        shape = { ...base, type: "ellipse", width: n.width, height: n.height };
        break;
      case "diamond":
        shape = {
          ...base,
          type: "polygon",
          points: [
            { x: n.width / 2, y: 0 },
            { x: n.width, y: n.height / 2 },
            { x: n.width / 2, y: n.height },
            { x: 0, y: n.height / 2 },
          ],
        };
        break;
      case "rectangle":
      default:
        shape = { ...base, type: "rectangle", width: n.width, height: n.height };
        break;
    }
    ({ scene } = addShape(scene, shape));

    if (n.label) {
      const textId = shapeId(`node-${n.id}-label`);
      const textShape: Shape = {
        id: textId,
        layerId: DEFAULT_LAYER_ID,
        type: "text",
        position: { x: n.position.x, y: n.position.y },
        rotation: 0,
        scale: { x: 1, y: 1 },
        order,
        style: {
          fill: HUE_TONES.light.gray.textHigh,
          textAlign: "center",
          textBaseline: "middle",
        },
        text: n.label,
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        maxWidth: n.width,
      };
      order = orderBetween(order, null);
      // Center inside the node by writing position to the box centre.
      const centeredLabel: Shape = {
        ...textShape,
        position: { x: n.position.x + n.width / 2, y: n.position.y + n.height / 2 },
      };
      ({ scene } = addShape(scene, centeredLabel));
    }
  }

  // Edges → straight-line connectors between node anchors.
  let edgeOrder = orderBetween(null, null);
  for (const e of edges) {
    const sourceId = idMap.get(e.source);
    const targetId = idMap.get(e.target);
    if (!sourceId || !targetId) continue;
    const id = edgeId(`edge-${e.source}-${e.target}`);
    const edgeShape: Edge = {
      id,
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "anchor", shapeId: sourceId, anchor: { kind: "named", name: "center" } },
      to: { kind: "anchor", shapeId: targetId, anchor: { kind: "named", name: "center" } },
      style: { ...DEFAULT_EDGE_STYLE, strokeWidth: 1 },
      order: edgeOrder,
      ...(e.label !== undefined ? { metadata: { label: e.label } } : {}),
    };
    edgeOrder = orderBetween(edgeOrder, null);
    ({ scene } = addEdge(scene, edgeShape));
  }

  // Fit the viewport around the laid-out nodes plus a margin so callers
  // get something sensible to render without extra computation.
  const margin = 20;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
    if (n.position.x + n.width > maxX) maxX = n.position.x + n.width;
    if (n.position.y + n.height > maxY) maxY = n.position.y + n.height;
  }
  const width =
    Number.isFinite(maxX) && Number.isFinite(minX)
      ? Math.ceil(maxX - Math.min(0, minX)) + margin
      : 800;
  const height =
    Number.isFinite(maxY) && Number.isFinite(minY)
      ? Math.ceil(maxY - Math.min(0, minY)) + margin
      : 600;
  scene = { ...scene, viewport: { ...scene.viewport, size: { width, height } } };

  return scene;
};

const defaultFill = (shape: GraphDocument["nodes"][number]["shape"]): string => {
  switch (shape) {
    case "ellipse":
    case "round":
      return DEFAULT_SHAPE_STYLES.sticky.fill;
    case "diamond":
      return DEFAULT_SHAPE_STYLES.flowchart.fill;
    case "rectangle":
    default:
      return DEFAULT_SHAPE_STYLES.rectangle.fill;
  }
};
