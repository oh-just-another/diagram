import {
  addElement,
  apply,
  findContainerAt,
  findNearestAnchor,
  getAnchorOutwardNormal,
  getAnchorWorld,
  getElement,
  getElementWorldBounds,
  getLink,
  orderForTop,
  removeElement,
  routeElbowLink,
  snapExcludedAnchors,
  updateLink,
  type Scene,
  type Element,
  type Patch,
  type AnchorRef,
} from "@oh-just-another/scene";
import type { LayerId, ElementId, LinkId, Bounds, Vec2 } from "@oh-just-another/types";
import { elementId as castElementId } from "@oh-just-another/types";
import type { Mode } from "../../modes.js";
import {
  ANCHOR_CLICK_NEW_ELEMENT_GAP,
  TEXT_DEFAULT_FILL,
  TEXT_DEFAULT_FONT_FAMILY,
  TEXT_DEFAULT_FONT_SIZE,
} from "../../constants.js";
import { req } from "../../util.js";
import { computeCreateLink } from "../applies/create.js";

/**
 * Build a shape for keyboard-friendly creation centred on
 * `worldCenter`. Picks `rectangle` / `ellipse` based on `mode` (falls
 * back to rectangle for non-draw modes), with a 120×80 default size.
 */
export const buildElementAtCursor = (
  scene: Scene,
  mode: Mode,
  worldCenter: Vec2,
  layerId: LayerId,
  id: ElementId,
): Element => {
  const order = orderForTop(
    [...scene.elements.values()].filter((s) => s.layerId === layerId).map((s) => s.order),
  );
  const type: Element["type"] = mode === "draw-ellipse" ? "ellipse" : "rectangle";
  const width = 120;
  const height = 80;
  return {
    id,
    layerId,
    type,
    position: { x: worldCenter.x - width / 2, y: worldCenter.y - height / 2 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
    style: { fill: "#bbb", stroke: "#000", strokeWidth: 1 },
    width,
    height,
  } as Element;
};

/**
 * Build an empty text shape anchored at `worldPoint` (top-left). The
 * `draw-text` tool drops this and opens the inline editor straight
 * away, so the shape starts with no text — the renderer skips empty
 * strings, and an untouched shape is cleaned up on commit.
 */
export const buildTextElementAt = (
  scene: Scene,
  worldPoint: Vec2,
  layerId: LayerId,
  id: ElementId,
): Element => {
  const order = orderForTop(
    [...scene.elements.values()].filter((s) => s.layerId === layerId).map((s) => s.order),
  );
  return {
    id,
    layerId,
    type: "text",
    position: { x: worldPoint.x, y: worldPoint.y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
    text: "",
    fontFamily: TEXT_DEFAULT_FONT_FAMILY,
    fontSize: TEXT_DEFAULT_FONT_SIZE,
    style: { fill: TEXT_DEFAULT_FILL, textAlign: "left", textBaseline: "top" },
  };
};

/** Generate a fresh shape id with the editor's nextId counter. */
export const newElementIdAtCursor = (next: number): ElementId =>
  castElementId(`shape-${next}-${Date.now().toString(36)}`);

/**
 * Mutable state for an in-progress palette / drag-to-place gesture.
 * Owned by the `beginPlacement` closure.
 */
export interface PlacementState {
  current: Element;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** Compute the patch that moves the placed shape to `worldCenter`. */
export const computePlacementUpdate = (
  scene: Scene,
  state: PlacementState,
  worldCenter: Vec2,
): { readonly scene: Scene; readonly patch: Patch; readonly next: Element } => {
  const next = {
    ...state.current,
    position: {
      x: worldCenter.x - state.halfWidth,
      y: worldCenter.y - state.halfHeight,
    },
  } as Element;
  const patch: Patch = {
    kind: "element",
    id: state.current.id,
    before: state.current,
    after: next,
  };
  return { scene: apply(scene, patch), patch, next };
};

/**
 * Post-process the placed shape on commit — if it lands inside an
 * auto-layout container's drop zone, reparent it. The caller passes a
 * callback that excludes the placed shape itself from the container
 * hit-test (otherwise a container template could parent itself).
 *
 * Returns the reparented shape + the corresponding patch, or `null`
 * when no container hit applies.
 */
export const computePlacementContainerDrop = (
  scene: Scene,
  state: PlacementState,
): { readonly scene: Scene; readonly patch: Patch; readonly next: Element } | null => {
  const center = {
    x: state.current.position.x + state.halfWidth,
    y: state.current.position.y + state.halfHeight,
  };
  const container = findContainerAt(scene, center, new Set([state.current.id]));
  if (!container) return null;
  const withParent = { ...state.current, parentId: container.id } as Element;
  const patch: Patch = {
    kind: "element",
    id: state.current.id,
    before: state.current,
    after: withParent,
  };
  return { scene: apply(scene, patch), patch, next: withParent };
};

/** Build the initial placement state for `beginPlacement`. */
export const beginPlacementState = (
  shape: Element,
): {
  readonly scene: (s: Scene) => { readonly scene: Scene; readonly patch: Patch };
  readonly state: PlacementState;
} => {
  const half = getElementWorldBounds(shape);
  return {
    scene: (s) => {
      const r = addElement(s, shape);
      return { scene: r.scene, patch: r.patch };
    },
    state: {
      current: shape,
      halfWidth: half.width / 2,
      halfHeight: half.height / 2,
    },
  };
};

/** Undo of `beginPlacement` — remove the placed shape. */
export const computePlacementCancel = (
  scene: Scene,
  elementId: ElementId,
): { readonly scene: Scene } => ({ scene: removeElement(scene, elementId).scene });

// Throwaway ids for the click-create hover preview — never enter the real scene.
const PREVIEW_GHOST_ELEMENT_ID = "__ghost-preview__" as ElementId;
const PREVIEW_GHOST_LINK_ID = "__ghost-preview-link__" as LinkId;

/**
 * Ghost geometry for what clicking a start dot would create (standard hover
 * preview): the would-be new element's world bounds + the connector path from
 * the dot to it. Pure — no mutation. Mirrors the placement in the Editor's
 * `createLinkedElementFromAnchor`.
 */
export const previewClickCreate = (
  scene: Scene,
  activeLayerId: LayerId,
  fromElement: ElementId,
  anchorName: string,
): {
  bounds: Bounds;
  path: readonly Vec2[];
  element: Element;
  ghostScene: Scene;
  ghostLinkId: LinkId;
} | null => {
  const src = getElement(scene, fromElement);
  if (!src) return null;
  const anchor: AnchorRef = { kind: "named", name: anchorName };
  const normal = getAnchorOutwardNormal(src, anchor);
  const b = getElementWorldBounds(src);
  const extentAlong = Math.abs(normal.x) * b.width + Math.abs(normal.y) * b.height;
  const dist = extentAlong + ANCHOR_CLICK_NEW_ELEMENT_GAP;
  const delta = { x: normal.x * dist, y: normal.y * dist };
  const bounds: Bounds = { x: b.x + delta.x, y: b.y + delta.y, width: b.width, height: b.height };
  const fromWorld = getAnchorWorld(src, anchor);
  // Facing edge of the ghost (toward the source) = its centre pulled back along
  // the normal by half its extent.
  const ghostCx = bounds.x + bounds.width / 2;
  const ghostCy = bounds.y + bounds.height / 2;
  const nearEdge = {
    x: ghostCx - normal.x * (extentAlong / 2),
    y: ghostCy - normal.y * (extentAlong / 2),
  };
  // The would-be element itself — a same-kind clone of the source shifted to the
  // ghost bounds, with blank user text. The overlay renders THIS through the real
  // renderer so the ghost looks like the actual shape (an ellipse ghosts as an
  // ellipse), not a bounding rect. Throwaway id — never enters the real scene.
  let element = {
    ...src,
    id: PREVIEW_GHOST_ELEMENT_ID,
    position: { x: src.position.x + delta.x, y: src.position.y + delta.y },
  } as Element;
  if (element.type === "text") element = { ...element, text: "" } as Element;
  else if (element.type === "frame") element = { ...element, name: "" } as Element;

  // Build a throwaway scene holding the ghost element + the would-be link so the
  // connector can be drawn through the REAL link renderer (same routing,
  // arrowhead and style it'll have once created) — faded — instead of a dashed
  // preview line. The `path` field stays for callers that just want the straight
  // from→to segment.
  const srcCenter = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const withGhost = addElement(scene, element).scene;
  const placed = req(getElement(withGhost, PREVIEW_GHOST_ELEMENT_ID));
  const { ref: toRef } = findNearestAnchor(placed, srcCenter, snapExcludedAnchors(placed));
  const linkResult = computeCreateLink(
    withGhost,
    { kind: "anchor", elementId: fromElement, anchor },
    { kind: "anchor", elementId: PREVIEW_GHOST_ELEMENT_ID, anchor: toRef },
    PREVIEW_GHOST_LINK_ID,
    activeLayerId,
  );
  let ghostScene = linkResult.scene;
  const edge = req(getLink(ghostScene, PREVIEW_GHOST_LINK_ID));
  if ((edge.routing ?? "straight") === "orthogonal") {
    const routedPoints = routeElbowLink(ghostScene, edge);
    ghostScene = updateLink(ghostScene, PREVIEW_GHOST_LINK_ID, (e) => ({
      ...e,
      routedPoints,
    })).scene;
  }
  // Render only the ghost link (the shapes stay for endpoint resolution).
  ghostScene = {
    ...ghostScene,
    links: new Map([[PREVIEW_GHOST_LINK_ID, req(getLink(ghostScene, PREVIEW_GHOST_LINK_ID))]]),
  };
  return {
    bounds,
    path: [fromWorld, nearEdge],
    element,
    ghostScene,
    ghostLinkId: PREVIEW_GHOST_LINK_ID,
  };
};
