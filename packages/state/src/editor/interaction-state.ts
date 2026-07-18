import type { Bounds, ElementId, Vec2 } from "@oh-just-another/types";
import type { AnnotationId, LinkId } from "@oh-just-another/types";
import type { Element, Link } from "@oh-just-another/scene";
import type { BrushStrokeState } from "./public/brush.js";
import type { EraseStrokeState } from "./public/eraser.js";
import type { LaserStroke } from "./public/laser.js";
import type * as Selection from "../selection/selection.js";
import type * as LinkSelection from "../selection/link-selection.js";

/** Live preview of an edge being drawn (draw-edge mode / anchor drag). */
export interface EdgePreview {
  from: Vec2;
  to: Vec2;
  points?: readonly Vec2[];
}

/**
 * Active "drag a link from a start-anchor" gesture. `fromWorld` is the true
 * anchor world point (link origin, un-offset); `origin` is the press point
 * (for the drag threshold).
 */
export interface LinkDragFromAnchor {
  fromElement: ElementId;
  fromWorld: Vec2;
  /** Named anchor the gesture started on — drives click-to-create direction. */
  anchorName: string;
  origin: Vec2;
  moved: boolean;
}

/**
 * Element hovered while draw-edge mode is active. `mode` mirrors
 * `snapLinkEndpoint`: an anchor within threshold → `"point"`, otherwise
 * floating `"element"`.
 */
export interface HoveredLinkTarget {
  elementId: ElementId;
  activeAnchor: string | null;
  outlinePoint?: Vec2 | undefined;
  mode: "point" | "element";
}

/** Snapshot of an in-progress annotation-pin drag. */
export interface AnnotationDrag {
  id: AnnotationId;
  originPosition: Vec2;
  originWorldPoint: Vec2;
  moved: boolean;
}

/**
 * Pending shape-picker after a link end was dropped on empty canvas —
 * records where so the host can pop a mini picker at that spot.
 */
export interface PendingLinkDropMenu {
  linkId: LinkId;
  side: "from" | "to";
  world: Vec2;
}

/** Per-shape snapshot for a group-resize gesture (world AABB at press-down). */
export interface GroupResizeOrigin {
  readonly combined: Bounds;
  readonly elements: ReadonlyMap<
    ElementId,
    { readonly position: Vec2; readonly bounds: Bounds; readonly scale: Vec2 }
  >;
  readonly links: ReadonlyMap<LinkId, Link>;
}

/** Press-time snapshot for a rotate gesture (pivot + pristine per-member state). */
export interface RotateGestureOrigin {
  readonly pivot: Vec2;
  readonly origin: ReadonlyMap<ElementId, { readonly position: Vec2; readonly rotation: number }>;
}

/** Live container-drop highlight during a drag. */
export interface ContainerHover {
  id: ElementId;
  dropZone: Bounds;
}

/** Active pan gesture (right-click drag or Space + left drag). */
export interface PanGesture {
  pointerId: number;
  button: number;
  startPoint: Vec2;
  lastPoint: Vec2;
  moved: boolean;
}

/**
 * Ephemeral interaction / gesture state for a single {@link Editor}.
 *
 * Collects the short-lived preview and gesture-origin fields that the pointer
 * handlers, render orchestrator and container-ops helpers read and write while
 * a gesture is in flight. Long-lived state (scene, selection, history,
 * viewport, mode) lives on the editor itself — never here.
 *
 * The editor owns one instance and exposes thin delegate accessors for the
 * fields external writers already reference by name, so this consolidation is
 * behaviour-preserving.
 */
export class InteractionState {
  // --- Visual previews (cleared by resetPreviews) ---

  /** Live preview while drawing a new shape; null when not drawing. */
  drawingPreview: Bounds | null = null;
  /** Live preview of an edge being drawn. */
  edgePreview: EdgePreview | null = null;
  /** Live lasso bounds during a rubber-band select gesture. */
  lassoPreview: Bounds | null = null;
  /** Element hovered in draw-edge mode (drives the port overlay). */
  hoveredLinkTarget: HoveredLinkTarget | null = null;
  /** Last idle cursor position (world) in select mode — grows the nearest dot. */
  hoverCursorWorld: Vec2 | null = null;

  // --- Other gesture / interaction state ---

  /** In-progress annotation-pin drag. */
  annotationDrag: AnnotationDrag | null = null;
  /** Active drag-a-link-from-anchor gesture. */
  linkDragFromAnchor: LinkDragFromAnchor | null = null;
  /** Pending link-drop shape-picker. */
  pendingLinkDropMenu: PendingLinkDropMenu | null = null;

  /**
   * Selection captured at lasso-press time — lets `add`-mode marquee start
   * from the pre-press selection instead of empty.
   */
  lassoBaseSelection: Selection.Selection | null = null;
  /** Link-selection counterpart of `lassoBaseSelection`. */
  lassoBaseLinks: LinkSelection.LinkSelection | null = null;

