import {
  DEFAULT_LAYER_ID,
  addLink,
  addElement,
  emptyScene,
  orderBetween,
  type Link,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { DEFAULT_EDGE_STYLE, DEFAULT_ELEMENT_STYLES, HUE_TONES } from "@oh-just-another/tokens";
import { linkId, elementId } from "@oh-just-another/types";
import type { GraphDocument } from "./graph.js";
import { layoutGraph } from "./layout.js";
import { fitViewportToBoxes } from "./fit-viewport.js";
import { EDGE_STROKE_WIDTH, NODE_LABEL_FONT_SIZE, NODE_STROKE_WIDTH } from "./constants.js";

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
  const idMap = new Map<string, ReturnType<typeof elementId>>();

  for (const n of nodes) {
    const id = elementId(`node-${n.id}`);
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
      style: { fill, stroke, strokeWidth: NODE_STROKE_WIDTH },
    } as const;
    order = orderBetween(order, null);

    let shape: Element;
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
    ({ scene } = addElement(scene, shape));

    if (n.label) {
      const textId = elementId(`node-${n.id}-label`);
      const textElement: Element = {
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
        fontSize: NODE_LABEL_FONT_SIZE,
        maxWidth: n.width,
      };
      order = orderBetween(order, null);
      // Center inside the node by writing position to the box centre.
      const centeredLabel: Element = {
        ...textElement,
        position: { x: n.position.x + n.width / 2, y: n.position.y + n.height / 2 },
      };
      ({ scene } = addElement(scene, centeredLabel));
    }
  }

  // Links → straight-line connectors between node anchors.
  let edgeOrder = orderBetween(null, null);
  for (const e of edges) {
    const sourceId = idMap.get(e.source);
    const targetId = idMap.get(e.target);
    if (!sourceId || !targetId) continue;
    const id = linkId(`edge-${e.source}-${e.target}`);
    const edgeShape: Link = {
      id,
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "anchor", elementId: sourceId, anchor: { kind: "named", name: "center" } },
      to: { kind: "anchor", elementId: targetId, anchor: { kind: "named", name: "center" } },
      style: { ...DEFAULT_EDGE_STYLE, strokeWidth: EDGE_STROKE_WIDTH },
      order: edgeOrder,
      ...(e.label !== undefined ? { metadata: { label: e.label } } : {}),
    };
    edgeOrder = orderBetween(edgeOrder, null);
    ({ scene } = addLink(scene, edgeShape));
  }

  // Fit the viewport around the laid-out nodes plus a margin so callers
  // get something sensible to render without extra computation.
  return fitViewportToBoxes(
    scene,
    nodes.map((n) => ({ x: n.position.x, y: n.position.y, width: n.width, height: n.height })),
  );
};

const defaultFill = (shape: GraphDocument["nodes"][number]["shape"]): string => {
  switch (shape) {
    case "ellipse":
    case "round":
      return DEFAULT_ELEMENT_STYLES.sticky.fill;
    case "diamond":
      return DEFAULT_ELEMENT_STYLES.flowchart.fill;
    case "rectangle":
    default:
      return DEFAULT_ELEMENT_STYLES.rectangle.fill;
  }
};
