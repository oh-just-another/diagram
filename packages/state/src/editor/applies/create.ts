import {
  addLink,
  addElement,
  orderForBottom,
  orderForTop,
  type Link,
  type LinkEndpoint,
  type Scene,
  type Element,
  type Patch,
} from "@oh-just-another/scene";
import { DEFAULT_EDGE_STYLE, DEFAULT_ELEMENT_STYLES } from "@oh-just-another/tokens";
import type {
  Bounds,
  LinkId,
  LayerId,
  ElementId,
  Vec2,
} from "@oh-just-another/types";
import { DEFAULT_LINK_ARROWHEAD, DEFAULT_LINK_ROUTING } from "../../constants.js";

/**
 * Defaults used by `buildElementForCreate` — sourced from
 * `@oh-just-another/tokens` so the editor and the templates package
 * agree on a fresh shape's look.
 */
const DEFAULT_RECT_STYLE = DEFAULT_ELEMENT_STYLES.rectangle;
const DEFAULT_ELLIPSE_STYLE = DEFAULT_ELEMENT_STYLES.ellipse;

/**
 * Build the `Element` object for a CREATE_SHAPE emit. Doesn't touch the
 * scene — caller threads it through `addElement`.
 *
 * Frames go to the bottom of their layer so the children inside
 * them still receive clicks; rect / ellipse go to the top of the
 * stack as usual.
 */
export const buildElementForCreate = (
  scene: Scene,
  kind: "rect" | "ellipse" | "frame",
  bounds: Bounds,
  id: ElementId,
  layerId: LayerId,
  nextFrameName: () => string,
): Element => {
  const orders = Array.from(scene.elements.values())
    .filter((s) => s.layerId === layerId)
    .map((s) => s.order);
  const order = kind === "frame" ? orderForBottom(orders) : orderForTop(orders);
  const common = {
    id,
    layerId,
    position: { x: bounds.x, y: bounds.y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
    width: bounds.width,
    height: bounds.height,
  };
  if (kind === "rect") {
    return { ...common, type: "rectangle", style: { ...DEFAULT_RECT_STYLE } };
  }
  if (kind === "ellipse") {
    return { ...common, type: "ellipse", style: { ...DEFAULT_ELLIPSE_STYLE } };
  }
  // Frame: empty style (renderer hard-codes the dashed look), auto-numbered name.
  return { ...common, type: "frame", style: {}, name: nextFrameName() };
};

/**
 * Build the `Link` object for a CREATE_EDGE emit. Endpoints are
 * pre-resolved (snapped) by the caller — we just compose them with the
 * layer / order / style boilerplate.
 */
export const buildLinkForCreate = (
  scene: Scene,
  from: LinkEndpoint,
  to: LinkEndpoint,
  id: LinkId,
  layerId: LayerId,
): Link => {
  const order = orderForTop(
    Array.from(scene.links.values())
      .filter((e) => e.layerId === layerId)
      .map((e) => e.order),
  );
  return {
    id,
    layerId,
    from,
    to,
    order,
    routing: DEFAULT_LINK_ROUTING,
    style: { ...DEFAULT_EDGE_STYLE },
    arrowheads: { to: DEFAULT_LINK_ARROWHEAD },
  };
};

/**
 * Build the throwaway `Link` for the live draw-edge connector preview.
 * Same default object as {@link buildLinkForCreate} (so the dragged preview is
 * a WYSIWYG of the committed link — solid, default arrowhead, default style),
 * with point endpoints at the preview's resolved ends. When the caller already
 * routed the polyline (`points` = `[from, ...corners, to]`), its interior
 * corners are reused as `routedPoints` so the elbow geometry matches exactly.
 */
export const buildEdgePreviewLink = (
  scene: Scene,
  preview: { readonly from: Vec2; readonly to: Vec2; readonly points?: readonly Vec2[] },
  id: LinkId,
  layerId: LayerId,
): Link => {
  const base = buildLinkForCreate(
    scene,
    { kind: "point", position: preview.from },
    { kind: "point", position: preview.to },
    id,
    layerId,
  );
  return preview.points && preview.points.length > 2
    ? { ...base, routedPoints: preview.points.slice(1, -1) }
    : base;
};

/**
 * Composite helper for `applyCreate` — builds the shape and runs
 * `addElement` against the scene. Returns the scene + patch so the
 * Editor can `_history.push(patch)` and clear/notify.
 *
 * `void bounds` — the bounds is part of the shape via `position` +
 * `width` / `height`; the parameter is kept on the signature only
 * to document intent at the call site.
 */
export const computeCreateElement = (
  scene: Scene,
  kind: "rect" | "ellipse" | "frame",
  bounds: Bounds,
  id: ElementId,
  layerId: LayerId,
  nextFrameName: () => string,
): { readonly scene: Scene; readonly patch: Patch; readonly elementId: ElementId } => {
  const shape = buildElementForCreate(scene, kind, bounds, id, layerId, nextFrameName);
  const result = addElement(scene, shape);
  return { scene: result.scene, patch: result.patch, elementId: id };
};

/**
 * Composite helper for `applyCreateLink` — combines `buildLink` and
 * `addLink`. Endpoint snapping is caller responsibility (delegated
 * to the snap engine in Editor); pre-resolved `from`/`to` are
 * threaded in as parameters.
 */
export const computeCreateLink = (
  scene: Scene,
  from: LinkEndpoint,
  to: LinkEndpoint,
  id: LinkId,
  layerId: LayerId,
): { readonly scene: Scene; readonly patch: Patch; readonly linkId: LinkId } => {
  const edge = buildLinkForCreate(scene, from, to, id, layerId);
  const result = addLink(scene, edge);
  return { scene: result.scene, patch: result.patch, linkId: id };
};

/** Generate a unique shape id with the per-editor `nextId` counter. */
export const newElementId = (next: number): ElementId =>
  `shape-${next}-${Date.now().toString(36)}` as ElementId;

/** Generate a unique edge id with the per-editor `nextId` counter. */
export const newLinkId = (next: number): LinkId =>
  `edge-${next}-${Date.now().toString(36)}` as LinkId;