  /** Per-shape `position` snapshot at press-down for a multi-shape drag. */
  groupMoveOrigin: ReadonlyMap<ElementId, Vec2> | null = null;
  /** Press-time snapshot of connectors that follow a multi-element drag rigidly. */
  groupLinkMoveOrigin: ReadonlyMap<LinkId, Link> | null = null;
  /** Per-shape snapshot for a group-resize gesture. */
  groupResizeOrigin: GroupResizeOrigin | null = null;
  /** Press-time snapshot for a rotate gesture. */
  rotateGestureOrigin: RotateGestureOrigin | null = null;
  /** Pristine shape snapshot for a single-shape text resize. */
  resizeOriginElement: Element | null = null;

  /** Host-mirrored snap-suppress modifier (Cmd/Ctrl) held during a drag. */
  snapSuppressed = false;
  /** Host-mirrored transform-modifier: symmetric resize about centre. */
  transformAltKey = false;
  /** Host-mirrored transform-modifier: aspect-lock resize / axis-lock move. */
  transformShiftKey = false;

  /** Timestamp of the last non-drag pointer-up (double-click detection). */
  lastClickAt = 0;
  /** World point of the last non-drag pointer-up (double-click detection). */
  lastClickWorldPoint: Vec2 | null = null;

  /** In-progress brush stroke (live overlay preview). */
  brushStroke: BrushStrokeState | null = null;
  /** In-progress eraser stroke (pending-delete set + last sample point). */
  eraseStroke: EraseStrokeState | null = null;
  /** Ephemeral laser-pointer trails — fade by TTL, never touch the scene. */
  laserStrokes: LaserStroke[] = [];
  /**
   * Ephemeral eraser drag trail — a laser-style fading trail laid while an
   * erase stroke is active. Reuses {@link LaserStroke} so the same TTL fade /
   * prune tick drives it; painted in a neutral grey, never the laser red.
   */
  eraserTrail: LaserStroke[] = [];
  /** True only while the pointer is DOWN in laser mode (a trail is being laid). */
  laserDrawing = false;
  /** Last world-space pointer position observed by the host's onMove handler. */
  lastPointerWorld: Vec2 | null = null;

  /** Element id the user started dragging on press-down. */
  dragElementId: ElementId | null = null;
  /** Element the current press added to the selection additively. */
  additivePressAdded: ElementId | null = null;
  /** Live container highlight for the shape being dragged. */
  containerHover: ContainerHover | null = null;

  /** Active screen-space pointer positions keyed by `pointerId`. */
  readonly activePointers = new Map<number, Vec2>();
  /** One-finger-pan candidate (screen-space origin) set at touch press-down. */
  touchPanCandidate: Vec2 | null = null;
  /** Space-bar held → next pointer drag pans the canvas. */
  spaceHeld = false;
  /** Active pan gesture, or null between gestures. */
  panGesture: PanGesture | null = null;
  /** Set on right-click pointerdown so the next native contextmenu is suppressed. */
  suppressNextContextMenu = false;

  /** Link whose caption is being inline-edited, or null. */
  editingLinkCaption: LinkId | null = null;

  /**
   * Reset ONLY the visual-preview fields (draw / edge / lasso previews and the
   * draw-edge hover overlay). Leaves gesture origins and modifier state intact.
   */
  resetPreviews(): void {
    this.drawingPreview = null;
    this.edgePreview = null;
    this.lassoPreview = null;
    this.hoveredLinkTarget = null;
    this.hoverCursorWorld = null;
  }

  /** Full teardown — return every ephemeral field to its default. */
  reset(): void {
    this.resetPreviews();
    this.annotationDrag = null;
    this.linkDragFromAnchor = null;
    this.pendingLinkDropMenu = null;
    this.lassoBaseSelection = null;
    this.lassoBaseLinks = null;
    this.groupMoveOrigin = null;
    this.groupLinkMoveOrigin = null;
    this.groupResizeOrigin = null;
    this.rotateGestureOrigin = null;
    this.resizeOriginElement = null;
    this.snapSuppressed = false;
    this.transformAltKey = false;
    this.transformShiftKey = false;
    this.lastClickAt = 0;
    this.lastClickWorldPoint = null;
    this.brushStroke = null;
    this.eraseStroke = null;
    this.laserStrokes = [];
    this.eraserTrail = [];
    this.laserDrawing = false;
    this.lastPointerWorld = null;
    this.dragElementId = null;
    this.additivePressAdded = null;
    this.containerHover = null;
    this.activePointers.clear();
    this.touchPanCandidate = null;
    this.spaceHeld = false;
    this.panGesture = null;
    this.suppressNextContextMenu = false;
    this.editingLinkCaption = null;
  }
}
