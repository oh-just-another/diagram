import {
  addShape,
  apply,
  findContainerAt,
  getShapeWorldBounds,
  orderForTop,
  removeShape,
  type Scene,
  type Element,
  type Patch,
} from "@oh-just-another/scene";
import type { LayerId, ElementId, Vec2 } from "@oh-just-another/types";
import { elementId as castShapeId } from "@oh-just-another/types";
import type { Mode } from "../../modes.js";
import {
  TEXT_DEFAULT_FILL,
  TEXT_DEFAULT_FONT_FAMILY,
  TEXT_DEFAULT_FONT_SIZE,
} from "../../constants.js";

/**
 * Build a shape for keyboard-friendly creation centred on
 * `worldCenter`. Picks `rectangle` / `ellipse` based on `mode` (falls
 * back to rectangle for non-draw modes), with a 120×80 default size.
 */
export const buildShapeAtCursor = (
  scene: Scene,
  mode: Mode,
  worldCenter: Vec2,
  layerId: LayerId,
  id: ElementId,
): Element => {
  const order = orderForTop(
    [...scene.shapes.values()].filter((s) => s.layerId === layerId).map((s) => s.order),
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
export const buildTextShapeAt = (
  scene: Scene,
  worldPoint: Vec2,
  layerId: LayerId,
  id: ElementId,
): Element => {
  const order = orderForTop(
    [...scene.shapes.values()].filter((s) => s.layerId === layerId).map((s) => s.order),
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
  } as Element;
};

/** Generate a fresh shape id with the editor's nextId counter. */
export const newShapeIdAtCursor = (next: number): ElementId =>
  castShapeId(`shape-${next}-${Date.now().toString(36)}`);

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
    kind: "shape",
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
    kind: "shape",
    id: state.current.id,
    before: state.current,
    after: withParent,
  };
  return { scene: apply(scene, patch), patch, next: withParent };
};

/** Build the initial placement state for `beginPlacement`. */
export const beginPlacementState = (shape: Element): {
  readonly scene: (s: Scene) => { readonly scene: Scene; readonly patch: Patch };
  readonly state: PlacementState;
} => {
  const half = getShapeWorldBounds(shape);
  return {
    scene: (s) => {
      const r = addShape(s, shape);
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
): { readonly scene: Scene } => ({ scene: removeShape(scene, elementId).scene });
