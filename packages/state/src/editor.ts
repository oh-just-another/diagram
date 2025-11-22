import { createActor, type Actor } from "xstate";
import { createEmitter, type Emitter } from "@oh-just-another/events";
import type { Bounds, FileId, ElementId, Vec2 } from "@oh-just-another/types";
import { fileId as castFileId, elementId as castElementId } from "@oh-just-another/types";
import {
  addAnnotation,
  addLink,
  addLayer,
  addElement,
  anchorSnapper,
  apply,
  buildSpatialIndex,
  getBinaryFile,
  gridLayout,
  isElementHidden,
  isElementLocked,
  runAutoLayout,
  stackLayout,
  DEFAULT_LAYER_ID,
  findLinkAt,
  findNearestAnchor,
  getAnchorWorld,
  getAnchorOutwardNormal,
  getAnnotationWorldPosition,
  elbowRoute,
  routeElbowLink,
  getLink,
  getLinkPath,
  getElement,
  getElementAccessibleName,
  getElementAt,
  getElementAtIndexed,
  getElementsCoveredByBounds,
  getElementsInBounds,
  isContainer,
  getContainerSpec,
  getDropZoneWorld,
  findContainerAt,
  expandDropZoneToFit,
  containerSizeForZone,
  getElementWorldBounds,
  setTextMeasurer,
  getScreenToWorld,
  panBy as viewportPanBy,
  resize as viewportResize,
  zoomAt as viewportZoomAt,
  gridSnapper,
  listAnchorsLocal,
  snapExcludedAnchors,
  orderForBottom,
  orderBetweenMany,
  orderForTop,
  type FractionalIndex,
  outlineSnapper,
  removeAnnotation,
  removeLink,
  removeLayer,
  removeElement,
  SnapEngine,
  SpatialGrid,
  type BrushPoint,
  updateAnnotation,
  updateLink,
  updateLayer,
  updateElement,
  type AnchorRef,
  type Annotation,
  type Comment,
  type Link,
  type LinkEndpoint,
  type ImageElement,
  type Layer,
  type Patch,
  type Scene,
  type Element,
  type SnapCandidate,
  type TextElement,
  type TextStyle,
  createBinaryFile,
} from "@oh-just-another/scene";
import {
  annotationId as castAnnotationId,
  commentId as castCommentId,
  linkId as castLinkId,
  layerId as castLayerId,
  type AnnotationId,
  type CommentId,
  type LinkId,
  type LayerId,
} from "@oh-just-another/types";
import { bounds as B, matrix } from "@oh-just-another/math";
import {
  caretGeometry,
  computeLinkWorldBounds,
  DEFAULT_LOD,
  layoutText,
  onAnimationContentReady,
  pointToCaretIndex,
  selectionRects as textSelectionRects,
  renderLinks,
  renderGrid,
  renderScene,
  setActiveRasterizer,
  setActiveTextShaper,
  setAnimationClock,
  ElementCache,
  type EditableTextLayout,
  type RenderTarget,
} from "@oh-just-another/renderer-core";
import {
  History,
  type HistoryOptions,
  type HistoryProvider,
  type TransactionHandle,
} from "@oh-just-another/history";
import {
  ANCHOR_CLICK_NEW_ELEMENT_GAP,
  AUTO_ROUTE_MAX_OBSTACLES,
  WAYPOINT_COLLAPSE_RADIUS,
} from "./constants.js";
import { fromPointerEvent } from "./dom-events.js";
import {
  FileDropRegistry,
  type FileDropContext,
  type FileDropHandler,
} from "./file-drop.js";
import { imageFileDropHandler, videoFileDropHandler } from "./built-in-handlers.js";
import { AnimationTick } from "./animation-tick.js";
import {
  computeDimElements as computeDimElementsHelper,
  isDescendantOfGroup as isDescendantOfGroupHelper,
  pickDrillTarget as pickDrillTargetHelper,
  promoteToGroupRoot as promoteToGroupRootHelper,
  topGroupAncestor as topGroupAncestorHelper,
} from "./group-helpers.js";
import {
  assignFrameMembers as assignFrameMembersHelper,
  nextFrameName as nextFrameNameHelper,
} from "./frame-helpers.js";
import {
  copyElements as copyElementsHelper,
  pasteElements as pasteElementsHelper,
} from "./clipboard.js";
import { AutoCompactScheduler } from "./auto-compact.js";
import { AutoLayoutScheduler } from "./auto-layout-scheduler.js";
import {
  ANNOTATION_PIN_HIT_SLOP,
  DEFAULT_BRUSH_WIDTH,
  DEFAULT_SNAP_THRESHOLD,
  LINK_ENDPOINT_HANDLE_RADIUS,
  CONTAINER_KEEP_THRESHOLD,
  LINK_HIT_THRESHOLD,
  LARGE_SCENE_HIT_THRESHOLD,
  LASSO_COVERAGE_THRESHOLD,
  MAX_BRUSH_WIDTH,
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_MAX_MOVEMENT_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  PINCH_MIN_MOVEMENT_PX,
  TOUCH_LINK_HANDLE_HIT_SLOP,
  TOUCH_LINK_HIT_THRESHOLD,
  TOUCH_HANDLE_HIT_SLOP,
  VIEWPORT_CULL_PADDING_RATIO,
  DOUBLE_CLICK_MS,
  DOUBLE_CLICK_TOLERANCE_PX,
  ISOLATION_DIM_OPACITY,
  WHEEL_PAN_FACTOR,
  WHEEL_ZOOM_MAX_STEP,
  WHEEL_ZOOM_SPEED,
  WHEEL_ZOOM_STEP,
  ANIMATION_MIN_INTERVAL_MS,
  ANIMATION_MAX_INTERVAL_MS,
  ANIMATION_COST_FACTOR,
  HEAVY_GIF_BYTES,
  GIF_AUTOSTOP_MS,
  CARET_BLINK_INTERVAL_MS,
} from "./constants.js";
import { ALL_HANDLES, CORNER_HANDLES, HANDLE_HIT_SLOP, hitHandle } from "./handle.js";
import { getInteractiveHitTester } from "./interactive.js";
import {
  boundsFromPoints,
  interactionMachine,
  interpretPressEnd,
  type InteractionContext,
  type InteractionEmit,
  type PressTarget,
} from "./machine.js";
import type { HandleId } from "./handle.js";
import type { Mode } from "./modes.js";
import type { EditorEvents } from "./editor-events.js";
import {
  createEventCache,
  fanOutEvents,
  primeEventCache,
  type EditorEventCache,
} from "./editor/event-fanout.js";
import { GestureController } from "./editor/gesture-tx.js";
import { LongPressController } from "./editor/long-press.js";
import { pickPressTarget } from "./editor/hit-test.js";
import { PinchController } from "./editor/pinch.js";
import {
  applyContainerDrop as applyContainerDropPure,
  clampContainerToChildren as clampContainerToChildrenPure,
  maybeGrowContainer as maybeGrowContainerPure,
  type ContainerOpsRef,
} from "./editor/container-ops.js";
import { hasWidthHeight } from "./editor/shape-traits.js";
import {
  computeGroupResizePatches,
  computeElementResize,
  computeTextResize,
} from "./editor/applies/resize.js";
import { bindPointerEvents as bindPointerEventsExternal } from "./editor/pointer-binding.js";
import {
  beginBrushStroke as beginBrushStrokePure,
  commitBrushStroke as commitBrushStrokePure,
  extendBrushStroke as extendBrushStrokePure,
  newBrushId,
  type BrushStrokeState,
} from "./editor/public/brush.js";
import {
  copySelected as copySelectedPure,
  pasteFromClipboard,
  selectionFromPasted,
} from "./editor/public/clipboard.js";
import {
  computeCreateLayer,
  computeMoveSelectionToLayer,
  computeRemoveLayer,
  computeRenameLayer,
  computeToggleLayerLock,
  computeToggleLayerVisibility,
  newLayerId,
} from "./editor/public/layers.js";
import {
  computePan,
  computeResetZoom,
  computeSetGrid,
  computeViewportResize,
  computeZoomAt,
  computeZoomToFit,
} from "./editor/public/zoom-pan.js";
import {
  computeAddAnnotation,
  computeAddComment,
  computeRemoveAnnotation,
  computeRemoveComment,
  computeToggleAnnotationResolved,
  hitAnnotation as hitAnnotationPure,
} from "./editor/public/annotations.js";
import { canBeginTextEdit } from "./editor/public/text-edit.js";
import {
  compactLayerZOrderPatches,
  computeBringForward,
  computeBringToFront,
  computeSendBackward,
  computeSendToBack,
} from "./editor/public/z-order.js";
import {
  computeArrangeAsGrid,
  computeArrangeAsStack,
  computeGroupSelected,
  computeUngroup,
  expandSelectionWithDescendants,
  newGroupElementId,
  pickFocusCycle,
  selectionRoots,
} from "./editor/public/arrange-group.js";
import {
  buildImageElement,
  computeAddBinaryFile,
  hasAnimatedElement,
} from "./editor/public/image-insert.js";
import {
  computeDeleteSelection,
  computeDuplicateSelection,
  computeMoveSelectionBy,
  computeSelectAll,
  computeSetSelection,
  computeUpdateStyle,
  computeUpdateTextProps,
  describeNudge as describeNudgePure,
  selectionFromNewIds,
} from "./editor/public/selection-ops.js";
import { computeSetLink, normalizeHref, safeHref } from "./editor/public/link.js";
import {
  beginPlacementState,
  buildElementAtCursor,
  buildTextElementAt,
  computePlacementCancel,
  computePlacementContainerDrop,
  computePlacementUpdate,
  newElementIdAtCursor,
  type PlacementState,
} from "./editor/public/placement.js";
import { renderEditor } from "./editor/render-orchestrator.js";
import {
  combinedSelectionBounds as combinedSelectionBoundsPure,
  computeViewportWorld as computeViewportWorldPure,
  groupChildrenUnion as groupChildrenUnionPure,
} from "./editor/viewport-helpers.js";
import { computeHiddenElements as computeHiddenElementsPure } from "./editor/shape-filters.js";
import {
  selectByBounds as selectByBoundsPure,
  selectByBoundsLive as selectByBoundsLivePure,
} from "./editor/applies/selection.js";
import {
  computeLinkEndpointUpdate,
  computeLinkPreviewEndpoints,
} from "./editor/applies/edge.js";
import {
  computeAnnotationMovePatch,
  computeGroupMovePatches,
  computeElementMovePatch,
} from "./editor/applies/move.js";
import {
  computeCreateLink,
  computeCreateElement,
  newLinkId,
  newElementId,
} from "./editor/applies/create.js";
import { isResizable, renderOverlay, type PeerCursor, type PeerSelection } from "./overlay.js";
import * as Selection from "./selection.js";

export interface LoadSceneOptions {
  /**
   * Keep the existing undo/redo stack when swapping scenes. Used by
   * `@collab/bindEditor` when a peer update arrives — the user's
   * local history must survive remote edits. Default `false`:
   * top-level callers loading a saved scene get a clean slate.
   *
   * **Caveat**: when `true`, history patches that reference shapes
   * removed by the remote peer become un-applicable. The local user
   * will see an undo no-op or an exception on that step; future work
   * (Y.UndoManager integration) will replace the linear stack with
   * a CRDT-aware undo that survives concurrent edits cleanly.
   */
  readonly preserveHistory?: boolean;
}

export interface EditorOptions {
  readonly host: HTMLElement;
  readonly mainTarget: RenderTarget;
  readonly overlayTarget: RenderTarget;
  /**
   * Optional dedicated background target — when provided, the editor
   * paints the grid (`renderGrid`) onto it. Hosts without a background
   * layer can omit this; in that case the grid is drawn on `mainTarget`
   * before shapes.
   */
  readonly backgroundTarget?: RenderTarget;
  /**
   * Called synchronously at the END of every render pass, right after the
   * targets have been painted. Hosts whose surface defers submission
   * (WebGL2 flush, OffscreenCanvas worker replay) MUST present here — not
   * on `subscribe()`, which fires on `notify()` BEFORE the rAF-scheduled
   * paint, leaving the surface one frame behind (shape appears only after
   * the next mutation, e.g. a pan). No-op surfaces (Canvas2D) can omit it.
   */
  readonly onAfterRender?: () => void;
  readonly initialScene: Scene;
  readonly initialMode?: Mode;
  /**
   * Pre-existing history backend, or options for the default
   * `History` (linear stack). Any `HistoryProvider` implementation
   * works — `@oh-just-another/collab` ships `YjsHistory` that wraps
   * `Y.UndoManager` for CRDT-aware undo in collaborative sessions.
   */
  readonly history?: HistoryProvider | HistoryOptions;
  /**
   * Primary input modality. Affects hit-test slop on handles and edges
   * so a finger can grab them without precision-pointing.
   *
   * - `"mouse"` — pixel-accurate hit zones (default for desktop).
   * - `"touch"` — 44 px+ touch targets (Apple HIG, WCAG AAA).
   * - `"auto"` — pick `"touch"` if `matchMedia('(pointer: coarse)')`
   *   reports a coarse primary pointer, else `"mouse"`. Default.
   */
  readonly inputMode?: "mouse" | "touch" | "auto";

  /**
   * Optional text shaper. When supplied, replaces the renderer's
   * default Canvas2D `measureText` path for wrap / layout. Plug
   * `WasmTextShaper.loadBundled()` from `@oh-just-another/text-wasm`
   * for deterministic browser-vs-Node parity (Roboto Regular
   * embedded; advance widths match across environments).
   */
  readonly textShaper?: import("@oh-just-another/renderer-core").TextShaper;
  /**
   * Optional rasterizer. When supplied, hosts of `renderLinks` /
   * future path-heavy code can opt in to WASM bezier / stroke-to-
   * fill via `WasmRasterizer.loadBundled()` from
   * `@oh-just-another/raster-wasm`. The kernel itself doesn't consume
   * this directly today — exposed here so the field travels with
   * `EditorOptions` and hosts have a single config surface.
   */
  readonly rasterizer?: import("@oh-just-another/renderer-core").Rasterizer;

  /**
   * When `true`, the editor routes per-frame rendering through a
   * tile compositor (`renderViaTiles` in renderer-canvas) backed
   * by an InMemoryTileCache. Designed for very-large scenes
   * (10 K+ shapes) where re-rasterising every visible shape per
   * frame dominates frame budget. Below ~5 K shapes the plain
   * scene-renderer is usually faster — leave this off.
   *
   * Host must supply a tile compositor function via
   * `tileCompose`; the kernel doesn't import renderer-canvas
   * directly. Pattern:
   *
   *   import { renderViaTiles } from "@oh-just-another/renderer-canvas";
   *   new Editor({ ..., useTileCache: true, tileCompose: renderViaTiles });
   */
  readonly useTileCache?: boolean;
  /**
   * Compositor function called per frame when `useTileCache` is on.
   * Receives the scene, main target, and dirty bookkeeping; should
   * handle caching internally.
   */
  readonly tileCompose?: TileComposeFn;
}

/**
 * Signature of the tile compositor injected via EditorOptions. Editor
 * stays decoupled from renderer-canvas; hosts wire the concrete
 * implementation (`renderViaTiles`).
 */
export type TileComposeFn = (
  scene: Scene,
  mainTarget: RenderTarget,
  options: {
    readonly viewport: Bounds;
    /**
     * Per-shape change record (before/after world bbox) since the
     * last frame. Compositors route by case (add / remove / move).
     * `null` on one side = added / removed.
     */
    readonly changedElements: ReadonlyMap<ElementId, { before: Bounds | null; after: Bounds | null }>;
    readonly zoomBucket: number;
  },
) => void;

/**
 * Top-level interaction controller. Owns the scene + selection state, wires
 * pointer events from the host element into the interaction machine, applies
 * the machine's emitted effects back to the scene, and re-renders main and
 * overlay on every change.
 *
 * The editor is single-mode and single-window. The patch returned from each scene op is
 * already invertible (`@scene.invert(patch)`), so wiring history later is a
 * one-line subscription.
 */

/** Outcome of `Editor.groupSelected`. `noop` when nothing was selected. */
export type GroupSelectedResult =
  | { readonly kind: "noop" }
  | { readonly kind: "grouped"; readonly groupId: ElementId };

export class Editor {
  private readonly host: HTMLElement;
  private readonly mainTarget: RenderTarget;
  private readonly overlayTarget: RenderTarget;
  private readonly backgroundTarget: RenderTarget | null;
  private readonly onAfterRender: (() => void) | null;
  /**
   * Debug: when true the overlay paints every element's mouse hit-zones
   * (handle slop / edge endpoint / edge body). Toggled by the host
   * debug panel via `setDebugHitZones`; read by the render orchestrator.
   * View-only — never persisted or recorded in history.
   */
  debugHitZones = false;
  private readonly actor: Actor<typeof interactionMachine>;
  private readonly listeners = new Set<() => void>();
  /**
   * Typed event surface. Specific events (`mode`, `selection`,
   * `scene`, `history`, `viewport`) fan out of `notify()` based on
   * what actually changed since the last fire, so subscribers only
   * wake up when their slice flips. `change` still fires once per
   * `notify()` for legacy callers that don't care which slice.
   *
   * The `subscribe()` set is kept — both notification
   * paths run in lockstep so external code can migrate incrementally.
   */
  private readonly events: Emitter<EditorEvents> = createEmitter<EditorEvents>();
  /**
   * Last-emitted snapshot of every observable slice. Used by
   * `fanOutEvents` (in `editor/event-fanout.ts`) to decide which
   * typed events to fire on each `notify()` — only the slices
   * whose identity changed since the previous notify get an event.
   */
  private readonly eventCache: EditorEventCache = createEventCache();
  private readonly unbind: () => void;

  private _scene: Scene;
  private _selection: Selection.Selection = Selection.EMPTY;
  /**
   * Snapshot of an in-progress annotation drag (press on pin → move
   * pointer → release). `originPosition` is the annotation's stored
   * position at press time; per-move handler computes a delta from
   * the current pointer in world space and writes it back.
   */
  private annotationDrag: {
    id: AnnotationId;
    originPosition: Vec2;
    originWorldPoint: Vec2;
    moved: boolean;
  } | null = null;
  /** Live preview while drawing a new shape; null when not drawing. */
  private drawingPreview: Bounds | null = null;
  private edgePreview: { from: Vec2; to: Vec2 } | null = null;
  /**
   * Active "drag a link from a start-anchor" gesture (standard). Set when a
   * press lands on one of the selected element's link-start dots; lets
   * the user draw a link straight from the dot WITHOUT switching to the
   * draw-edge tool. `fromWorld` is the true anchor world point (the link
   * origin, un-offset); `origin` is the press point (for the drag
   * threshold). Read by the pointer handlers (drive preview / commit on
   * up) and the render orchestrator (keep the source's start dots visible
   * during the drag). Null when no such drag is in flight. */
  private linkDragFromAnchor: {
    fromElement: ElementId;
    fromWorld: Vec2;
    /** Named anchor the gesture started on — drives the click-to-create
     * direction (outward normal) and the source link endpoint. */
    anchorName: string;
    origin: Vec2;
    moved: boolean;
  } | null = null;
  /**
   * Element being hovered while draw-edge mode is active. Drives the port-
   * overlay render so the user sees attachment points. `null` outside
   * draw-edge mode or when the pointer is over empty canvas.
   */
  private hoveredLinkTarget: {
    elementId: ElementId;
    activeAnchor: string | null;
    outlinePoint?: Vec2 | undefined;
  } | null = null;
  /**
   * Hover-to-connect (standard): the shape the cursor is idly over in select
   * mode, whose link-start dots the overlay reveals even when it is not
   * selected. `hoverCursorWorld` is the last cursor position — the overlay
   * grows the dot nearest it (`ANCHOR_DOT_HOVER_GROW_RADIUS`). Both reset
   * to null on press / gesture / leaving the shape.
   */
  private hoverLinkStartElement: ElementId | null = null;
  private hoverCursorWorld: Vec2 | null = null;
  /** Link under the idle cursor (overlay paints a soft hover highlight). */
  private hoveredLinkId: LinkId | null = null;
  /**
   * When a link is dropped on empty canvas, the edge is created with a
   * free `point` end and this records where, so the host can pop a
   * mini shape-picker at that spot (standard). Picking a shape re-points the
   * end to the new element; dismissing (Esc / click-away) leaves the free
   * end on the canvas. `null` when no menu is pending.
   */
  private pendingLinkDropMenu: {
    linkId: LinkId;
    side: "from" | "to";
    world: Vec2;
  } | null = null;
  /**
   * Currently selected edge.
   */
  private _selectedLink: LinkId | null = null;
  /**
   * Currently focused annotation thread — overlay highlights its pin
   * with an accent ring and hosts (e.g. `<CommentsPopover>`) render
   * the thread for this id. Independent of shape / edge selection so
   * users can edit shapes while a comment thread is open.
   */
  private _selectedAnnotation: AnnotationId | null = null;
  /**
   * Author identity used for comments posted via `addComment` /
   * `addAnnotation` without an explicit author. Hosts set this once
   * (typically from the same user object passed to `bindAwareness`).
   * Defaults to a synthetic local user.
   */
  private commentAuthor: { id: string; name: string } = { id: "local", name: "You" };
  /**
   * Mid-drag preview state when the user is dragging an edge endpoint.
   * Drawn as an overlay line + handle dot so the user sees the target.
   */
  private linkEndpointDrag: {
    linkId: LinkId;
    side: "from" | "to";
    toPoint: Vec2;
  } | null = null;
  /**
   * Host-managed waypoint (bend-point) drag of the selected link. `index`
   * is the position in `edge.waypoints`. `pendingInsert` means the gesture
   * began on a segment midpoint and will splice a new waypoint on the
   * first move (so a no-move click adds nothing). Live-mutated through the
   * gesture transaction → one undo step per drag.
   */
  private linkWaypointDrag: {
    linkId: LinkId;
    index: number;
    pendingInsert: boolean;
  } | null = null;
  /** Live lasso bounds during a rubber-band select gesture. */
  private lassoPreview: Bounds | null = null;

  /**
   * Selection captured at lasso-press time. Used to compute the live
   * preview correctly: in `replace` mode the lasso starts from empty
   * each frame; in `add` mode it starts from this snapshot so shapes
   * the user already had selected don't blink out and back.
   */
  private lassoBaseSelection: Selection.Selection | null = null;
  /**
   * Snapshot of every selected shape's `position` at press-down. Used to
   * translate the whole group additively during a multi-shape drag. The
   * machine still emits per-shape MOVE_SHAPE — the editor intercepts and
   * fans out when this map is populated.
   */
  private groupMoveOrigin: ReadonlyMap<ElementId, Vec2> | null = null;
  /**
   * Per-shape snapshot for a group-resize gesture — `bounds` is the
   * shape's world AABB at press-down. Editor scales the relative
   * position / size against the combined bounds delta each frame.
   */
  private groupResizeOrigin: {
    readonly combined: Bounds;
    readonly elements: ReadonlyMap<
      ElementId,
      { readonly position: Vec2; readonly bounds: Bounds; readonly scale: Vec2 }
    >;
  } | null = null;
  /**
   * Pristine shape snapshot for a single-shape text resize, captured on
   * the gesture's first tick. Font scaling is computed against this base
   * so it never compounds across pointermove ticks. Cleared on gesture
   * end (commit / cancel).
   */
  private _resizeOriginElement: Element | null = null;
  /**
   * Active layer — new shapes created via `addElement` / `applyCreate` land
   * here when their input doesn't specify a `layerId`. Defaults to the
   * scene's `DEFAULT_LAYER_ID`; hosts switch via `setActiveLayer`.
   */
  private _activeLayerId: LayerId = castLayerId(DEFAULT_LAYER_ID);
  private nextId = 0;

  /** Generate a short unique id with a stable prefix. */
  private uniqueId(prefix: string): string {
    return `${prefix}-${++this.nextId}-${Date.now().toString(36)}`;
  }

  /**
   * Snap engine — defaults to grid + anchor + outline contributors. Hosts
   * that want to tweak this can subclass or instantiate `Editor` with a
   * custom `snapEngine` option.
   */
  private readonly snapEngine: SnapEngine = new SnapEngine([
    gridSnapper,
    anchorSnapper,
    outlineSnapper,
  ]);
  /** Snap threshold in world units. */
  private readonly snapThreshold = DEFAULT_SNAP_THRESHOLD;

  /**
   * Persistent world-bounds cache shared with `renderScene` for viewport
   * culling. Object-identity keyed — invalidates automatically whenever
   * a scene op replaces the shape ref. Could be exposed for hit-test
   * sharing in a follow-up.
   */
  private readonly boundsCache: ElementCache<Bounds> = new ElementCache<Bounds>();

  /**
   * Lazy SpatialGrid for hit-test acceleration in large scenes.
   * Built on demand when `scene.elements.size >= LARGE_SCENE_HIT_THRESHOLD`
   * and the cached index's source-scene reference is stale (any scene
   * op replaces the `_scene` field, invalidating identity).
   */
  private spatialIndexCache: { scene: Scene; index: SpatialGrid } | null = null;

  /**
   * The group the user has "entered" via double-click. While set, the
   * hit-test stops promoting children of this group to the group root,
   * letting the user directly manipulate inner shapes. Cleared on
   * escape, click outside the group's descendants, or `cancelInteraction`.
   */
  private _enteredGroup: ElementId | null = null;

  /**
   * Double-click detection state. Updated on every non-drag pointer
   * up; the next pointer-up within `DOUBLE_CLICK_MS` and within
   * `DOUBLE_CLICK_TOLERANCE_PX` of `lastClickWorldPoint` counts as a
   * double-click. Used to trigger group drill-down (enter isolation).
   */
  private lastClickAt = 0;
  private lastClickWorldPoint: Vec2 | null = null;

  /**
   * In-progress brush stroke. Hosts push points via
   * `extendBrushStroke`; the overlay reads it through
   * `pendingBrushStroke` to draw a live preview.
   */
  private brushStroke: BrushStrokeState | null = null;

  /**
   * Last world-space pointer position observed by the host's onMove
   * handler. `paste()` uses it as the default drop target so a fresh
   * paste lands under the cursor instead of overlapping the originals.
   * `null` until the pointer first enters the host.
   */
  private lastPointerWorld: Vec2 | null = null;

  /**
   * Scene rendered on the last frame. Used to compute a dirty rect by
   * identity-diffing against the current scene — every shape / edge
   * whose ref didn't change is also pixel-identical to its last paint
   * and gets skipped together with the surrounding clear. `null` until
   * the first render.
   */
  private lastRenderedScene: Scene | null = null;
  /**
   * Last-painted isolation root — paired with `lastRenderedScene` so
   * the dirty-rect optimization invalidates when the user enters or
   * exits a group, even when the scene reference is unchanged. Without
   * this, drilling into a group never triggers a redraw → the dim
   * pass would never visibly apply.
   */
  private lastRenderedEnteredGroup: ElementId | null = null;

  /**
   * Fractional-order compaction scheduler (microtask-coalesced).
   * Triggered from every `notify()`; only does real work when at
   * least one shape/edge order string crossed AUTO_COMPACT_THRESHOLD.
   * See `./auto-compact.ts` for the extracted logic.
   */
  private readonly autoCompactScheduler = new AutoCompactScheduler({
    getScene: () => this._scene,
    compact: (layerId) => this.compactLayerZOrder(layerId, { recordHistory: false }),
  });

  /**
   * Auto-layout scheduler — microtask-coalesced re-run of every
   * shape carrying `metadata.autoLayout`. See
   * `./auto-layout-scheduler.ts` for the extracted logic.
   */
  private readonly autoLayoutScheduler = new AutoLayoutScheduler({
    getScene: () => this._scene,
    applyPatch: (patch) => {
      this._scene = apply(this._scene, patch);
      if (this.gestureTx) this.gestureTx.add(patch);
      else this._history.push(patch);
    },
    growContainer: (parentId, childId) => this.maybeGrowContainer(parentId, childId),
    onMutated: () => {
      // Re-render only; do NOT call notify() — that would re-schedule
      // the check and risk a microtask loop. Listeners already saw
      // the previous notify; the auto-layout adjustment is a
      // synchronous fix-up on top of the same external event.
      this.scheduleRender();
      for (const fn of this.listeners) fn();
    },
  });

  /**
   * Element id that the user started dragging on press-down. Tracked
   * separately from the state machine so the editor knows what to
   * (re)parent / drop into a container on pointerup. `null` between
   * gestures, set in onDown when press lands on a shape and cleared
   * in onUp / cancel.
   */
  private dragElementId: ElementId | null = null;

  /**
   * Element that the current press added to the selection additively
   * (shift / meta click on an unselected shape). The press promotes it
   * so a subsequent drag moves it; on a *tap* the up-handler would
   * otherwise `SELECT_TOGGLE` it straight back off, so it consults this
   * to skip that redundant toggle. Reset at every press-down.
   */
  private additivePressAdded: ElementId | null = null;

  /**
   * Live container highlight: the container shape the dragged item is
   * currently hovering over. Drawn by the overlay as a dashed
   * accent rect on the container's drop-zone so the user knows where
   * the shape will land after release.
   */
  private containerHover: { id: ElementId; dropZone: Bounds } | null = null;

  /**
   * Remote peer cursors / selections, pushed in by the host (typically
   * a `bindAwareness(editor, awareness)` helper in `@collab`). The
   * editor only renders them; it doesn't fetch or interpret. Each
   * setter triggers `render()` so the overlay updates immediately.
   */
  private _peerCursors: readonly PeerCursor[] = [];
  private _peerSelections: readonly PeerSelection[] = [];

  /**
   * Subscribers notified on every host pointer move (world-space). Used
   * by `@collab` to broadcast the local cursor into awareness.
   */
  private readonly cursorListeners = new Set<(point: Vec2) => void>();

  /**
   * Active screen-space pointer positions keyed by `pointerId`. With
   * one entry the editor's normal single-pointer flow applies. With
   * two or more entries we enter a pinch / pan gesture and bypass the
   * interaction machine — `pinchOrigin` holds the baseline.
   */
  private readonly activePointers = new Map<number, Vec2>();
  // Pinch gesture state lives in PinchController (./editor/pinch.ts)
  // — `pinch.isActive()` replaces the old `pinchOrigin !== null` check.
  private pinch!: PinchController;
  /** Bridge for `editor/container-ops.ts`. Built lazily in constructor. */
  private containerOpsRef!: ContainerOpsRef;

  /**
   * Space-bar held → next pointer drag pans the canvas instead of
   * doing whatever the current mode would do. Visual cursor goes to
   * "grab" / "grabbing". Wires a window-level keydown/keyup listener
   * in `bindPointerEvents`.
   */
  private spaceHeld = false;

  /**
   * Host-supplied tile compositor — when set (via
   * `EditorOptions.useTileCache` + `tileCompose`), the per-frame
   * render path delegates to it instead of `renderScene`. Stays
   * `null` for the typical small-scene case.
   */
  private readonly tileComposeFn: TileComposeFn | null;

  /**
   * Per-shape change record (before/after world bbox) since the last
   * tile-cache invalidation pass. Populated by `computeDirtyWorld`'s
   * diff loop when `tileComposeFn` is on; forwarded to the compositor
   * each frame so it can invalidate by add / remove / move correctly.
   * (A plain id set lost adds — new id wasn't in the tile reverse
   * index yet.)
   */
  private tileDirtyElements: Map<
    ElementId,
    { before: Bounds | null; after: Bounds | null }
  > = new Map();

  /**
   * Tool-lock flag (standard model). When `false` (default), a
   * draw-mode (`draw-rect` / `draw-ellipse` / `draw-edge` / `brush`)
   * auto-reverts to `select` after a successful create. When `true`,
   * the mode persists so the user can draw many shapes in a row
   * without re-selecting the tool.
   *
   * Toggled via `Editor.setToolLocked(bool)` and surfaced in the
   * toolbar as a lock affordance next to the active tool.
   */
  private _toolLocked = false;

  /**
   * Host-extensible file-drop dispatch. Built-ins (image / scene
   * JSON) register themselves at editor construction; hosts add
   * more via `registerFileDropHandler`.
   */
  private readonly fileDropRegistry = new FileDropRegistry();

  /**
   * Active pan gesture (right-click drag or Space + left drag).
   * `pointerId` is captured by the host so move/up events keep
   * arriving even after the cursor leaves the host bounds.
   * `startPoint` is the press position — used to decide "click vs
   * drag" at pointerup (a near-zero displacement right-click is a
   * context-menu request, not a pan). `lastPoint` tracks the
   * previous move so per-frame delta is correct.
   *
   * `button` records which mouse button started the gesture so we
   * only treat right-click releases as potential context-menu
   * triggers (Space + left-drag never opens a menu).
   */
  private panGesture: {
    pointerId: number;
    button: number;
    startPoint: Vec2;
    lastPoint: Vec2;
    moved: boolean;
  } | null = null;

  /**
   * Set on right-click pointerdown result so the upcoming native
   * `contextmenu` event can be unconditionally preventDefault'ed
   * (the gesture decides whether to fire the menu manually on
   * pointerup based on whether the user dragged).
   */
  private suppressNextContextMenu = false;

  /** Cursor style we set on the host while a pan gesture is in flight. */
  private previousHostCursor: string | null = null;

  /**
   * Long-press tracking. Starts on `pointerdown`; cancelled on
   * `pointermove > LONG_PRESS_MAX_MOVEMENT_PX` or `pointerup` before
   * the timer fires. Hosts subscribe via `onLongPress` to surface a
   * context menu (mobile alternative to right-click).
   */
  // Long-press timer + origin live in LongPressController
  // (./editor/long-press.ts). The Set of subscribers stays here
  // because `onLongPress` is part of the public Editor API.
  private longPress!: LongPressController;
  private readonly longPressListeners = new Set<
    (payload: { screenPoint: Vec2; worldPoint: Vec2 }) => void
  >();

  /**
   * Live-region announcements for assistive tech. The editor pushes
   * short, human-readable strings ("Selected Rectangle", "Moved 5 px
   * right") that hosts pipe into an `aria-live=polite` region.
   */
  private readonly announceListeners = new Set<(message: string) => void>();

  /**
   * Resolved primary input modality + derived hit slops. Computed once
   * in the constructor from `EditorOptions.inputMode` (default `"auto"`
   * uses `matchMedia('(pointer: coarse)')`).
   */
  private readonly inputMode: "mouse" | "touch";
  private readonly handleHitSlop: number;
  private readonly edgeHandleHitSlop: number;
  private readonly edgeHitThreshold: number;

  private readonly _history: HistoryProvider;
  /** Open transaction during a single drag/resize gesture. */
  private gestureTx: TransactionHandle | null = null;
  /**
   * Wraps gesture lifecycle (transaction open/commit/cancel +
   * post-create mode revert) so editor.ts doesn't carry the bodies.
   * Implementation lives in `./editor/gesture-tx.ts`; the
   * controller calls back through the narrow `GestureRef` bridge
   * built lazily below.
   */
  private readonly gestures: GestureController;

  constructor(options: EditorOptions) {
    this.host = options.host;
    this.mainTarget = options.mainTarget;
    this.overlayTarget = options.overlayTarget;
    this.backgroundTarget = options.backgroundTarget ?? null;
    this.onAfterRender = options.onAfterRender ?? null;
    this._scene = options.initialScene;
    this._history = isHistoryProvider(options.history)
      ? options.history
      : new History(options.history ?? {});
    // Build the gesture controller against a narrow getter/setter
    // bridge to the editor's mutable state. The bridge is a thin
    // adapter — keeps `gestureTx`/`dragElementId` etc. as `private`
    // fields on Editor (instead of forcing them public to satisfy
    // structural implements), and lets the controller live in its
    // own module without importing Editor.
    const self = this;
    this.gestures = new GestureController({
      get history() {
        return self._history;
      },
      get gestureTx() {
        return self.gestureTx;
      },
      set gestureTx(v) {
        self.gestureTx = v;
      },
      get groupMoveOrigin() {
        return self.groupMoveOrigin;
      },
      set groupMoveOrigin(v) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        self.groupMoveOrigin = v as any;
      },
      get groupResizeOrigin() {
        return self.groupResizeOrigin;
      },
      set groupResizeOrigin(v) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        self.groupResizeOrigin = v as any;
      },
      get dragElementId() {
        return self.dragElementId;
      },
      set dragElementId(v) {
        self.dragElementId = v;
      },
      get containerHover() {
        return self.containerHover;
      },
      set containerHover(v) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        self.containerHover = v as any;
      },
      get toolLocked() {
        return self._toolLocked;
      },
      get mode() {
        return self.mode;
      },
      setMode: (m) => self.setMode(m),
      notify: () => self.notify(),
    });
    this.tileComposeFn =
      options.useTileCache === true && options.tileCompose ? options.tileCompose : null;

    // If the host plugged a TextShaper (e.g.
    // WasmTextShaper.loadBundled()), install it process-globally
    // so the built-in text renderer's wrap path uses it instead
    // of Canvas2D.measureText. Hosts that don't care leave the
    // field unset and the default behaviour is unchanged.
    if (options.textShaper) setActiveTextShaper(options.textShaper);
    // Same pattern for Rasterizer. The WebGL2
    // backend reads `getActiveRasterizer()` from its curve methods
    // and routes through WASM flatten / strokeToFill when set.
    // Other backends (Canvas2D, SVG) leave the field alone —
    // native ctx.bezierCurveTo beats any WASM round-trip there.
    if (options.rasterizer) setActiveRasterizer(options.rasterizer);

    // Drive the scene text bounder from the renderer's own metrics so
    // the selection box hugs the rendered text (the WebGL2 MSDF font's
    // advances differ from any geometric estimate). Measuring sets the
    // font on the main target — harmless, every draw re-sets its own.
    setTextMeasurer((text, family, size, opts) => {
      this.mainTarget.setFont(family, size, {
        ...(opts?.bold ? { weight: "bold" as const } : {}),
        ...(opts?.italic ? { style: "italic" as const } : {}),
      });
      return this.mainTarget.measureText(text).width;
    });

    // Resolve input mode + derived hit slops once. `auto` reads
    // `matchMedia('(pointer: coarse)')` when available; SSR falls
    // back to `mouse`.
    const requested = options.inputMode ?? "auto";
    if (requested === "touch") {
      this.inputMode = "touch";
    } else if (requested === "mouse") {
      this.inputMode = "mouse";
    } else if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches
    ) {
      this.inputMode = "touch";
    } else {
      this.inputMode = "mouse";
    }
    this.handleHitSlop = this.inputMode === "touch" ? TOUCH_HANDLE_HIT_SLOP : HANDLE_HIT_SLOP;
    this.edgeHandleHitSlop =
      this.inputMode === "touch" ? TOUCH_LINK_HANDLE_HIT_SLOP : LINK_ENDPOINT_HANDLE_RADIUS;
    this.edgeHitThreshold =
      this.inputMode === "touch" ? TOUCH_LINK_HIT_THRESHOLD : LINK_HIT_THRESHOLD;

    this.actor = createActor(interactionMachine);
    this.actor.subscribe({
      next: () => {
        // Render on any state change so drawing rubber-band updates.
        this.scheduleRender();
      },
    });
    this.actor.on("*", (event) => {
      this.applyEmit(event);
    });
    this.actor.start();

    // Built-in file-drop handlers — registered before any host-side
    // wiring so subsequent host `registerFileDropHandler` calls land
    // *after* and only fire for files we don't already handle.
    this.fileDropRegistry.register(imageFileDropHandler);
    this.fileDropRegistry.register(videoFileDropHandler);

    if (options.initialMode) {
      this.actor.send({ type: "SET_MODE", mode: options.initialMode });
    }

    // Long-press controller — fired on touch-hold; fans out to
    // host-registered listeners (mobile alt to right-click).
    this.longPress = new LongPressController(
      (p) => this.screenToWorld(p),
      (payload) => {
        for (const fn of this.longPressListeners) fn(payload);
      },
    );
    // Pinch gesture controller — two-finger pan + zoom. Hooks into
    // the editor's own zoomAt / panBy / screenToWorld.
    this.pinch = new PinchController(
      (p) => this.screenToWorld(p),
      (factor, anchorWorld) => this.zoomAt(factor, anchorWorld),
      (delta) => this.panBy(delta),
    );
    // Bridge for container-ops module — narrow surface that the
    // pure functions in editor/container-ops.ts call back into.
    const self2 = this;
    this.containerOpsRef = {
      get scene() {
        return self2._scene;
      },
      get dragElementId() {
        return self2.dragElementId;
      },
      get containerHover() {
        return self2.containerHover;
      },
      applyPatch(patch, nextScene) {
        self2._scene = nextScene;
        self2.beginOrAttachGesture().add(patch);
      },
    };

    this.unbind = this.bindPointerEvents();
    // G2: pause animation playback when the tab / window is hidden
    // (browsers throttle rAF to ~1fps in background but don't stop
    // it; explicit stop saves the decode + render entirely). Resume
    // when visible again, viewport permitting.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
    // Restore GIF/video bytes onto animated image shapes loaded from
    // an initial scene (e.g. localStorage), then arm the tick so the
    // animation plays from first paint.
    this.rehydrateAnimatedImages();
    this.maybeAnimate();
    // An animated adapter (GIF) decodes asynchronously; when a decode
    // completes it nudges us here. Re-render so a PAUSED animated shape
    // (reduced-motion / auto-stopped / frozen) — which has no tick to
    // pick the frames up — paints its decoded frame after reload.
    this.animationContentOff = onAnimationContentReady(() => this.scheduleRender());
    // First paint — synchronous so the canvas isn't blank for one
    // frame on mount. Hosts that mount + immediately read the
    // bitmap also get a consistent first frame.
    this.forceRender();
    // Prime the typed-event cache with the editor's initial state so
    // the *first* user-driven update only emits on a real flip.
    // Without this, an `editor.on("mode", fn)` listener installed
    // before any change would fire on the very next `setMode(current)`
    // call because every cached slice would still be `null`.
    primeEventCache(this.eventCache, this.observableSnapshot());
  }

  /** Snapshot used by event-fanout. Kept private — internal API. */
  private observableSnapshot() {
    return {
      mode: this.mode,
      selection: this._selection,
      scene: this._scene,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    };
  }

  // --- Public state ---

  get scene(): Scene {
    return this._scene;
  }
  get selection(): Selection.Selection {
    return this._selection;
  }
  get mode(): Mode {
    return this.actor.getSnapshot().context.mode;
  }
  get history(): HistoryProvider {
    return this._history;
  }
  get canUndo(): boolean {
    return this._history.canUndo;
  }
  get canRedo(): boolean {
    return this._history.canRedo;
  }

  /**
   * The DOM element the editor was mounted onto. Read-only — external
   * code reads it for screen-↔-world coordinate conversions on events
   * whose coordinates are in client-space (e.g. global `contextmenu`).
   */
  get hostElement(): HTMLElement {
    return this.host;
  }

  /** Subscribe to scene/selection/mode/history changes. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // --- Collab: remote presence push + local cursor push ---

  /**
   * Subscribe to local world-space pointer movement. Fires on every
   * `pointermove` over the host. `@collab` uses this to broadcast the
   * local cursor into the awareness room.
   */
  onCursorMove(fn: (point: Vec2) => void): () => void {
    this.cursorListeners.add(fn);
    return () => this.cursorListeners.delete(fn);
  }

  // --- Annotations ---

  /** Set the local user's identity for comments authored via this editor. */
  setCommentAuthor(author: { id: string; name: string }): void {
    this.commentAuthor = author;
  }

  /** Currently focused annotation id (or null when nothing is open). */
  get selectedAnnotation(): AnnotationId | null {
    return this._selectedAnnotation;
  }

  /**
   * Open or close an annotation thread. `null` clears the focus. The
   * overlay highlights the pin; `<CommentsPopover>` reads this and
   * renders the thread.
   */
  setSelectedAnnotation(id: AnnotationId | null): void {
    if (this._selectedAnnotation === id) return;
    this._selectedAnnotation = id;
    this.notify();
  }

  // Pure bodies in `./editor/public/annotations.ts`.
  addAnnotation(opts: {
    position: Vec2;
    elementId?: ElementId | null;
    firstComment?: string;
  }): AnnotationId {
    const result = computeAddAnnotation(this._scene, opts, this.commentAuthor, (p) =>
      this.uniqueId(p),
    );
    this._scene = result.scene;
    this._history.push(result.patch);
    this._selectedAnnotation = result.id;
    this.notify();
    this.announce("Annotation added");
    return result.id;
  }
  removeAnnotation(id: AnnotationId): void {
    const result = computeRemoveAnnotation(this._scene, id);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    if (this._selectedAnnotation === id) this._selectedAnnotation = null;
    this.notify();
    this.announce("Annotation removed");
  }
  toggleAnnotationResolved(id: AnnotationId): void {
    const result = computeToggleAnnotationResolved(this._scene, id);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
    this.announce(result.wasResolved ? "Annotation reopened" : "Annotation resolved");
  }
  addComment(
    annotationId: AnnotationId,
    body: string,
    author?: { id: string; name: string },
  ): void {
    const result = computeAddComment(
      this._scene,
      annotationId,
      body,
      author ?? this.commentAuthor,
      (p) => this.uniqueId(p),
    );
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }
  removeComment(annotationId: AnnotationId, commentId: CommentId): void {
    const result = computeRemoveComment(this._scene, annotationId, commentId);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }
  hitAnnotation(worldPoint: Vec2): AnnotationId | null {
    return hitAnnotationPure(this._scene, worldPoint);
  }

  /**
   * Subscribe to long-press events — a stationary touch / mouse-press
   * held longer than `LONG_PRESS_DELAY_MS`. The mobile-equivalent of
   * right-click; hosts open a context menu from this. The event
   * carries both screen-space (for menu positioning) and world-space
   * (for target hit-test) coordinates.
   */
  onLongPress(fn: (payload: { screenPoint: Vec2; worldPoint: Vec2 }) => void): () => void {
    this.longPressListeners.add(fn);
    return () => this.longPressListeners.delete(fn);
  }

  /**
   * Subscribe to accessibility live-region announcements. The host
   * pipes these strings into an `aria-live="polite"` element so a
   * screen-reader user hears the editor's status changes. Strings
   * are short and pre-localised by the caller of `announce`.
   */
  onAnnounce(fn: (message: string) => void): () => void {
    this.announceListeners.add(fn);
    return () => this.announceListeners.delete(fn);
  }

  /**
   * Push a live-region message to all `onAnnounce` listeners. Hosts
   * (and plugins) call this when something happened that an SR user
   * should hear: selection changed, shape moved, mode switched, etc.
   * The editor itself emits a small set of canonical messages from
   * `focusCycle` / `moveSelectionBy` / `cancelInteraction`.
   */
  announce(message: string): void {
    if (!message) return;
    for (const fn of this.announceListeners) fn(message);
  }

  /**
   * Replace the remote peer cursors painted by the overlay. Pass an
   * empty array to clear. The host is expected to filter out the
   * local user's cursor before calling.
   */
  setPeerCursors(cursors: readonly PeerCursor[]): void {
    this._peerCursors = cursors;
    this.scheduleRender();
  }

  /**
   * Replace the remote peer selections painted by the overlay. The
   * host resolves a peer's `selection: ElementId[]` into world bounds
   * before passing them in.
   */
  setPeerSelections(selections: readonly PeerSelection[]): void {
    this._peerSelections = selections;
    this.scheduleRender();
  }

  /**
   * Toggle the debug hit-zone overlay (host debug panel). When on, the
   * overlay paints every element's mouse hit-targets so the tuned slop
   * values can be eyeballed. View-only — not recorded in history.
   */
  setDebugHitZones(on: boolean): void {
    if (this.debugHitZones === on) return;
    this.debugHitZones = on;
    this.scheduleRender();
  }

  /** Whether the active draw-mode sticks after a create (toolbar lock). */
  get toolLocked(): boolean {
    return this._toolLocked;
  }

  /** Currently-selected edge id, if any. Null when no edge is selected. */
  get selectedLink(): LinkId | null {
    return this._selectedLink;
  }

  /**
   * Apply an in-place mutation to the currently-selected edge as a
   * single history step. The `updater` receives a clone of the edge
   * and returns the next version (callers should produce a new
   * object — Link is readonly). No-op when no edge is selected.
   */
  updateSelectedLink(updater: (edge: Link) => Link): void {
    const id = this._selectedLink;
    if (id === null) return;
    const r = updateLink(this._scene, id, updater);
    this._scene = r.scene;
    this._history.push(r.patch);
    this.notify();
  }

  /**
   * Register a file-drop handler. Handlers are tried in registration
   * order; the first whose `accept(file)` returns true takes the
   * file. Repeated calls with the same `id` replace the previous
   * handler (idempotent for module-load wiring).
   */
  registerFileDropHandler(handler: FileDropHandler): void {
    this.fileDropRegistry.register(handler);
  }

  /** Drop a registered handler. */
  unregisterFileDropHandler(id: string): void {
    this.fileDropRegistry.unregister(id);
  }

  /**
   * Dispatch a dropped file (or pasted file from clipboard) into
   * the registered handlers. Returns `true` when a handler accepted
   * the file, `false` otherwise — UI can show an "unsupported file"
   * toast on `false`. `worldPoint` is where the file should land
   * (drop-point projected to world coords; for paste, host can use
   * cursor world point or viewport centre).
   */
  async dispatchFileDrop(file: File, worldPoint: Vec2): Promise<boolean> {
    const ctx: FileDropContext = { editor: this, worldPoint };
    return this.fileDropRegistry.dispatch(file, ctx);
  }

  /**
   * Toggle the tool-lock affordance. With `true`, draw-modes persist
   * after each successful shape create — the user keeps drawing
   * rectangles without re-pressing R. With `false` (default), the
   * editor reverts to `select` after each create.
   */
  setToolLocked(locked: boolean): void {
    if (this._toolLocked === locked) return;
    this._toolLocked = locked;
    this.notify();
  }

  // Body moved to `./editor/gesture-tx.ts`.
  private maybeRevertModeAfterCreate(): void {
    this.gestures.maybeRevertModeAfterCreate();
  }

  setMode(mode: Mode): void {
    // Switching tools commits any in-flight text edit (standard: leaving the
    // editing context ends it, keeping the typed text).
    if (this._editingTextElement !== null) this.commitTextEdit();
    // Cancel any in-progress drag gesture so the partial state is not recorded.
    if (this.gestureTx) {
      this.gestureTx.cancel();
      this.gestureTx = null;
    }
    // Hide the port overlay when leaving draw-edge.
    if (mode !== "draw-edge" && this.hoveredLinkTarget !== null) {
      this.hoveredLinkTarget = null;
    }
    // Cursor affordance for hand mode — grab when armed, grabbing
    // takes over inside an active pan gesture. Restore the host's
    // previous cursor when leaving the mode.
    if (mode === "hand" && this.host?.style) {
      if (this.previousHostCursor === null) {
        this.previousHostCursor = this.host.style.cursor;
      }
      this.host.style.cursor = "grab";
    } else if (this.previousHostCursor !== null && this.mode === "hand" && !this.panGesture) {
      this.host.style.cursor = this.previousHostCursor;
      this.previousHostCursor = null;
    }
    this.actor.send({ type: "SET_MODE", mode });
    this.notify();
  }

  /** Undo the latest record. No-op if there is nothing to undo. */
  undo(): boolean {
    const inverse = this._history.undo();
    if (!inverse) return false;
    this._scene = apply(this._scene, inverse);
    this.pruneSelection();
    this.notify();
    return true;
  }

  /** Redo the undone record. */
  redo(): boolean {
    const patch = this._history.redo();
    if (!patch) return false;
    this._scene = apply(this._scene, patch);
    this.pruneSelection();
    this.notify();
    return true;
  }

  /**
   * Add a shape to the scene and push a single record onto the history stack.
   * Returns the resulting patch (useful for tests). Intended for code paths
   * that create shapes outside of a pointer gesture — drag-from-palette,
   * paste, programmatic insert.
   */
  addElement(shape: Element, options?: { select?: boolean }): Patch {
    const result = addElement(this._scene, shape);
    this._scene = result.scene;
    if (options?.select ?? true) {
      this._selection = Selection.single(shape.id);
    }
    this._history.push(result.patch);
    this.notify();
    return result.patch;
  }

  /**
   * Insert an image at the given world position. Wraps `addElement`
   * with the image-shape boilerplate (id, layer, order, scale=1,
   * rotation=0). Returns the new shape's id so callers can chain
   * (e.g. immediately reparent into a container).
   *
   * `src` is anything the renderer accepts — a data-URL from the
   * file-drop handler, a host CDN URL, an SVG string in
   * `image/svg+xml;base64,...` form.
   */
  // Pure body in `./editor/public/image-insert.ts`.
  insertImage(input: {
    src: string;
    width: number;
    height: number;
    position: Vec2;
    image?: HTMLImageElement;
    animated?: boolean;
    fileId?: import("@oh-just-another/types").FileId;
    animationKind?: string;
    animationData?: unknown;
  }): ElementId {
    const id = castElementId(this.uniqueId("img"));
    const shape = buildImageElement(this._scene, input, id, this._activeLayerId);
    this.addElement(shape);
    if (input.animated) {
      this.initPlayback(id);
      this.maybeAnimate();
    }
    return id;
  }
  async addBinaryFile(blob: Blob, name?: string): Promise<FileId> {
    const result = await computeAddBinaryFile(this._scene, blob, name, () => ++this.nextId);
    this._scene = result.scene;
    this._history.push(result.patch);
    return result.id;
  }

  /**
   * Animation tick — runs while any shape carries
   * `metadata.animated` (GIFs today; future video / lottie).
   * Forces a full re-render every frame so drawImage picks up the
   * current frame of natively-animated elements. Self-terminates
   * when no animated shapes remain.
   *
   * Lifecycle managed by the `AnimationTick` helper (see
   * `./animation-tick.ts`). `insertImage({animated:true})` and
   * `loadScene` start the tick; `dispose()` stops it.
   */
  /** EMA of animation-tick render cost (ms) — drives adaptive throttle (G3). */
  private gifRenderCostEma = 0;
  /** Wall-clock of the last animation-tick render — for interval throttle (G3). */
  private lastGifTickMs = 0;

  private readonly animationTick = new AnimationTick({
    // G1: keep ticking only while an animated shape is actually
    // on-screen. Frame selection is wall-clock-based, so when the
    // GIF scrolls back into view the tick resumes on the correct
    // frame (logical playback never "froze"). Tick is re-armed on
    // viewport changes via `maybeAnimate()` in `notify()`.
    isAnimated: () => this.hasVisibleAnimatedElement(),
    onTick: () => {
      // G3: adaptive throttle — skip this rAF if we rendered an
      // animation frame too recently. Target interval grows with the
      // measured render cost so a heavy scene drops GIF fps instead
      // of blowing the frame budget.
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const target = Math.min(
        ANIMATION_MAX_INTERVAL_MS,
        Math.max(ANIMATION_MIN_INTERVAL_MS, this.gifRenderCostEma * ANIMATION_COST_FACTOR),
      );
      if (now - this.lastGifTickMs < target) return;
      this.lastGifTickMs = now;
      // G4: freeze heavy GIFs that have played long enough.
      this.autoStopHeavyGifs();
      // Force a full re-render: the scene reference hasn't changed,
      // but the animation adapter advanced the GIF frame. Re-painting
      // picks up the current frame.
      this.lastRenderedScene = null;
      this.render();
      const cost =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - now;
      // EMA so a single spike doesn't overreact; decays back when load drops.
      this.gifRenderCostEma = this.gifRenderCostEma * 0.8 + cost * 0.2;
    },
  });

  // Pure body in `./editor/public/image-insert.ts`.
  private hasAnimatedElement(): boolean {
    return hasAnimatedElement(this._scene);
  }

  /**
   * True when at least one animated shape's world AABB intersects the
   * current viewport. Drives G1 viewport-culling of the animation
   * tick — off-screen GIFs don't burn decode / render cost, and the
   * wall-clock frame selection means they show the right frame the
   * moment they scroll back in.
   */
  private hasVisibleAnimatedElement(): boolean {
    if (!hasAnimatedElement(this._scene)) return false;
    const viewport = this.computeViewportWorld();
    if (!viewport) return true; // no viewport yet — don't suppress
    for (const shape of this._scene.elements.values()) {
      if (shape.metadata?.animated !== true) continue;
      if (B.intersects(getElementWorldBounds(shape), viewport)) return true;
    }
    return false;
  }

  /**
   * Re-arm the animation tick after a change that may have brought an
   * animated shape into (or out of) view — pan / zoom / scene edit.
   * `AnimationTick.start()` no-ops when already running or when
   * `isAnimated()` is false, so this is cheap to call from `notify()`.
   */
  private maybeAnimate(): void {
    if (this.hasVisibleAnimatedElement()) this.animationTick.start();
  }

  /** G2: bound `visibilitychange` handler — pause/resume the tick. */
  private readonly onVisibilityChange = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      this.animationTick.stop();
    } else {
      this.maybeAnimate();
    }
  };

  // ── Per-shape GIF playback (G4 auto-stop + G5 reduced-motion) ──────
  /**
   * Transient per-shape playback state for animated images. `originMs`
   * is the wall-clock the current play run started; `frozenMs` is the
   * playback offset a paused shape is held at. Not serialised — purely
   * a runtime view, rebuilt on insert / rehydrate.
   */
  private readonly playbackState = new Map<
    ElementId,
    {
      playing: boolean;
      /** Wall-clock origin for playback position (now − originMs = frame time). */
      originMs: number;
      /** Wall-clock the current play run began — drives the auto-stop timer
       *  independently of `originMs` so resuming doesn't instantly re-trip it. */
      playStartMs: number;
      /** Playback offset a paused shape is frozen at. */
      frozenMs: number;
    }
  >();

  /** Element id currently hovered — a hovered heavy GIF keeps playing
   *  (its auto-stop timer is held off). Set by the pointer hover path. */
  private hoveredAnimatedId: ElementId | null = null;

  private static nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  private static prefersReducedMotion(): boolean {
    if (typeof matchMedia !== "function") return false;
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  /**
   * Seed playback for a freshly-animated shape. G5: start paused (frozen
   * on frame 0) when the user prefers reduced motion; playing otherwise.
   */
  private initPlayback(id: ElementId): void {
    if (this.playbackState.has(id)) return;
    const now = Editor.nowMs();
    this.playbackState.set(id, {
      playing: !Editor.prefersReducedMotion(),
      originMs: now,
      playStartMs: now,
      frozenMs: 0,
    });
  }

  /** Playback timestamp fed to the renderer's animation clock for a
   *  shape: wall-clock when unmanaged, play offset when playing, the
   *  frozen frame when paused. */
  private playbackClock(elementId: ElementId): number {
    const st = this.playbackState.get(elementId);
    const now = Editor.nowMs();
    if (!st) return now;
    return st.playing ? now - st.originMs : st.frozenMs;
  }

  /**
   * Toggle GIF playback for a shape — wired to a click on an animated
   * image (G4 resume after auto-stop, G5 play after reduced-motion).
   * Resuming continues from the frozen frame.
   */
  togglePlayback(id: ElementId): void {
    const now = Editor.nowMs();
    const st = this.playbackState.get(id);
    if (!st) {
      this.playbackState.set(id, { playing: true, originMs: now, playStartMs: now, frozenMs: 0 });
    } else if (st.playing) {
      st.frozenMs = now - st.originMs;
      st.playing = false;
    } else {
      // Resume from the frozen frame AND restart the auto-stop timer,
      // otherwise a heavy GIF (frozen past GIF_AUTOSTOP_MS) would
      // re-trip auto-stop on the very next tick — playing one frame
      // then freezing again.
      st.originMs = now - st.frozenMs;
      st.playStartMs = now;
      st.playing = true;
    }
    this.maybeAnimate();
    this.scheduleRender();
  }

  /**
   * Hover entered an animated shape: resume it if paused and hold off
   * its auto-stop timer while the pointer stays over it (the auto-stop
   * pass keeps pushing `playStartMs` forward for the hovered shape).
   * Pass `null` when the pointer leaves all shapes.
   */
  hoverAnimatedElement(id: ElementId | null): void {
    if (this.hoveredAnimatedId === id) return;
    this.hoveredAnimatedId = id;
    if (id !== null) {
      const st = this.playbackState.get(id);
      const now = Editor.nowMs();
      if (st && !st.playing) {
        st.originMs = now - st.frozenMs;
        st.playStartMs = now;
        st.playing = true;
        this.maybeAnimate();
        this.scheduleRender();
      }
    }
  }

  /** True when the shape's GIF is paused (drives the overlay badge). */
  isPlaybackPaused(id: ElementId): boolean {
    return this.playbackState.get(id)?.playing === false;
  }

  /**
   * Hover-to-connect (standard): record the shape under the idle cursor and
   * the cursor position so the overlay can reveal that shape's link-start
   * dots (even unselected) and grow the dot nearest the cursor. Re-renders
   * when the hovered shape changes, or on every move while one is hovered
   * (the proximity grow tracks the cursor). Pass `(null, null)` to clear.
   */
  setHoverLinkStart(id: ElementId | null, cursor: Vec2 | null): void {
    const changed = this.hoverLinkStartElement !== id;
    this.hoverLinkStartElement = id;
    this.hoverCursorWorld = cursor;
    if (changed || id !== null) this.notify();
  }

  /** Record the link under the idle cursor for the overlay hover highlight. */
  setHoveredLink(id: LinkId | null): void {
    if (this.hoveredLinkId === id) return;
    this.hoveredLinkId = id;
    this.notify();
  }

  /** Link currently under the cursor (hover highlight), or null. */
  get hoveredLink(): LinkId | null {
    return this.hoveredLinkId;
  }

  /**
   * G4: freeze heavy GIFs after `GIF_AUTOSTOP_MS` of continuous play.
   * Light GIFs (small byte payload) loop forever. Called from the tick
   * before each animation render.
   */
  private autoStopHeavyGifs(): void {
    const now = Editor.nowMs();
    for (const shape of this._scene.elements.values()) {
      if (shape.type !== "image") continue;
      const img = shape as ImageElement;
      if (!img.animationKind) continue;
      const st = this.playbackState.get(img.id);
      if (!st || !st.playing) continue;
      const heavy =
        img.animationData instanceof ArrayBuffer &&
        img.animationData.byteLength > HEAVY_GIF_BYTES;
      if (!heavy) continue;
      // Hovered heavy GIF keeps playing — push its timer forward so it
      // never auto-stops while the pointer is over it.
      if (img.id === this.hoveredAnimatedId) {
        st.playStartMs = now;
        continue;
      }
      if (now - st.playStartMs > GIF_AUTOSTOP_MS) {
        st.frozenMs = now - st.originMs;
        st.playing = false;
      }
    }
  }

  /**
   * Restore transient `animationData` for animated image shapes after
   * a scene load. The raw GIF bytes don't survive serialisation
   * (`serializeScene` strips the ArrayBuffer), but they're persisted
   * in `Scene.files` via the shape's `fileId`. Here we copy the bytes
   * back onto `shape.animationData` so the registered animation
   * adapter (host-side, e.g. the gifuct decoder) can produce frames.
   *
   * Applied directly to `_scene` (no history entry — this is an
   * internal rehydration, not a user edit). No-op for shapes that
   * already carry live `animationData` or lack a resolvable file.
   */
  private rehydrateAnimatedImages(): void {
    for (const shape of this._scene.elements.values()) {
      if (shape.type !== "image") continue;
      const img = shape as ImageElement;
      if (!img.animationKind) continue;
      // Seed playback for every animated shape loaded from the scene
      // (G5 honours reduced-motion at this point too).
      this.initPlayback(img.id);
      if (!img.fileId) continue;
      if (img.animationData instanceof ArrayBuffer) continue; // already live
      const file = getBinaryFile(this._scene, img.fileId);
      if (!file) continue;
      this._scene = apply(this._scene, {
        kind: "element",
        id: img.id,
        before: img,
        after: { ...img, animationData: file.data },
      });
    }
  }

  /**
   * Drag-to-place flow for palette templates. Adds the shape to the
   * scene immediately so the user sees it dragging under the cursor,
   * but defers the history entry until `commit()` is called. `update`
   * re-positions without writing per-move patches; `cancel` removes
   * the shape entirely and leaves history intact (no undo entry).
   *
   * Typical wiring: HTML5 dragenter starts the placement, dragover
   * updates, drop commits, dragleave / window keydown(Escape) cancel.
   */
  // Placement helpers live in `./editor/public/placement.ts`.
  // Editor owns the transaction lifecycle and selection mutate;
  // the closure threads scene mutations through the pure helpers.
  beginPlacement(shape: Element): {
    update: (worldCenter: Vec2) => void;
    commit: () => void;
    cancel: () => void;
  } {
    const tx = this._history.transaction();
    const { scene: add, state: initialState } = beginPlacementState(shape);
    const initial = add(this._scene);
    this._scene = initial.scene;
    this._selection = Selection.single(shape.id);
    this.notify();
    const state: PlacementState = { ...initialState };
    return {
      update: (worldCenter) => {
        const r = computePlacementUpdate(this._scene, state, worldCenter);
        this._scene = r.scene;
        state.current = r.next;
        this.notify();
      },
      commit: () => {
        const drop = computePlacementContainerDrop(this._scene, state);
        if (drop) {
          this._scene = drop.scene;
          state.current = drop.next;
        }
        tx.add({ kind: "element", id: shape.id, before: null, after: state.current });
        tx.commit();
        // Notify is mandatory here, not optional. `update()` was firing
        // notifications during the dragover, but those snapshots had
        // the placement preview WITHOUT `parentId` — so the
        // AutoLayoutScheduler's `signatureFor(parent)` did not include
        // the new child, and no `runAutoLayout` was scheduled. The
        // reparent above just set `parentId`; without this final
        // `notify()` the scheduler never sees the change and the child
        // sits at its cursor-drop position until the NEXT unrelated
        // notification picks up the lag. Visible to the user as
        // "elements overlap on add, then snap to grid only after the
        // next add".
        this.notify();
      },
      cancel: () => {
        const { scene } = computePlacementCancel(this._scene, shape.id);
        this._scene = scene;
        tx.cancel();
        this._selection = Selection.EMPTY;
        this.notify();
      },
    };
  }

  // Pure body in `./editor/public/selection-ops.ts`.
  deleteSelected(): void {
    const result = computeDeleteSelection(this._scene, this._selection, this._selectedLink);
    if (!result) return;
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    this._selection = Selection.EMPTY;
    this._selectedLink = null;
    this.notify();
  }

  // --- Inline text editing ---

  /**
   * Currently edited text shape (or null). Set by `beginTextEdit`;
   * cleared by `commitTextEdit` / `cancelTextEdit`. The host overlay
   * (`<TextEditorOverlay>` in `@react-ui`) subscribes via `editor`
   * and renders a `<textarea>` positioned over the shape.
   */
  private _editingTextElement: ElementId | null = null;
  get editingTextElement(): ElementId | null {
    return this._editingTextElement;
  }
  /** Link whose caption is being edited inline (double-click), or null. */
  private _editingLinkCaption: LinkId | null = null;
  get editingLinkCaption(): LinkId | null {
    return this._editingLinkCaption;
  }
  /**
   * When the `draw-text` tool just placed a shape and opened its
   * editor, this holds that shape's id until the first commit. A
   * pending creation isn't in history yet: committing non-empty text
   * records a single add patch (whole shape = one undo); committing
   * empty / cancelling removes it with no history entry at all.
   */
  private _pendingTextCreate: ElementId | null = null;
  /**
   * Snapshot of the shape at edit start. Used to revert on cancel and
   * as the `before` of the single commit patch. `null` for a pending
   * creation (the shape didn't exist yet).
   */
  private _textEditOrigin: Element | null = null;
  /**
   * Live selection inside the edited text, mirrored from the hidden
   * `<textarea>` (`start`/`end` are source offsets, `dir` is the
   * anchored end). The caret is `dir === "backward" ? start : end`.
   */
  private _textSel: { start: number; end: number; dir: "forward" | "backward" } | null = null;
  /** Anchor offset for a canvas drag-select inside the edited text. */
  private _textDragAnchor: number | null = null;
  private _caretBlinkOn = true;
  private _caretBlinkTimer: ReturnType<typeof setInterval> | null = null;

  get editingTextSelection(): { start: number; end: number; dir: "forward" | "backward" } | null {
    return this._textSel;
  }
  /** Caret offset = the moving end of the selection. */
  get editingTextCaret(): number | null {
    if (!this._textSel) return null;
    return this._textSel.dir === "backward" ? this._textSel.start : this._textSel.end;
  }
  get caretBlinkOn(): boolean {
    return this._caretBlinkOn;
  }
  /** `true` while a canvas drag-select inside the edited text is active. */
  get isTextDragging(): boolean {
    return this._textDragAnchor !== null;
  }

  private startCaretBlink(): void {
    this._caretBlinkOn = true;
    this.stopCaretBlink();
    // Only run the blink when a DOM clock exists (browser host). Node
    // test envs construct the editor without a window — skip so a
    // dangling interval can't keep the process alive.
    if (typeof window === "undefined") return;
    this._caretBlinkTimer = setInterval(() => {
      this._caretBlinkOn = !this._caretBlinkOn;
      this.notify();
    }, CARET_BLINK_INTERVAL_MS);
  }
  private stopCaretBlink(): void {
    if (this._caretBlinkTimer !== null) {
      clearInterval(this._caretBlinkTimer);
      this._caretBlinkTimer = null;
    }
  }
  /** Reset the caret to solid (called on type / move so it never blinks off mid-action). */
  private wakeCaret(): void {
    this._caretBlinkOn = true;
  }

  /**
   * Begin editing a text shape's body. No-op when the shape doesn't
   * exist or isn't a text shape. Concurrent edits commit themselves
   * (only one shape at a time). Caret defaults to the end of the text.
   */
  // Pure bodies in `./editor/public/text-edit.ts`.
  /** Open inline caption editing for a link (double-click). */
  beginLinkCaptionEdit(id: LinkId): void {
    if (!getLink(this._scene, id)) return;
    if (this._editingTextElement !== null) this.commitTextEdit();
    this._editingLinkCaption = id;
    this.notify();
  }

  /**
   * Commit the link caption. Empty / whitespace text removes the label;
   * otherwise the label text is set, preserving any existing position /
   * styling. One undo step. Clears caption-edit mode.
   */
  commitLinkCaptionEdit(text: string): void {
    const id = this._editingLinkCaption;
    this._editingLinkCaption = null;
    if (id === null) {
      this.notify();
      return;
    }
    const edge = getLink(this._scene, id);
    if (edge) {
      const trimmed = text.trim();
      const nextLabel = trimmed === "" ? undefined : { ...(edge.label ?? {}), text: trimmed };
      const same = (edge.label?.text ?? "") === (nextLabel?.text ?? "");
      if (!same) {
        const r = updateLink(this._scene, id, (e) => {
          const next = { ...e } as typeof e & { label?: unknown };
          if (nextLabel) next.label = nextLabel;
          else delete next.label;
          return next as typeof e;
        });
        this._scene = r.scene;
        this._history.push(r.patch);
      }
    }
    this.notify();
  }

  /** Cancel link caption editing without changing the label. */
  cancelLinkCaptionEdit(): void {
    if (this._editingLinkCaption === null) return;
    this._editingLinkCaption = null;
    this.notify();
  }

  /** World-space anchor point for a link's caption (midpoint of its path). */
  linkLabelWorld(id: LinkId): Vec2 | null {
    const edge = getLink(this._scene, id);
    if (!edge) return null;
    const path = getLinkPath(this._scene, edge);
    if (!path || path.length < 2) return null;
    const t = edge.label?.position ?? 0.5;
    let total = 0;
    for (let i = 1; i < path.length; i++) total += distanceTo(path[i - 1]!, path[i]!);
    let remaining = total * t;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const seg = distanceTo(a, b);
      if (remaining <= seg) {
        const r = seg === 0 ? 0 : remaining / seg;
        return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
      }
      remaining -= seg;
    }
    return path[path.length - 1]!;
  }

  beginTextEdit(id: ElementId): void {
    if (!canBeginTextEdit(this._scene, id, (lid) => this.isLayerLocked(lid))) return;
    // Commit any in-flight edit on a different shape first.
    if (this._editingTextElement !== null && this._editingTextElement !== id) this.commitTextEdit();
    this._editingTextElement = id;
    this._textEditOrigin = this._pendingTextCreate === id ? null : (getElement(this._scene, id) ?? null);
    const shape = getElement(this._scene, id) as TextElement | undefined;
    const len = shape?.text.length ?? 0;
    this._textSel = { start: len, end: len, dir: "forward" };
    this.startCaretBlink();
    this.notify();
  }

  /**
   * Live edit transport from the hidden `<textarea>`: replace the
   * shape's text + selection as the user types / pastes / composes.
   * Mutates the scene WITHOUT a history entry — history is recorded
   * once on commit. No-op when not editing.
   */
  setEditingText(value: string, selStart: number, selEnd: number, dir: "forward" | "backward" = "forward"): void {
    const id = this._editingTextElement;
    if (!id) return;
    const r = updateElement(this._scene, id, (s) => ({ ...s, text: value }));
    this._scene = r.scene;
    this._textSel = { start: selStart, end: selEnd, dir };
    this.wakeCaret();
    this.notify();
  }

  /** Selection-only update (arrows / shift-select / click) — no text change. */
  setEditingSelection(selStart: number, selEnd: number, dir: "forward" | "backward" = "forward"): void {
    if (!this._editingTextElement) return;
    this._textSel = { start: selStart, end: selEnd, dir };
    this.wakeCaret();
    this.notify();
  }

  /**
   * Map a world-space point to a caret offset in the edited text. Used
   * to place / extend the caret from canvas clicks. Returns `null` when
   * not editing or the shape is gone.
   */
  caretIndexAtWorldPoint(worldPoint: Vec2): number | null {
    const id = this._editingTextElement;
    if (!id) return null;
    const shape = getElement(this._scene, id) as TextElement | undefined;
    if (shape?.type !== "text") return null;
    const layout = this.editingTextLayout(shape);
    if (!layout) return null;
    // World → shape-local (translate by position; rotation/scale on text
    // edit is uncommon — ignore for hit purposes).
    const local = { x: worldPoint.x - shape.position.x, y: worldPoint.y - shape.position.y };
    const align = shape.style.textAlign ?? "left";
    return pointToCaretIndex(layout, local, this.measureFor(shape), align);
  }

  /**
   * `true` when a point is inside the currently-edited text shape's
   * world bounds. Used by the pointer binding to decide between
   * repositioning the caret (inside) and committing (outside).
   */
  editedElementContainsPoint(worldPoint: Vec2): boolean {
    const id = this._editingTextElement;
    if (!id) return false;
    const shape = getElement(this._scene, id);
    if (!shape) return false;
    const b = getElementWorldBounds(shape);
    return (
      worldPoint.x >= b.x &&
      worldPoint.x <= b.x + b.width &&
      worldPoint.y >= b.y &&
      worldPoint.y <= b.y + b.height
    );
  }

  /** Place a collapsed caret at the clicked point and start a drag-select. */
  setTextCaretFromPoint(worldPoint: Vec2): void {
    const idx = this.caretIndexAtWorldPoint(worldPoint);
    if (idx === null) return;
    this._textDragAnchor = idx;
    this.setEditingSelection(idx, idx, "forward");
  }

  /** Extend the selection from the drag anchor to the current point. */
  extendTextSelectionToPoint(worldPoint: Vec2): void {
    if (this._textDragAnchor === null) return;
    const idx = this.caretIndexAtWorldPoint(worldPoint);
    if (idx === null) return;
    const anchor = this._textDragAnchor;
    if (idx >= anchor) this.setEditingSelection(anchor, idx, "forward");
    else this.setEditingSelection(idx, anchor, "backward");
  }

  /** End a canvas drag-select (clears the drag anchor). */
  endTextDragSelect(): void {
    this._textDragAnchor = null;
  }

  /** Build the editable layout for a text shape using the main target's metrics. */
  private editingTextLayout(shape: TextElement): EditableTextLayout | null {
    return layoutText(shape.text, this.measureFor(shape), {
      fontSize: shape.fontSize,
      ...(shape.maxWidth !== undefined ? { maxWidth: shape.maxWidth } : {}),
    });
  }

  /**
   * A measure callback bound to a shape's font, using the main target's
   * `measureText` — the SAME source the renderer draws with (WebGL2
   * reports MSDF advances) and the bounder measures with. Caret /
   * selection geometry therefore lines up exactly with the glyphs.
   */
  private measureFor(shape: TextElement): (s: string) => number {
    const target = this.mainTarget;
    // Match the rendered weight/style so caret / selection geometry lines
    // up with bold / italic glyphs (which have different advances).
    target.setFont(shape.fontFamily, shape.fontSize, {
      ...(shape.style.fontWeight === "bold" ? { weight: "bold" as const } : {}),
      ...(shape.style.fontStyle === "italic" ? { style: "italic" as const } : {}),
    });
    return (s: string) => target.measureText(s).width;
  }

  /**
   * World-space caret + selection geometry for the overlay pass.
   * Returns `null` when not editing. The caret is `null` while blinked
   * off so the overlay can simply skip drawing it.
   */
  editingTextOverlay(): {
    caret: { x: number; y: number; height: number } | null;
    caretColor: string;
    selectionRects: readonly Bounds[];
  } | null {
    const id = this._editingTextElement;
    if (!id || !this._textSel) return null;
    const shape = getElement(this._scene, id) as TextElement | undefined;
    if (shape?.type !== "text") return null;
    const layout = this.editingTextLayout(shape);
    if (!layout) return null;
    const align = shape.style.textAlign ?? "left";
    const measure = this.measureFor(shape);
    const { x: px, y: py } = shape.position;

    const local = textSelectionRects(layout, this._textSel.start, this._textSel.end, measure, align);
    const selectionRects: Bounds[] = local.map((r) => ({
      x: px + r.x,
      y: py + r.y,
      width: r.width,
      height: r.height,
    }));

    let caret: { x: number; y: number; height: number } | null = null;
    if (this._caretBlinkOn) {
      const cIdx = this._textSel.dir === "backward" ? this._textSel.start : this._textSel.end;
      const g = caretGeometry(layout, cIdx, measure, shape.fontSize, align);
      caret = { x: px + g.x, y: py + g.y, height: g.height };
    }
    return { caret, caretColor: shape.style.fill ?? "#1a1a1a", selectionRects };
  }

  commitTextEdit(next?: string): void {
    const id = this._editingTextElement;
    if (!id) return;
    const pending = this._pendingTextCreate === id;
    const origin = this._textEditOrigin;
    // Optional explicit text (keyboard / test callers); the live path
    // passes nothing because the scene already holds the typed text.
    if (next !== undefined) {
      this._scene = updateElement(this._scene, id, (s) => ({ ...s, text: next })).scene;
    }
    this._editingTextElement = null;
    this._pendingTextCreate = null;
    this._textEditOrigin = null;
    this._textSel = null;
    this.stopCaretBlink();

    const finalElement = getElement(this._scene, id) as TextElement | undefined;
    const text = finalElement?.text ?? "";

    // Empty (whitespace-only) text removes the shape. Pending = silent
    // (never recorded); existing = recorded so undo restores the origin.
    if (text.trim() === "") {
      if (finalElement) {
        this._scene = removeElement(this._scene, id).scene;
        if (!pending && origin) {
          this._history.push({ kind: "element", id, before: origin, after: null });
        }
        if (this._selection.has(id)) this._selection = Selection.EMPTY;
      }
      this.notify();
      return;
    }

    if (pending) {
      // Record the whole creation as one add patch.
      if (finalElement) this._history.push({ kind: "element", id, before: null, after: finalElement });
    } else if (origin && finalElement) {
      // Existing edit: record ONLY the text delta. Other fields (font
      // size etc.) changed via the panel push their own history during
      // the edit, so the commit's `before` keeps the final non-text
      // state and rewinds just the text.
      const originText = (origin as TextElement).text;
      if (originText !== finalElement.text) {
        const before = { ...finalElement, text: originText } as Element;
        this._history.push({ kind: "element", id, before, after: finalElement });
      }
    }
    this.notify();
  }

  cancelTextEdit(): void {
    const id = this._editingTextElement;
    if (id === null) return;
    const pending = this._pendingTextCreate === id;
    const origin = this._textEditOrigin;
    this._editingTextElement = null;
    this._pendingTextCreate = null;
    this._textEditOrigin = null;
    this._textSel = null;
    this.stopCaretBlink();

    // Revert live edits with no history entry. Pending creations are
    // removed entirely; existing shapes have only their TEXT restored
    // (panel-driven field changes during the edit keep their own
    // committed history and must survive the cancel).
    if (pending) {
      if (getElement(this._scene, id)) {
        this._scene = removeElement(this._scene, id).scene;
        if (this._selection.has(id)) this._selection = Selection.EMPTY;
      }
    } else if (origin) {
      const originText = (origin as TextElement).text;
      this._scene = updateElement(this._scene, id, (s) => ({ ...s, text: originText })).scene;
    }
    this.notify();
  }

  /**
   * Translate every selected shape by the given world-space delta.
   * Single undo step. No-op when selection is empty. Used by arrow-key
   * keyboard navigation; hosts pass `{ x: 1, y: 0 }` for fine nudge
   * and `{ x: 10, y: 0 }` for shift-arrow.
   */
  // Pure body in `./editor/public/selection-ops.ts`.
  moveSelectionBy(delta: Vec2): void {
    if (this._selection.size === 0) return;
    const targets = this.expandSelectionWithDescendants();
    const result = computeMoveSelectionBy(this._scene, targets, delta, (lid) =>
      this.isLayerLocked(lid),
    );
    if (!result) return;
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    this.notify();
    this.announce(describeNudgePure(delta, result.moved));
  }

  /**
   * Keyboard-friendly creation flow. Picks the shape type from the
   * current `mode` ("draw-rect" / "draw-ellipse" / fallback to
   * rectangle) and inserts a sensible default-sized shape at the
   * viewport center. Returns the new shape's id, or `null` when the
   * scene has no active layer.
   *
   * Hosts can bind this to "Enter" while in a draw mode, providing a
   * mouse-free alternative to drag-out creation.
   */
  // Pure body in `./editor/public/placement.ts`.
  createElementAtCursor(): ElementId | null {
    const vp = this._scene.viewport;
    const world = this.screenToWorld({
      x: (vp.size.width || 200) / 2,
      y: (vp.size.height || 200) / 2,
    });
    const id = newElementIdAtCursor(++this.nextId);
    const shape = buildElementAtCursor(this._scene, this.mode, world, this._activeLayerId, id);
    const r = addElement(this._scene, shape);
    this._scene = r.scene;
    this._history.push(r.patch);
    this._selection = Selection.single(id);
    this.notify();
    this.announce(`Created ${shape.type} ${id}`);
    return id;
  }

  /**
   * `draw-text` tool: drop an empty text shape at `worldPoint`, select
   * it and open its inline editor immediately. The add is a single undo
   * step; the subsequent text typed in is committed (or the empty shape
   * removed) by `commitTextEdit`. Reverts to `select` afterwards unless
   * the tool is locked.
   */
  createTextAt(worldPoint: Vec2): ElementId {
    const id = newElementIdAtCursor(++this.nextId);
    const shape = buildTextElementAt(this._scene, worldPoint, this._activeLayerId, id);
    // No history push here — the placeholder is "pending" until the
    // first commit (see `_pendingTextCreate`). This way an abandoned
    // text never pollutes the undo stack.
    const r = addElement(this._scene, shape);
    this._scene = r.scene;
    this._pendingTextCreate = id;
    this._selection = Selection.single(id);
    this.maybeRevertModeAfterCreate();
    this.notify();
    this.announce(`Created text ${id}`);
    this.beginTextEdit(id);
    return id;
  }

  // Pure bodies in `./editor/public/brush.ts`.
  beginBrushStroke(world: Vec2, pressure = 0.5): void {
    this.brushStroke = beginBrushStrokePure(world, pressure);
    this.notify();
  }
  extendBrushStroke(world: Vec2, pressure = 0.5): void {
    if (!this.brushStroke) return;
    extendBrushStrokePure(this.brushStroke, world, pressure);
    this.notify();
  }
  commitBrushStroke(): ElementId | null {
    const result = commitBrushStrokePure(
      this._scene,
      this.brushStroke,
      this._activeLayerId,
      newBrushId(++this.nextId),
    );
    if (!result) {
      this.brushStroke = null;
      this.notify();
      return null;
    }
    this._scene = result.scene;
    this._history.push(result.patch);
    this.brushStroke = null;
    this.notify();
    return result.elementId;
  }
  cancelBrushStroke(): void {
    if (!this.brushStroke) return;
    this.brushStroke = null;
    this.notify();
  }

  /** Current in-progress brush stroke, exposed for the overlay preview. */
  get pendingBrushStroke(): { readonly origin: Vec2; readonly points: readonly BrushPoint[] } | null {
    return this.brushStroke;
  }

  // Pure bodies in `./editor/public/arrange-group.ts`.
  arrangeAsGrid(opts: { cols?: number; gap?: number } = {}): void {
    const origin = this.combinedSelectionBounds() ?? { x: 0, y: 0 };
    const result = computeArrangeAsGrid(this._scene, this._selection, opts, origin);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
    this.announce(`Arranged ${result.count} shapes on a ${result.cols}-column grid`);
  }
  arrangeAsStack(opts: { direction?: "horizontal" | "vertical"; gap?: number } = {}): void {
    const origin = this.combinedSelectionBounds() ?? { x: 0, y: 0 };
    const result = computeArrangeAsStack(this._scene, this._selection, opts, origin);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
    this.announce(`Stacked ${result.count} shapes ${result.direction}`);
  }
  groupSelected(): GroupSelectedResult {
    const result = computeGroupSelected(
      this._scene,
      this._selection,
      newGroupElementId(++this.nextId),
    );
    if (!result) return { kind: "noop" };
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    this._selection = Selection.single(result.groupId);
    this.notify();
    return { kind: "grouped", groupId: result.groupId };
  }
  ungroup(): void {
    const result = computeUngroup(this._scene, this._selection);
    if (!result) return;
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    this._selection = new Set(result.nextSelection);
    this.notify();
  }
  private selectionRoots(): readonly Element[] {
    return selectionRoots(this._scene, this._selection);
  }
  private expandSelectionWithDescendants(): ReadonlySet<ElementId> {
    return expandSelectionWithDescendants(this._scene, this._selection);
  }
  focusCycle(direction: "next" | "prev"): void {
    const current = [...this._selection][0];
    const result = pickFocusCycle(this._scene, current, direction);
    if (!result) return;
    this._selection = Selection.single(result.id);
    this.notify();
    this.announce(`Selected ${result.name}`);
  }

  /**
   * Clear selection + cancel any in-progress drag / draw gesture.
   * Bound to Escape in default keyboard nav.
   */
  cancelInteraction(): void {
    if (this.gestureTx) {
      this.gestureTx.cancel();
      this.gestureTx = null;
    }
    this.actor.send({ type: "POINTER_CANCEL" });
    this.drawingPreview = null;
    this.edgePreview = null;
    this.lassoPreview = null;
    // Abort a host-managed link-from-anchor gesture too — it lives outside
    // the machine, so POINTER_CANCEL above doesn't touch it. Without this a
    // gesture left mid-flight would keep its preview after Escape.
    this.linkDragFromAnchor = null;
    this.hoveredLinkTarget = null;
    this.hoverLinkStartElement = null;
    this.hoverCursorWorld = null;
    this.hoveredLinkId = null;
    this._editingLinkCaption = null;
    this.pendingLinkDropMenu = null;
    this.linkWaypointDrag = null;
    // Esc exits group-isolation if active. The selection that was
    // active inside the group is dropped (Esc reads as a full
    // "back out" — selecting the group is a separate gesture).
    if (this._enteredGroup !== null) {
      this._enteredGroup = null;
    }
    this._selection = Selection.EMPTY;
    this._selectedLink = null;
    this.notify();
    this.announce("Selection cleared");
  }

  /**
   * Duplicate the selected shapes 10 px down-right of the originals.
   * Links between selected shapes are NOT cloned. They break cleanly.
   */
  // Pure body in `./editor/public/selection-ops.ts`.
  duplicateSelected(): void {
    const result = computeDuplicateSelection(this._scene, this._selection, () => ++this.nextId);
    if (!result) return;
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    if (result.newIds.length > 0) {
      this._selection = selectionFromNewIds(result.newIds);
    }
    this.notify();
  }
  setSelection(ids: Iterable<ElementId>): void {
    const next = computeSetSelection(this._scene, ids, this._selection);
    if (!next) return;
    this._selection = next;
    if (this._selectedLink !== null) this._selectedLink = null;
    this.notify();
  }
  selectAll(): void {
    const next = computeSelectAll(this._scene, this._selection);
    if (!next) return;
    this._selection = next;
    this.notify();
    this.announce(`Selected ${next.size} shapes`);
  }

  /**
   * Internal clipboard. Stored as deep-cloned snapshots so subsequent
   * mutations don't affect the buffer. Survives across editor calls
   * within the same session; cross-tab paste uses host-level
   * `navigator.clipboard` (out of scope for the editor).
   */
  private clipboard: Element[] = [];

  // Pure body in `./editor/public/clipboard.ts`.
  copySelected(): void {
    const out = copySelectedPure(this._scene, this._selection);
    if (out.length === 0) return;
    this.clipboard = [...out];
    this.announce(`Copied ${out.length} shapes`);
  }

  cutSelected(): void {
    this.copySelected();
    this.deleteSelected();
  }

  /**
   * Paste clipboard contents into the scene. The cluster lands so that
   * its centroid sits at `targetWorld` (defaults to the last tracked
   * cursor position; when even that is unavailable, falls back to a
   * +10 px nudge so duplicates remain visible). Relative offsets
   * between clipboard items are preserved.
   *
   * New shapes get fresh ids and end up selected. Single undo step.
   */
  // Pure body in `./editor/public/clipboard.ts`.
  paste(targetWorld?: Vec2): void {
    if (this.clipboard.length === 0) return;
    // Defensive: if a gesture is mid-flight (drag / resize) the
    // gestureTx is still open and a fresh `transaction()` inside
    // pasteElements would throw. Reasonable behaviour for a user
    // pressing Cmd+V mid-gesture is "commit what you have and
    // paste on top", so close the gesture first.
    this.finalizeOpenGestureTx();
    const target = targetWorld ?? this.lastPointerWorld;
    const result = pasteFromClipboard(
      this._scene,
      this._history,
      this.clipboard,
      target ?? null,
      () => ++this.nextId,
    );
    this._scene = result.scene;
    this._selection = selectionFromPasted(result.newIds);
    this.notify();
    this.announce(`Pasted ${result.newIds.length} shapes`);
  }

  /**
   * Merge `partial` into the `style` of every shape in `ids`. Useful
   * for the inspector / PropertyPanel: flipping `roundness`, swapping
   * `lineJoin`, changing `stroke` colour across a multi-selection,
   * etc. All changes go through one history record (single undo).
   *
   * No-op when `ids` is empty or none of the targeted shapes exist.
   */
  // Pure body in `./editor/public/selection-ops.ts`.
  updateStyle(ids: Iterable<ElementId>, partial: Partial<TextStyle>): void {
    const result = computeUpdateStyle(this._scene, ids, partial);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /**
   * Update non-style text properties (`fontSize`, `fontFamily`,
   * `maxWidth`) on every selected text shape. Non-text shapes are
   * skipped. Single undo step. Used by the text contextual panel.
   */
  updateTextProps(
    ids: Iterable<ElementId>,
    partial: { fontSize?: number; fontFamily?: string; maxWidth?: number },
  ): void {
    const result = computeUpdateTextProps(this._scene, ids, partial);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /**
   * Set (or clear, with `null`) the element-level hyperlink (`href`) on
   * every shape in `ids`. Single undo step. Pass a raw user string — it
   * is normalised here (`normalizeHref`: adds `https://`, `mailto:`,
   * rejects `javascript:`/`data:`); a string that normalises to nothing
   * clears the link. The host opens it on Cmd/Ctrl-click or the
   * hover link-popup.
   */
  setLink(ids: Iterable<ElementId>, href: string | null): void {
    const normalized = href === null ? null : normalizeHref(href);
    const result = computeSetLink(this._scene, ids, normalized);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /**
   * Open an element hyperlink in a new tab. Re-validates the scheme
   * (`safeHref`) before navigating — only `http`/`https`/`mailto`, never
   * `javascript:` / `data:` — and uses `noopener,noreferrer`. No-op for
   * an unsafe / empty href or outside a browser.
   */
  openLink(href: string | undefined | null): void {
    const url = safeHref(href);
    if (!url || typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /** The element-level href of a shape, if safe to open; else `null`. */
  elementLink(id: ElementId): string | null {
    return safeHref(getElement(this._scene, id)?.href);
  }

  /**
   * Topmost interactable shape at `worldPoint` that carries a safe link,
   * with its world bounds — for the hover link-popup. `null` when none.
   */
  linkAt(worldPoint: Vec2): { id: ElementId; href: string; bounds: Bounds } | null {
    const shape = this.acceleratedElementAt(worldPoint);
    if (!shape || !this.isElementInteractable(shape)) return null;
    const href = safeHref(shape.href);
    if (!href) return null;
    return { id: shape.id, href, bounds: getElementWorldBounds(shape) };
  }

  // Pure bodies in `./editor/public/z-order.ts`.
  bringToFront(id?: ElementId): void {
    const result = computeBringToFront(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }
  sendToBack(id?: ElementId): void {
    const result = computeSendToBack(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /** Move the target shape one step toward the top of its layer. */
  bringForward(id?: ElementId): void {
    const result = computeBringForward(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /** Move the target shape one step toward the bottom of its layer. */
  sendBackward(id?: ElementId): void {
    const result = computeSendBackward(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }
  compactLayerZOrder(
    layerId?: LayerId,
    options: { recordHistory?: boolean } = {},
  ): void {
    const recordHistory = options.recordHistory ?? true;
    const layerIds: readonly LayerId[] = layerId ? [layerId] : [...this._scene.layers.keys()];
    const tx = recordHistory ? this._history.transaction() : null;
    const touched = compactLayerZOrderPatches(this._scene, layerIds, (nextScene, patch) => {
      this._scene = nextScene;
      tx?.add(patch);
    });
    if (touched === 0) {
      tx?.cancel();
      return;
    }
    tx?.commit();
    this.notify();
    if (recordHistory) {
      this.announce(`Compacted z-order across ${layerIds.length} layer(s)`);
    }
  }

  /**
   * Wipe every shape + edge from the scene. Layers and viewport survive.
   * Clears history — restoring an empty scene through undo would be
   * surprising and the operation is rarely chained with other edits.
   */
  clear(): void {
    if (this._scene.elements.size === 0 && this._scene.links.size === 0) return;
    this._scene = {
      ...this._scene,
      elements: new Map(),
      links: new Map(),
    };
    this._selection = Selection.EMPTY;
    this._selectedLink = null;
    this._history.clear();
    this.notify();
  }

  // --- Layer commands ---

  /** Currently active layer — new shapes default into it. */
  get activeLayerId(): LayerId {
    return this._activeLayerId;
  }

  /** Switch the active layer. Hosts call this from a layer panel click. */
  setActiveLayer(id: LayerId): void {
    if (!this._scene.layers.has(id)) return;
    if (this._activeLayerId === id) return;
    this._activeLayerId = id;
    this.notify();
  }

  // Pure bodies in `./editor/public/layers.ts`.
  createLayer(name: string): LayerId {
    const result = computeCreateLayer(this._scene, name, newLayerId(++this.nextId));
    this._scene = result.scene;
    this._history.push(result.patch);
    this._activeLayerId = result.layerId;
    this.notify();
    return result.layerId;
  }

  removeLayer(id: LayerId): void {
    const result = computeRemoveLayer(this._scene, id, this._activeLayerId);
    if (!result) return;
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    this._activeLayerId = result.nextActiveLayerId;
    this._selection = Selection.EMPTY;
    this.notify();
  }

  renameLayer(id: LayerId, name: string): void {
    const result = computeRenameLayer(this._scene, id, name);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  toggleLayerVisibility(id: LayerId): void {
    const result = computeToggleLayerVisibility(this._scene, id);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  toggleLayerLock(id: LayerId): void {
    const result = computeToggleLayerLock(this._scene, id);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  moveSelectionToLayer(targetLayer: LayerId): void {
    const result = computeMoveSelectionToLayer(this._scene, this._selection, targetLayer);
    if (!result) return;
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    this.notify();
  }

  // --- Viewport commands ---

  /**
   * Pan the camera by a screen-space delta. Drives both wheel-pan and
   * the two-finger pan gesture; deltas are in screen pixels (positive
   * x → shapes move right relative to the user). Not recorded in
   * history — viewport state is editor-local.
   */
  // Pure bodies in `./editor/public/zoom-pan.ts`.
  panBy(deltaScreen: Vec2): void {
    const next = computePan(this._scene, deltaScreen);
    if (!next) return;
    this._scene = next;
    this.notify();
  }
  zoomIn(): void {
    this.zoomStep(WHEEL_ZOOM_STEP);
  }
  zoomOut(): void {
    this.zoomStep(1 / WHEEL_ZOOM_STEP);
  }
  private zoomStep(factor: number): void {
    const vp = this._scene.viewport;
    if (vp.size.width <= 0 || vp.size.height <= 0) return;
    const center = this.screenToWorld({ x: vp.size.width / 2, y: vp.size.height / 2 });
    this.zoomAt(factor, center);
  }
  resetZoom(): void {
    const next = computeResetZoom(this._scene);
    if (!next) return;
    this._scene = next;
    this.notify();
  }
  zoomToFit(padding = 40): void {
    const next = computeZoomToFit(this._scene, padding);
    if (!next) return;
    this._scene = next;
    this.notify();
  }
  zoomAt(factor: number, anchorWorld: Vec2): void {
    const next = computeZoomAt(this._scene, factor, anchorWorld);
    if (!next) return;
    this._scene = next;
    this.notify();
  }
  setViewportSize(width: number, height: number): void {
    const next = computeViewportResize(this._scene, width, height);
    if (!next) return;
    this._scene = next;
    this.notify();
  }
  setGrid(patch: { size?: number; style?: import("@oh-just-another/scene").GridStyle }): void {
    const next = computeSetGrid(this._scene, patch);
    if (!next) return;
    this._scene = next;
    this.notify();
  }

  /**
   * Replace the entire scene (e.g. after `parseScene`). Clears history,
   * selection and any open gesture. Use to load a saved document.
   */
  loadScene(scene: Scene, options: LoadSceneOptions = {}): void {
    if (this.gestureTx) {
      this.gestureTx.cancel();
      this.gestureTx = null;
    }
    this._scene = scene;
    // Snap active layer back into the loaded scene's layer set.
    if (!scene.layers.has(this._activeLayerId)) {
      const first = scene.layers.keys().next().value;
      this._activeLayerId = first ?? castLayerId(DEFAULT_LAYER_ID);
    }
    if (options.preserveHistory) {
      // Used by collab when a peer update arrives — the local user's
      // undo stack must survive remote edits. Drop selection entries
      // that no longer point to existing shapes; the rest of the stack
      // stays untouched (patches that reference removed shapes will
      // throw on `apply` and need user-visible recovery later).
      this.pruneSelection();
    } else {
      this._selection = Selection.EMPTY;
      this._history.clear();
    }
    // Restore transient animationData (GIF bytes) from Scene.files
    // before the tick so the animation adapter can decode frames.
    this.rehydrateAnimatedImages();
    this.notify();
    // Loaded scene may carry animated shapes (e.g. GIF re-imported
    // from saved JSON). Re-arm the tick — `metadata.animated` survives
    // serialisation and `rehydrateAnimatedImages` re-attached the
    // bytes, so the registered adapter can produce frames again.
    // `maybeAnimate` honours the G1 viewport cull.
    this.maybeAnimate();
  }

  /** Detach all DOM listeners and stop the actor. */
  dispose(): void {
    this.cancelLongPress();
    this.unbind();
    this.actor.stop();
    this.listeners.clear();
    this.cursorListeners.clear();
    this.longPressListeners.clear();
    this.announceListeners.clear();
    this.animationTick.stop();
    this.animationContentOff?.();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    if (this.renderRafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
  }

  // --- Internal ---

  // Body moved to `./editor/pointer-binding.ts` (~700 lines of
  // pointer / wheel / keyboard dispatch). The thin wrapper here
  // preserves the original constructor call site.
  private bindPointerEvents(): () => void {
    return bindPointerEventsExternal(this);
  }

  /**
   * Open a pan gesture: capture the pointer so subsequent move / up
   * events arrive even outside the host bounds, cancel anything the
   * machine might have started this tick, and switch the cursor.
   */
  private beginPanGesture(pointerId: number, button: number, point: Vec2): void {
    this.actor.send({ type: "POINTER_CANCEL" });
    this.cancelGesture();
    this.cancelLongPress();
    this.host.setPointerCapture(pointerId);
    this.panGesture = {
      pointerId,
      button,
      startPoint: point,
      lastPoint: point,
      moved: false,
    };
    if (this.previousHostCursor === null) {
      this.previousHostCursor = this.host.style.cursor;
    }
    this.host.style.cursor = "grabbing";
  }

  /**
   * End an in-progress pan gesture. Restores the cursor unless Space
   * is still held (then we drop back to "grab" so the user knows
   * another drag is armed). For right-click that didn't move past
   * the slop threshold, fires the long-press callback so the context
   * menu opens at the click position — that's the "right-click =
   * menu, right-drag = pan" decision rule.
   */
  private endPanGesture(): void {
    const gesture = this.panGesture;
    this.panGesture = null;
    if (gesture && (gesture.button === 2 || gesture.button === 1) && !gesture.moved) {
      // Right-click without drag → trigger the context-menu listeners.
      // Same payload as touch long-press so existing UI (e.g.
      // `@react-ui/ContextMenu`) works without changes.
      const worldPoint = this.screenToWorld(gesture.startPoint);
      for (const fn of this.longPressListeners) {
        fn({ screenPoint: gesture.startPoint, worldPoint });
      }
    } else {
      // Either it was a real drag, or Space + left drag. In both
      // cases we DO want to keep the native context menu suppressed
      // until the upcoming `contextmenu` event lands (Chrome fires
      // it after pointerup on right button).
    }
    if (this.spaceHeld) {
      this.host.style.cursor = "grab";
      return;
    }
    if (this.previousHostCursor !== null) {
      this.host.style.cursor = this.previousHostCursor;
      this.previousHostCursor = null;
    }
  }

  private isDrawingPhase(ctx: InteractionContext): boolean {
    return ctx.mode === "draw-rect" || ctx.mode === "draw-ellipse" || ctx.mode === "draw-edge";
  }

  // --- Long-press --- (controller in `./editor/long-press.ts`)

  private startLongPress(screenPoint: Vec2): void {
    this.longPress.start(screenPoint);
  }
  private cancelLongPress(): void {
    this.longPress.cancel();
  }

  // --- Pinch gesture --- (controller in `./editor/pinch.ts`)
  private beginPinch(): void {
    this.pinch.begin([...this.activePointers.values()]);
  }
  private applyPinch(): void {
    this.pinch.apply([...this.activePointers.values()]);
  }

  /**
   * Convert a point in the host element's CSS-pixel coordinate space into
   * world coordinates. Public so drop handlers (drag-from-palette, paste)
   * can map pointer positions back to scene space.
   */
  screenToWorld(point: Vec2): Vec2 {
    return matrix.applyToPoint(getScreenToWorld(this._scene.viewport), point);
  }

  // Pure body in `./editor/hit-test.ts`. Editor passes a narrow
  // context bundle that closes over its private state + accel
  // helpers (acceleratedElementAt, isElementInteractable, …).
  private hitTest(worldPoint: Vec2): PressTarget {
    return pickPressTarget(worldPoint, {
      scene: this._scene,
      selection: this._selection,
      selectedLink: this._selectedLink,
      enteredGroup: this._enteredGroup,
      handleHitSlop: this.handleHitSlop,
      edgeHandleHitSlop: this.edgeHandleHitSlop,
      edgeHitThreshold: this.edgeHitThreshold,
      hitAnnotation: (p) => this.hitAnnotation(p),
      selectionIsAspectLocked: () => this.selectionIsAspectLocked(),
      combinedSelectionBounds: () => this.combinedSelectionBounds(),
      acceleratedElementAt: (p) => this.acceleratedElementAt(p),
      isElementInteractable: (s) => this.isElementInteractable(s),
      isLayerLocked: (id) => this.isLayerLocked(id),
      promoteToGroupRoot: (s) => this.promoteToGroupRoot(s),
    });
  }

  /** True when the given layer exists and is marked `locked`. */
  private isLayerLocked(layerId: LayerId): boolean {
    const layer = this._scene.layers.get(layerId);
    return layer?.locked === true;
  }

  /**
   * Combined interactivity check: false when the shape's layer is
   * locked, or when the shape itself or any ancestor via `parentId`
   * carries `locked: true` (group lock propagation). Hit-test treats
   * non-interactable hits as misses; render still draws them so the
   * user can see what's locked.
   */
  private isElementInteractable(shape: Element): boolean {
    if (this.isLayerLocked(shape.layerId)) return false;
    if (isElementLocked(this._scene, shape)) return false;
    if (isElementHidden(this._scene, shape)) return false;
    return true;
  }

  /**
   * Promote a hit shape to the topmost ancestor whose group we have NOT
   * "entered" yet. Only **`group`**-typed parents promote — containers
   * (swim-lane, frame) intentionally let click hits land on their
   * children. Group is an abstract wrapper that has no visual identity,
   * so promoting up to it is the only way to select it; a container has
   * its own body, header, etc. and clicking inside it should let users
   * pick the actual child shape (rectangle, sticky, …) — same affordance
   * as standard.
   *
   * Stops at the first non-`group` parent. With `_enteredGroup` set,
   * the walk also stops just below that group so children can be edited
   * directly.
   */
  private promoteToGroupRoot(shape: Element): Element {
    return promoteToGroupRootHelper(this._scene, shape, this._enteredGroup);
  }

  /**
   * Topmost group ancestor of `shape` (walks parentId chain, returns
   * the highest `type === "group"` parent). `null` if `shape` has no
   * group ancestor. Used by drill-down: a double-click on a shape
   * with a group ancestor enters that group. Body extracted to
   * `./group-helpers.ts`.
   */
  private topGroupAncestor(shape: Element): Element | null {
    return topGroupAncestorHelper(this._scene, shape);
  }

  /**
   * True when `elementId`'s parent chain contains `groupId`. Used by the
   * isolation exit path: a click on a shape whose parent chain *does
   * not* lead through the entered group is a click "outside" the
   * group, which exits isolation.
   */
  private isDescendantOfGroup(elementId: ElementId, groupId: ElementId): boolean {
    return isDescendantOfGroupHelper(this._scene, elementId, groupId);
  }

  /**
   * Compute the dim set for isolation rendering: every shape whose
   * parent chain does NOT pass through `enteredGroupId`. The entered
   * group itself is treated as "inside" (returns true from
   * isDescendantOfGroup) so it stays at full alpha — but groups have
   * no intrinsic geometry, so this only matters for the
   * group-bounds-outline overlay path, not the shape render.
   *
   * Defensive: shapes in the current selection are never dimmed. The
   * focus shape (drilled-into child) is always a group descendant in
   * practice, but the guard keeps the contract simple — "what you've
   * selected, you can see".
   */
  // Body moved to `./editor/shape-filters.ts`.
  private computeHiddenElements(): ReadonlySet<ElementId> | undefined {
    return computeHiddenElementsPure(this._scene);
  }

  private computeDimElements(enteredGroupId: ElementId): ReadonlySet<ElementId> {
    return computeDimElementsHelper(this._scene, this._selection, enteredGroupId);
  }

  /**
   * Enter a group — subsequent hits inside this group return children
   * directly instead of the group root. `null` exits group-edit mode.
   * Bound to double-click on a group in the default handler.
   */
  enterGroup(groupId: ElementId | null): void {
    this._enteredGroup = groupId;
    this.notify();
  }

  /** Currently "entered" group, if any. */
  get enteredGroup(): ElementId | null {
    return this._enteredGroup;
  }

  /**
   * SpatialGrid-accelerated topmost-shape lookup. Linear scan for small
   * scenes; for larger scenes builds a grid lazily, keyed by current 
   * scene-identity. Scene operations replace `_scene` (immutable patches), 
   * so reference-equality is a sufficient invalidation signal.
   */
  private acceleratedElementAt(worldPoint: Vec2): Element | undefined {
    if (this._scene.elements.size < LARGE_SCENE_HIT_THRESHOLD) {
      return getElementAt(this._scene, worldPoint);
    }
    return getElementAtIndexed(this._scene, this.ensureSpatialIndex(), worldPoint);
  }

  /**
   * Build (or return the cached) `SpatialGrid` for the current scene.
   * Re-built only when `_scene` reference changes — scene operations
   * always produce a fresh object, so reference equality is a
   * sufficient invalidation signal.
   *
   * Shared between the hit-test path (`acceleratedElementAt`) and the
   * renderer pass (passed to `renderScene` as `spatialIndex`), so
   * the grid build cost is amortised across both consumers.
   */
  private ensureSpatialIndex(): SpatialGrid {
    const cached = this.spatialIndexCache;
    if (cached && cached.scene === this._scene) return cached.index;
    const index = buildSpatialIndex(this._scene);
    this.spatialIndexCache = { scene: this._scene, index };
    return index;
  }

  /**
   * Group-isolation click routing. Returns `true` if the click was
   * handled (caller should skip the default applyEmit), `false` if the
   * normal selection emit should still run.
   *
   * Three paths fire here:
   *   1. **Double-click on a grouped shape (not yet in isolation):**
   *      enter that group; select the raw inner shape (bypassing the
   *      group-root promotion that ran in hitTest).
   *   2. **Inside isolation, click on a non-descendant shape OR empty
   *      space:** exit isolation. Let the normal click then run so the
   *      newly clicked element / empty selection takes hold.
   *   3. **Inside isolation, double-click on the entered group's own
   *      child group:** drill another level deeper. (Implicit: same as
   *      case 1 but topGroupAncestor here returns the inner child
   *      group because the outer group is already entered.)
   *
   * Side-effect: updates `lastClickAt` / `lastClickWorldPoint`
   * regardless of result, so subsequent calls can detect a double-
   * click against this event.
   */
  private routeIsolationClick(
    clickEffect: InteractionEmit | null,
    worldPoint: Vec2,
  ): boolean {
    const now = performance.now();
    const isDouble =
      now - this.lastClickAt < DOUBLE_CLICK_MS &&
      this.lastClickWorldPoint !== null &&
      distanceTo(this.lastClickWorldPoint, worldPoint) <= DOUBLE_CLICK_TOLERANCE_PX;
    this.lastClickAt = now;
    this.lastClickWorldPoint = worldPoint;

    if (!clickEffect) return false;

    // Click outside the entered group while in isolation → exit; let
    // the normal click effect run after.
    if (this._enteredGroup !== null) {
      const targetId =
        clickEffect.type === "SELECT_REPLACE" || clickEffect.type === "SELECT_TOGGLE"
          ? clickEffect.id
          : null;
      const stillInside =
        targetId !== null && this.isDescendantOfGroup(targetId, this._enteredGroup);
      if (!stillInside) {
        this._enteredGroup = null;
        this.notify();
        // Fall through — apply the normal click effect (caller).
        return false;
      }
    }

    // Double-click handling for SELECT_REPLACE / SELECT_TOGGLE
    // effects. Two outcomes, in priority order:
    //   1) text shape → open inline text editor (highest priority —
    //      double-clicking text in any editor means "edit the body");
    //   2) shape with a group ancestor → drill into that group.
    // Lasso / edge ops are not double-click candidates and fall
    // through to the normal single-click handler.
    // Double-click on a link → edit its caption inline (standard).
    if (isDouble && clickEffect.type === "SELECT_EDGE_REPLACE") {
      this._selectedLink = clickEffect.id;
      this.beginLinkCaptionEdit(clickEffect.id);
      return true;
    }
    if (isDouble && (clickEffect.type === "SELECT_REPLACE" || clickEffect.type === "SELECT_TOGGLE")) {
      const raw = this.acceleratedElementAt(worldPoint);
      if (raw?.type === "text") {
        this.beginTextEdit(raw.id);
        return true;
      }
      if (raw) {
        const top = this.topGroupAncestor(raw);
        // If the topmost group is the one we've already entered, drill
        // one level deeper — pick the next-down group on the chain.
        const target = this.pickDrillTarget(raw, top);
        if (target) {
          this._enteredGroup = target.id;
          this._selection = Selection.single(raw.id);
          if (this._selectedLink !== null) this._selectedLink = null;
          this.notify();
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Given the raw shape under the cursor and its topmost group
   * ancestor, pick which group to "enter" on a drill-down.
   *
   * - No group ancestor → null (drill-down doesn't apply).
   * - Top group not yet entered → enter top.
   * - Top group already entered → walk down the chain to find the
   *   next group inward (one level deeper).
   */
  private pickDrillTarget(raw: Element, top: Element | null): Element | null {
    return pickDrillTargetHelper(this._scene, raw, top, this._enteredGroup);
  }

  private applyEmit(emit: InteractionEmit): void {
    switch (emit.type) {
      case "SELECT_REPLACE":
        this._selection = Selection.single(emit.id);
        if (this._selectedLink !== null) this._selectedLink = null;
        this.notify();
        return;
      case "SELECT_TOGGLE":
        this._selection = Selection.toggle(this._selection, emit.id);
        if (this._selectedLink !== null) this._selectedLink = null;
        this.notify();
        return;
      case "SELECT_CLEAR":
        this._selection = Selection.EMPTY;
        if (this._selectedLink !== null) this._selectedLink = null;
        this.notify();
        return;
      case "SELECT_EDGE_REPLACE":
        this._selectedLink = emit.id;
        this._selection = Selection.EMPTY;
        this.notify();
        return;
      case "SELECT_EDGE_CLEAR":
        if (this._selectedLink !== null) {
          this._selectedLink = null;
          this.notify();
        }
        return;
      case "UPDATE_EDGE_ENDPOINT_PREVIEW":
        this.linkEndpointDrag = {
          linkId: emit.linkId,
          side: emit.side,
          toPoint: emit.toPoint,
        };
        this.notify();
        return;
      case "UPDATE_EDGE_ENDPOINT":
        this.applyLinkEndpointUpdate(emit);
        return;
      case "LASSO_PROGRESS":
        // Capture the pre-lasso selection on the first progress emit
        // of a gesture; subsequent emits use it as the additive base.
        if (this.lassoBaseSelection === null) {
          this.lassoBaseSelection = this._selection;
        }
        this.lassoPreview = emit.bounds;
        this.applyLassoLiveSelection(emit.bounds, emit.mode);
        this.notify();
        return;
      case "LASSO_CLEAR":
        if (this.lassoPreview !== null || this.lassoBaseSelection !== null) {
          this.lassoPreview = null;
          this.lassoBaseSelection = null;
          this.notify();
        }
        return;
      case "SELECT_BY_BOUNDS":
        // Final commit — uses the same logic as the live preview so
        // the visible selection matches what lands. Reset the base
        // snapshot so the next gesture re-captures it.
        this.lassoBaseSelection = null;
        this.applySelectByBounds(emit.bounds, emit.mode);
        return;
      case "MOVE_SHAPE":
        if (this.groupMoveOrigin) {
          this.applyGroupMove(emit.delta);
        } else {
          this.applyMove(emit.id, emit.delta, emit.originalBounds);
        }
        return;
      case "RESIZE_GROUP":
        this.applyGroupResize(emit.handle, emit.delta, emit.originalBounds);
        return;
      case "RESIZE_SHAPE":
        this.applyResize(emit.id, emit.handle, emit.delta, emit.originalBounds);
        return;
      case "CREATE_SHAPE":
        this.applyCreate(emit.shapeType, emit.bounds);
        return;
      case "CREATE_EDGE":
        this.applyCreateLink(emit);
        return;
      case "DRAW_EDGE_PREVIEW":
        this.applyLinkPreview(emit.fromElement, emit.fromPoint, emit.toPoint);
        return;
      case "DRAW_EDGE_PREVIEW_CLEAR":
        if (this.edgePreview) {
          this.edgePreview = null;
          this.notify();
        }
        return;
      case "TEMPLATE_TAP":
        // Forward to subscribers via a custom listener path.
        for (const fn of this.templateTapListeners) fn(emit);
        return;
      case "TEMPLATE_DROP":
        for (const fn of this.templateDropListeners) fn(emit);
        return;
      case "MOVE_ANNOTATION":
        this.applyAnnotationMove(emit.id, emit.delta, emit.originalPosition);
        return;
      case "COMMIT_ANNOTATION_DRAG":
        this.finalizeOpenGestureTx();
        return;
    }
  }

  /**
   * Drag handler for annotation pins. Moves the pin to
   * `origin + delta`. Anchor semantics: for shape-anchored
   * annotations the `position` field is shape-local, so dragging
   * still updates the same field — the editor doesn't try to
   * reparent the anchor mid-drag; user wants the pin under the
   * cursor and that's exactly what `position + (delta in world)`
   * gives, regardless of which space the position is interpreted
   * in (`getAnnotationWorldPosition` already adds the shape's
   * world position when anchored).
   *
   * Wrapped in a single gestureTx so per-move updates collapse
   * into one undo step.
   */
  // Pure body in `./editor/applies/move.ts`.
  private applyAnnotationMove(id: AnnotationId, delta: Vec2, origin: Vec2): void {
    const result = computeAnnotationMovePatch(this._scene, id, delta, origin);
    if (!result) return;
    this._scene = result.scene;
    this.recordGesturePatch(result.patch);
    this.notify();
  }

  private readonly templateTapListeners = new Set<
    (emit: Extract<InteractionEmit, { type: "TEMPLATE_TAP" }>) => void
  >();
  private readonly templateDropListeners = new Set<
    (emit: Extract<InteractionEmit, { type: "TEMPLATE_DROP" }>) => void
  >();

  /**
   * Subscribe to template button taps. Returns an unsubscribe function.
   * Hosts use this to route template button clicks to their own actions.
   */
  onTemplateTap(
    fn: (emit: Extract<InteractionEmit, { type: "TEMPLATE_TAP" }>) => void,
  ): () => void {
    this.templateTapListeners.add(fn);
    return () => this.templateTapListeners.delete(fn);
  }

  /**
   * Subscribe to drops onto template drop-zones. Returns an unsubscribe fn.
   * Hosts decide what to do with the drop (e.g. add a child shape, link
   * templates together).
   */
  onTemplateDrop(
    fn: (emit: Extract<InteractionEmit, { type: "TEMPLATE_DROP" }>) => void,
  ): () => void {
    this.templateDropListeners.add(fn);
    return () => this.templateDropListeners.delete(fn);
  }

  /**
   * Dispatch a TEMPLATE_DROP emit programmatically. Hosts call this from their
   * own DOM `drop` listener after looking up which drop-zone (if any) is
   * under the pointer via `findDropZoneAt`.
   */
  dispatchTemplateDrop(emit: Extract<InteractionEmit, { type: "TEMPLATE_DROP" }>): void {
    this.applyEmit(emit);
  }

  // Pure body in `./editor/applies/move.ts`.
  private applyMove(id: ElementId, delta: Vec2, originalBounds: Bounds): void {
    const patch = computeElementMovePatch(this._scene, id, delta, originalBounds);
    if (!patch) return;
    this._scene = apply(this._scene, patch);
    this.recordGesturePatch(patch);
    this.notify();
  }

  private applyGroupMove(delta: Vec2): void {
    if (!this.groupMoveOrigin) return;
    const patches = computeGroupMovePatches(this._scene, this.groupMoveOrigin, delta);
    for (const patch of patches) {
      this._scene = apply(this._scene, patch);
      this.recordGesturePatch(patch);
    }
    this.notify();
  }

  // Body moved to `./editor/viewport-helpers.ts`.
  private computeViewportWorld(): Bounds | null {
    return computeViewportWorldPure(this._scene);
  }

  /**
   * Identity-diff the current scene against the last rendered one and
   * return the union AABB of every shape/edge that changed reference
   * (added, removed, or replaced). Returns `null` to force a full
   * clear when something that affects the entire surface changes —
   * viewport pan/zoom/resize, layer visibility, or the first frame.
   *
   * Empty union (returned as a zero-area bbox far off-screen) means
   * nothing changed; renderScene will cull every shape via its
   * `dirtyWorld` filter — effectively a no-op main pass.
   */
  private computeDirtyWorld(): Bounds | null {
    const prev = this.lastRenderedScene;
    const next = this._scene;
    if (!prev) return null;
    // Skip dirty-rect optimization until the canvas has been sized at
    // least once — the first paint to a 0×0 viewport doesn't actually
    // hit pixels, so we have to force a full repaint as soon as the
    // host's ResizeObserver fires (even when the diff finds zero
    // changed shapes, e.g. when only viewport.size changed but the
    // viewport ref happened to equal — which can't happen, but defence
    // in depth).
    if (
      prev.viewport.size.width <= 0 ||
      prev.viewport.size.height <= 0 ||
      next.viewport.size.width <= 0 ||
      next.viewport.size.height <= 0
    ) {
      return null;
    }
    // Active gesture (drag / resize / brush / placement) → full
    // repaint. Dirty-rect optimisation skipped on purpose:
    //
    //   • transitive-overlap expansion catches the common case but
    //     misses corner cases (edges attached to moving shapes,
    //     group descendants that aren't all siblings, hovered
    //     ports that decorate a different layer);
    //   • during a drag we already repaint the largest dirty area
    //     in the scene (the moving shape's swept bbox), so the
    //     dirty optimisation buys almost no perf — the only thing
    //     it does is occasionally drop a frame for a sibling that
    //     should have been redrawn underneath / above the mover;
    //   • once the gesture commits, the next render falls back to
    //     normal dirty-rect behaviour again.
    //
    // Net: trade ~1 frame's worth of work during the drag for
    // guaranteed correct z-order.
    if (
      this.gestureTx !== null ||
      this.dragElementId !== null ||
      this.drawingPreview !== null ||
      this.edgePreview !== null ||
      this.brushStroke !== null ||
      this.lassoPreview !== null
    ) {
      return null;
    }
    // Anything that affects the global render — viewport (pan / zoom /
    // size) or layer ordering / visibility — forces a full clear.
    if (prev.viewport !== next.viewport) return null;
    if (prev.layers !== next.layers) return null;
    // Isolation transition (enter / exit a group) re-dims a wide swath
    // of shapes without touching the scene reference, so force a full
    // repaint when the entered-group identity changes between frames.
    if (this.lastRenderedEnteredGroup !== this._enteredGroup) return null;
    // Scene ref unchanged → nothing changed on main canvas → skip the
    // whole pass via an empty off-screen rect that the dirty filter
    // culls every shape against.
    if (prev === next) {
      return { x: -1e9, y: -1e9, width: 0, height: 0 };
    }
    let acc: Bounds | null = null;
    const add = (b: Bounds): void => {
      acc = acc ? B.union(acc, b) : b;
    };
    // Track shapes that changed (added / removed / mutated). Links
    // attached to any of these have stale rendered paths even when
    // the edge object itself is reference-equal — the path resolves
    // through the shape's new position, but the old path stays on
    // screen as a "ghost" trail unless we explicitly invalidate it.
    const changedElementIds = new Set<ElementId>();
    for (const [id, shape] of next.elements) {
      const old = prev.elements.get(id);
      if (old === shape) continue;
      changedElementIds.add(id);
      const afterBounds = getElementWorldBounds(shape);
      const beforeBounds = old ? getElementWorldBounds(old) : null;
      add(afterBounds);
      if (beforeBounds) add(beforeBounds);
      // Stash for the tile-cache path — covers add + move via
      // before/after pair; pure mutation re-uses the single
      // afterBounds rect.
      if (this.tileComposeFn !== null) {
        this.tileDirtyElements.set(id, { before: beforeBounds, after: afterBounds });
      }
    }
    for (const [id, shape] of prev.elements) {
      if (!next.elements.has(id)) {
        changedElementIds.add(id);
        const beforeBounds = getElementWorldBounds(shape);
        add(beforeBounds);
        if (this.tileComposeFn !== null) {
          this.tileDirtyElements.set(id, { before: beforeBounds, after: null });
        }
      }
    }
    const linkTouchesChangedElement = (edge: Link): boolean => {
      for (const ep of [edge.from, edge.to]) {
        if (ep.kind !== "point") {
          if (changedElementIds.has(ep.elementId)) return true;
        }
      }
      return false;
    };
    for (const [id, edge] of next.links) {
      const old = prev.links.get(id);
      // Refresh edge dirty-rect when: edge object changed, OR an
      // endpoint references a shape that moved this frame (path is
      // re-resolved every render but the old screen pixels persist).
      if (old === edge && !linkTouchesChangedElement(edge)) continue;
      const b = computeLinkWorldBounds(next, edge);
      if (b) add(b);
      const oldLink = old ?? edge; // prev scene resolves with prev shapes for ghost-clear
      const ob = computeLinkWorldBounds(prev, oldLink);
      if (ob) add(ob);
    }
    for (const [id, edge] of prev.links) {
      if (!next.links.has(id)) {
        const b = computeLinkWorldBounds(prev, edge);
        if (b) add(b);
      }
    }
    if (acc === null) return { x: -1e9, y: -1e9, width: 0, height: 0 };
    // Transitive expansion: any shape whose bounds intersect the
    // current dirty rect must be repainted, AND its bounds added
    // to the dirty rect so any shape ABOVE it that overlaps gets
    // included too. Repeat until the set stabilises.
    //
    // Without this, dragging A through a B/C stack produces
    // visual jitter: B intersects the dirty rect and gets
    // repainted, but C — sitting above B and partially overlapping
    // it — doesn't intersect the original dirty, so B re-emerges
    // on top of where C should still be drawn. Z-order is correct
    // in `getElementsInLayer`; the issue is missed shapes, not
    // wrong order.
    const visited = new Set<ElementId>();
    let expanded: Bounds = acc;
    let grew = true;
    while (grew) {
      grew = false;
      for (const shape of next.elements.values()) {
        if (visited.has(shape.id)) continue;
        const bb = getElementWorldBounds(shape);
        if (!B.intersects(bb, expanded)) continue;
        visited.add(shape.id);
        const merged = B.union(expanded, bb);
        if (
          merged.x !== expanded.x ||
          merged.y !== expanded.y ||
          merged.width !== expanded.width ||
          merged.height !== expanded.height
        ) {
          expanded = merged;
          grew = true;
        }
      }
    }
    // Inflate by a couple pixels to cover anti-aliased stroke fuzz
    // around the geometry edges.
    return B.expand(expanded, 4);
  }

  // Bodies moved to `./editor/viewport-helpers.ts`.
  private combinedSelectionBounds(): Bounds | null {
    return combinedSelectionBoundsPure(this._scene, this._selection);
  }
  private groupChildrenUnion(groupId: ElementId): Bounds | null {
    return groupChildrenUnionPure(this._scene, groupId);
  }

  /**
   * True when the current selection should be treated as aspect-
   * locked for group-handle resize. Currently: a single `group`-typed
   * shape selected. Multi-selection of free shapes keeps the default
   * 8-handle / free-aspect behaviour (matches user expectation:
   * grouping is the explicit "lock the ratio" gesture).
   */
  private selectionIsAspectLocked(): boolean {
    if (this._selection.size === 0) return false;
    if (this._selection.size === 1) {
      const [only] = [...this._selection];
      if (!only) return false;
      // A single group (grouping IS the explicit "lock ratio" gesture)
      // or a single image (images may only be scaled, never distorted).
      const type = getElement(this._scene, only)?.type;
      return type === "group" || type === "image";
    }
    // Multi-selection: lock when every selected shape is an image — they
    // must never be stretched out of ratio, only scaled together.
    for (const id of this._selection) {
      if (getElement(this._scene, id)?.type !== "image") return false;
    }
    return true;
  }

  // Pure body in `./editor/applies/resize.ts`.
  private applyGroupResize(handle: HandleId, delta: Vec2, originalBounds: Bounds): void {
    if (!this.groupResizeOrigin) return;
    const result = computeGroupResizePatches(
      this._scene,
      this.groupResizeOrigin,
      handle,
      delta,
      originalBounds,
      this.selectionIsAspectLocked(),
    );
    this._scene = result.scene;
    for (const patch of result.patches) this.recordGesturePatch(patch);
    this.notify();
  }

  private applyResize(id: ElementId, handle: HandleId, delta: Vec2, originalBounds: Bounds): void {
    const shape = getElement(this._scene, id);
    // Text: aspect-locked font scaling. Snapshot the pristine shape on
    // the gesture's first tick so the scale base never compounds.
    if (shape?.type === "text") {
      if (!this._resizeOriginElement || this._resizeOriginElement.id !== id) {
        this._resizeOriginElement = shape;
      }
      const result = computeTextResize(
        this._scene,
        this._resizeOriginElement as TextElement,
        handle,
        delta,
        originalBounds,
      );
      if (!result) return;
      this._scene = result.scene;
      this.recordGesturePatch(result.patch);
      this.notify();
      return;
    }
    const result = computeElementResize(this._scene, id, handle, delta, originalBounds, (s, raw, h) =>
      this.clampContainerToChildren(s, raw, h),
    );
    if (!result) return;
    this._scene = result.scene;
    this.recordGesturePatch(result.patch);
    this.notify();
  }

  // Pure body in `./editor/applies/create.ts`.
  private applyCreate(kind: "rect" | "ellipse" | "frame", bounds: Bounds): void {
    const id = newElementId(++this.nextId);
    const result = computeCreateElement(this._scene, kind, bounds, id, this._activeLayerId, () =>
      this.nextFrameName(),
    );
    this._scene = result.scene;
    this._selection = Selection.single(id);
    // CREATE is a single-shot operation, not part of a multi-tick gesture.
    this._history.push(result.patch);
    // Frame-specific: scoop up every shape whose centre lies inside
    // the new frame's bounds and tag them with `frameId`.
    if (kind === "frame") {
      this.assignFrameMembers(id, bounds);
    }
    this.maybeRevertModeAfterCreate();
    this.notify();
  }

  /** Generate the next "Frame N" name based on existing frames. */
  private nextFrameName(): string {
    return nextFrameNameHelper(this._scene);
  }

  /**
   * Assign frameId to every shape (except the frame itself) whose
   * centre falls inside the frame's world bounds. Runs as a single
   * undo step in the same gesture transaction as the create.
   */
  private assignFrameMembers(frameId: ElementId, frameBounds: Bounds): void {
    this._scene = assignFrameMembersHelper(
      this._scene,
      this._history,
      frameId,
      frameBounds,
    );
  }

  // Pure body in `./editor/applies/create.ts`. Endpoint snapping
  // stays here because it needs the snap engine.
  private applyCreateLink(emit: Extract<InteractionEmit, { type: "CREATE_EDGE" }>): void {
    const from = this.snapLinkEndpoint(emit.fromElement, emit.fromPoint);
    const to = this.snapLinkEndpoint(emit.toElement, emit.toPoint);
    const id = newLinkId(++this.nextId);
    const result = computeCreateLink(this._scene, from, to, id, this._activeLayerId);
    this._scene = result.scene;
    this._history.push(result.patch);
    this.edgePreview = null;
    this.maybeRevertModeAfterCreate();
    // Dropped on empty canvas (free `point` end) → offer a shape-picker at
    // the drop point (standard). The free-ended link stays; picking re-points
    // it, dismissing keeps it. Only the `to` end is user-dragged here.
    if (to.kind === "point") {
      this.pendingLinkDropMenu = { linkId: id, side: "to", world: to.position };
    }
    this.notify();
  }

  /** Pending shape-picker after a link was dropped on empty canvas. */
  get linkDropMenu(): { linkId: LinkId; side: "from" | "to"; world: Vec2 } | null {
    return this.pendingLinkDropMenu;
  }

  /**
   * Resolve a pending link-drop shape-picker by creating an element from
   * `factory` centred at the drop point and re-pointing the dropped link
   * end to float against it. Element + re-point land in one undo step; the
   * new element becomes the selection. No-op when no menu is pending.
   */
  placeShapeAtLinkDrop(factory: (ctx: {
    id: ElementId;
    layerId: LayerId;
    position: Vec2;
    order: FractionalIndex;
  }) => Element): void {
    const pending = this.pendingLinkDropMenu;
    if (!pending) return;
    const link = getLink(this._scene, pending.linkId);
    if (!link) {
      this.pendingLinkDropMenu = null;
      this.notify();
      return;
    }
    const newId = newElementId(++this.nextId);
    const order = orderForTop(
      [...this._scene.elements.values()]
        .filter((sh) => sh.layerId === this._activeLayerId)
        .map((sh) => sh.order),
    );
    const built = factory({ id: newId, layerId: this._activeLayerId, position: pending.world, order });
    // Centre the element on the drop point regardless of how the factory
    // anchored it at `position`.
    const wb = getElementWorldBounds(built);
    const shape = {
      ...built,
      position: {
        x: built.position.x + (pending.world.x - (wb.x + wb.width / 2)),
        y: built.position.y + (pending.world.y - (wb.y + wb.height / 2)),
      },
    } as Element;

    const tx = this._history.transaction();
    const added = addElement(this._scene, shape);
    this._scene = added.scene;
    tx.add(added.patch);
    const upd = updateLink(this._scene, pending.linkId, (e) => ({
      ...e,
      [pending.side]: { kind: "floating", elementId: newId },
    }));
    this._scene = upd.scene;
    tx.add(upd.patch);
    tx.commit();

    this.pendingLinkDropMenu = null;
    this._selection = Selection.single(newId);
    this._selectedLink = null;
    this.notify();
  }

  /** Dismiss the link-drop shape-picker, leaving the free-ended link. */
  dismissLinkDropMenu(): void {
    if (!this.pendingLinkDropMenu) return;
    this.pendingLinkDropMenu = null;
    this.notify();
  }

  /**
   * standard "click a link-start dot" gesture: spawn a new element in that
   * dot's outward direction and link the source to it. The clone copies
   * the source's type / style / size but NOT its text (a fresh blank of
   * the same kind). Direction is source → new; the new element becomes the
   * selection. Element + link land in one undo step.
   */
  private createLinkedElementFromAnchor(fromElement: ElementId, anchorName: string): void {
    const src = getElement(this._scene, fromElement);
    if (!src) return;
    const anchor: AnchorRef = { kind: "named", name: anchorName };
    const normal = getAnchorOutwardNormal(src, anchor);
    const bounds = getElementWorldBounds(src);
    const srcCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    // Same-size clone → centre-to-centre distance = the source's extent
    // along the normal + the gap, leaving exactly
    // ANCHOR_CLICK_NEW_ELEMENT_GAP between the facing edges. `extentAlong`
    // resolves to width for a horizontal normal, height for a vertical one
    // (link-start dots are the four edge midpoints).
    const extentAlong = Math.abs(normal.x) * bounds.width + Math.abs(normal.y) * bounds.height;
    const dist = extentAlong + ANCHOR_CLICK_NEW_ELEMENT_GAP;
    const delta = { x: normal.x * dist, y: normal.y * dist };

    const newId = newElementId(++this.nextId);
    const order = orderForTop(
      [...this._scene.elements.values()]
        .filter((sh) => sh.layerId === src.layerId)
        .map((sh) => sh.order),
    );
    let clone = {
      ...src,
      id: newId,
      position: { x: src.position.x + delta.x, y: src.position.y + delta.y },
      order,
    } as Element;
    // Blank user text — the new element is a fresh same-kind shape, not a
    // content copy (standard). Only `text` (TextElement) and `name`
    // (FrameElement) carry user-entered text. Cast through `Element` because
    // `exactOptionalPropertyTypes` rejects the bare object literal against
    // the union (TS2375), even though the narrowed branch is sound.
    if (clone.type === "text") clone = { ...clone, text: "" } as Element;
    else if (clone.type === "frame") clone = { ...clone, name: "" } as Element;

    const tx = this._history.transaction();
    const added = addElement(this._scene, clone);
    this._scene = added.scene;
    tx.add(added.patch);

    const linkId = newLinkId(++this.nextId);
    const placed = getElement(this._scene, newId)!;
    const { ref: toRef } = findNearestAnchor(placed, srcCenter, snapExcludedAnchors(placed));
    const linkResult = computeCreateLink(
      this._scene,
      { kind: "anchor", elementId: fromElement, anchor },
      { kind: "anchor", elementId: newId, anchor: toRef },
      linkId,
      this._activeLayerId,
    );
    this._scene = linkResult.scene;
    tx.add(linkResult.patch);
    tx.commit();

    this._selection = Selection.single(newId);
    if (this._selectedLink !== null) this._selectedLink = null;
    this.notify();
  }

  /**
   * Build an `LinkEndpoint` for a draw-edge / re-bind gesture. Runs the
   * scene's snap engine for the probe point, prefers anchor snap when
   * close enough, falls back to outline snap (so the user can attach
   * "anywhere on the right edge"), then `point` for the free-floating
   * case.
   *
   * `pressTargetElement` is the shape the gesture originated from or
   * landed on (used as a strong hint — we don't snap onto unrelated
   * shapes when the user clearly aimed for this one).
   */
  private snapLinkEndpoint(pressTargetElement: ElementId | null, worldPoint: Vec2): LinkEndpoint {
    if (!pressTargetElement) {
      return { kind: "point", position: worldPoint };
    }
    const shape = getElement(this._scene, pressTargetElement);
    if (!shape) return { kind: "point", position: worldPoint };

    const result = this.snapEngine.snap({
      scene: this._scene,
      probe: worldPoint,
      threshold: this.snapThreshold,
      gesture: "draw-edge",
    });

    // standard contract: dropping on a specific port dot → *fixed* anchor;
    // dropping anywhere else on the shape (body, or near the edge but not
    // on a dot) → *floating* against the whole shape, so the connection
    // re-aims at the partner as either shape moves.
    // Prefer a candidate that belongs to the press-target shape — avoids
    // attaching to a neighbouring shape closer to the release point.
    const onTarget = result.all.filter((c) => c.metadata?.elementId === pressTargetElement);
    const anchorHit = onTarget.find((c) => c.kind === "anchor");
    if (anchorHit) {
      const ep = endpointFromSnap(pressTargetElement, anchorHit, shape);
      if (ep.kind === "anchor") return ep;
    }
    return { kind: "floating", elementId: pressTargetElement };
  }

  // Pure body in `./editor/applies/selection.ts`. The wrappers
  // here own the side effects (`_selectedLink` clearing, notify).
  private applySelectByBounds(bounds: Bounds, mode: "replace" | "add"): void {
    const next = selectByBoundsPure(
      this._scene,
      this._selection,
      (id) => this.isLayerLocked(id),
      bounds,
      mode,
    );
    if (this._selectedLink !== null) this._selectedLink = null;
    if (Selection.equals(next, this._selection)) {
      this.notify();
      return;
    }
    this._selection = next;
    this.notify();
  }

  private applyLassoLiveSelection(bounds: Bounds, mode: "replace" | "add"): void {
    const base = this.lassoBaseSelection ?? Selection.EMPTY;
    const next = selectByBoundsLivePure(
      this._scene,
      base,
      (id) => this.isLayerLocked(id),
      bounds,
      mode,
    );
    if (Selection.equals(next, this._selection)) return;
    if (this._selectedLink !== null) this._selectedLink = null;
    this._selection = next;
  }

  // Pure body in `./editor/applies/edge.ts`. The wrapper here
  // owns the side effects (history push, drag-state clearing,
  // notify).
  private applyLinkEndpointUpdate(
    emit: Extract<InteractionEmit, { type: "UPDATE_EDGE_ENDPOINT" }>,
  ): void {
    const result = computeLinkEndpointUpdate(this._scene, emit, (toElement, toPoint) =>
      this.snapLinkEndpoint(toElement, toPoint),
    );
    if (result === null) {
      this.linkEndpointDrag = null;
      this.notify();
      return;
    }
    this._scene = result.scene;
    this._history.push(result.patch);
    this.linkEndpointDrag = null;
    this.notify();
  }

  /** True while a waypoint of the selected link is being dragged. */
  get isDraggingWaypoint(): boolean {
    return this.linkWaypointDrag !== null;
  }

  /**
   * Begin a host-managed waypoint drag. `insert` splices a new waypoint at
   * `index` on the first move (segment-midpoint "add" handle); otherwise an
   * existing waypoint at `index` is moved. Live-mutated through the gesture
   * transaction so the whole drag is one undo step.
   */
  beginWaypointDrag(linkId: LinkId, index: number, insert: boolean): void {
    if (!getLink(this._scene, linkId)) return;
    this.linkWaypointDrag = { linkId, index, pendingInsert: insert };
  }

  /** Live update of the dragged waypoint to `world`. */
  updateWaypointDrag(world: Vec2): void {
    const drag = this.linkWaypointDrag;
    if (!drag) return;
    const edge = getLink(this._scene, drag.linkId);
    if (!edge) return;
    const wps = [...(edge.waypoints ?? [])];
    if (drag.pendingInsert) {
      wps.splice(drag.index, 0, world);
      drag.pendingInsert = false;
    } else {
      if (drag.index < 0 || drag.index >= wps.length) return;
      wps[drag.index] = world;
    }
    const r = updateLink(this._scene, drag.linkId, (e) => ({ ...e, waypoints: wps }));
    this._scene = r.scene;
    this.recordGesturePatch(r.patch);
    this.notify();
  }

  /**
   * Finish the waypoint drag. If the dragged waypoint landed within
   * `WAYPOINT_COLLAPSE_RADIUS` of an adjacent path point, it is removed
   * (drag-onto-the-line to delete). A no-move insert adds nothing.
   */
  endWaypointDrag(): void {
    const drag = this.linkWaypointDrag;
    this.linkWaypointDrag = null;
    if (!drag) return;
    if (drag.pendingInsert) {
      // Never moved → it was a click on a midpoint; nothing inserted.
      this.commitGesture();
      return;
    }
    const edge = getLink(this._scene, drag.linkId);
    if (edge && edge.waypoints && drag.index >= 0 && drag.index < edge.waypoints.length) {
      const path = getLinkPath(this._scene, edge);
      const wp = edge.waypoints[drag.index]!;
      // Neighbours in the [from, ...waypoints, to] chain: path[index] and
      // path[index + 2] (path[0] = from, so waypoint i sits at path[i + 1]).
      // Dropping the waypoint back onto the straight segment between its
      // neighbours removes the bend ("drag onto the line to delete").
      const collapse = WAYPOINT_COLLAPSE_RADIUS / (this._scene.viewport.zoom || 1);
      const a = path?.[drag.index];
      const b = path?.[drag.index + 2];
      if (a && b && distanceToSegmentPt(wp, a, b) <= collapse) {
        const wps = edge.waypoints.filter((_, i) => i !== drag.index);
        const r = updateLink(this._scene, drag.linkId, (e) => ({ ...e, waypoints: wps }));
        this._scene = r.scene;
        this.recordGesturePatch(r.patch);
      }
    }
    this.commitGesture();
  }

  /**
   * Route the selected link around other shapes (A* elbow router). Stores
   * the obstacle-avoiding bends in `waypoints` and switches the link to
   * orthogonal routing — one undo step. No-op when nothing is selected, the
   * route can't be found, or the scene has more than
   * `AUTO_ROUTE_MAX_OBSTACLES` shapes (perf gate, à la standard's snap gate).
   */
  autoRouteSelectedLink(): void {
    const id = this._selectedLink;
    if (id === null) return;
    const edge = getLink(this._scene, id);
    if (!edge) return;
    const path = getLinkPath(this._scene, edge);
    if (!path || path.length < 2) return;
    const from = path[0]!;
    const to = path[path.length - 1]!;

    // Don't treat the link's own endpoint shapes as obstacles.
    const exclude = new Set<ElementId>();
    for (const ep of [edge.from, edge.to]) if (ep.kind !== "point") exclude.add(ep.elementId);

    const obstacles: Bounds[] = [];
    for (const shape of this._scene.elements.values()) {
      if (exclude.has(shape.id)) continue;
      obstacles.push(getElementWorldBounds(shape));
      if (obstacles.length > AUTO_ROUTE_MAX_OBSTACLES) return; // perf gate
    }

    const route = elbowRoute(from, to, obstacles);
    if (!route || route.length < 2) return;
    const waypoints = route.slice(1, -1); // drop the resolved from / to
    const r = updateLink(this._scene, id, (e) => ({ ...e, routing: "orthogonal", waypoints }));
    this._scene = r.scene;
    this._history.push(r.patch);
    this.notify();
  }

  private updateHoveredLinkTarget(worldPoint: Vec2): void {
    const shape = this.acceleratedElementAt(worldPoint);
    if (!shape) {
      if (this.hoveredLinkTarget !== null) {
        this.hoveredLinkTarget = null;
        this.notify();
      }
      return;
    }

    const result = this.snapEngine.snap({
      scene: this._scene,
      probe: worldPoint,
      threshold: this.snapThreshold,
      gesture: "draw-edge",
    });

    // Prefer a snap candidate that belongs to the current shape —
    // ensures the "ghost" points don't jump to a nearby shape.
    const onTarget = result.all.filter((c) => c.metadata?.elementId === shape.id);
    const anchor = onTarget.find((c) => c.kind === "anchor");
    const outline = onTarget.find((c) => c.kind === "outline");

    const ref = anchor?.metadata?.ref as AnchorRef | undefined;
    let activeName: string | null = null;
    if (ref?.kind === "named") {
      activeName = ref.name;
    } else if (ref?.kind === "edge" && ref.t === 0.5) {
      activeName = `edge-${ref.index}`;
    }
    const outlinePoint = !activeName && outline ? outline.snapped : undefined;

    const prev = this.hoveredLinkTarget;
    if (
      prev?.elementId === shape.id &&
      prev.activeAnchor === activeName &&
      prev.outlinePoint?.x === outlinePoint?.x &&
      prev.outlinePoint?.y === outlinePoint?.y
    ) {
      return;
    }

    this.hoveredLinkTarget = { elementId: shape.id, activeAnchor: activeName, outlinePoint };
    this.notify();
  }

  // Pure body in `./editor/applies/edge.ts`.
  private applyLinkPreview(fromElement: ElementId | null, fromPoint: Vec2, toPoint: Vec2): void {
    this.edgePreview = computeLinkPreviewEndpoints(this._scene, fromElement, fromPoint, toPoint);
    this.notify();
  }

  // Gesture lifecycle — recordGesturePatch / commitGesture /
  // cancelGesture / finalizeOpenGestureTx / maybeRevertModeAfterCreate
  // live in `./editor/gesture-tx.ts`. The thin instance methods
  // below preserve the original call sites; the bodies (and their
  // docstrings) moved out to the controller.
  private recordGesturePatch(patch: Patch): void {
    this.gestures.record(patch);
  }
  private commitGesture(): void {
    this._resizeOriginElement = null;
    this.gestures.commit();
  }
  private finalizeOpenGestureTx(): void {
    this.gestures.finalize();
  }

  /**
   * End-of-drag container hookup. Runs after the state machine has
   * received POINTER_UP but before the gesture transaction commits,
   * so reparent + auto-grow land in a single undo step with the drag.
   *
   * Rules:
   * - If the shape hovered over a container and is not yet its child →
   *   set `parentId`. If the shape exceeds the dropZone bounds,
   *   grow the zone (expand container size).
   * - If the shape was a child of something but the final world bounds
   *   no longer intersect the parent's drop-zone — clear `parentId` (drag-out).
   * - Cycles (container into its own descendant) are prevented
   *   by the `containerHover` pipeline above — the exclude set blocks them.
   */
  // Pure body in `./editor/container-ops.ts`. Editor exposes a
  // small `ContainerOpsRef` bridge so the module can mutate scene
  // + push patches into the running gesture transaction.
  private applyContainerDrop(worldPoint: Vec2): void {
    applyContainerDropPure(this.containerOpsRef, worldPoint);
  }

  // Public-private hybrid — also called from AutoLayoutScheduler.
  private maybeGrowContainer(containerId: ElementId, childId: ElementId): void {
    maybeGrowContainerPure(this.containerOpsRef, containerId, childId);
  }

  // Pure body in `./editor/container-ops.ts`.
  private clampContainerToChildren(shape: Element, raw: Bounds, handle: HandleId): Bounds {
    return clampContainerToChildrenPure(this._scene, shape, raw, handle);
  }

  /**
   * Return the running gesture tx or open a new one if the drag ended
   * with an empty transaction (move-by-zero pixels can still carry
   * container reparent).
   */
  private beginOrAttachGesture(): TransactionHandle {
    if (!this.gestureTx) {
      this.gestureTx = this._history.transaction();
    }
    return this.gestureTx;
  }

  // Body moved to `./editor/gesture-tx.ts`.
  private cancelGesture(): void {
    this._resizeOriginElement = null;
    this.gestures.cancel();
  }

  /**
   * Drop ids from the selection that no longer exist in the scene. Needed
   * after undoing a CREATE — the shape goes away and the selection becomes
   * stale.
   */
  private pruneSelection(): void {
    let next: Set<ElementId> | null = null;
    for (const id of this._selection) {
      if (!this._scene.elements.has(id)) {
        next ??= new Set(this._selection);
        next.delete(id);
      }
    }
    if (next !== null) this._selection = next;
  }

  private notify(): void {
    this.scheduleRender();
    fanOutEvents(this.eventCache, this.events, this.observableSnapshot());
    for (const fn of this.listeners) fn();
    this.autoCompactScheduler.schedule();
    this.autoLayoutScheduler.schedule();
    // G1: a pan / zoom / scene edit may have scrolled an animated
    // shape into view — re-arm the (viewport-culled) animation tick.
    this.maybeAnimate();
  }

  /**
   * Pending `requestAnimationFrame` id for the next render, or null
   * when no render is scheduled. Used to coalesce bursts of `notify()`
   * calls (drag-pan, drag shape, multi-key, scripted batch mutations)
   * into a single render per frame — the previous synchronous render
   * inside notify() turned 240Hz pointer rate on modern trackpads
   * into 4×renders per browser frame, of which 3 were never composited.
   */
  private renderRafId: number | null = null;
  /** Unsubscribe for the animation-content-ready listener (decode → re-render). */
  private animationContentOff: (() => void) | null = null;

  /**
   * Schedule a render on the next animation frame. Idempotent —
   * multiple calls within the same frame collapse to one render.
   *
   * Falls back to a synchronous render when `requestAnimationFrame`
   * is unavailable (Node without jsdom, SSR). Browser / test environments
   * with rAF get the coalesced path.
   *
   * Use {@link forceRender} when you need the render to happen
   * immediately (PNG export, screenshot, visual-regression tests that
   * compare bitmap output after a mutation).
   */
  private scheduleRender(): void {
    if (this.renderRafId !== null) return;
    if (typeof requestAnimationFrame === "undefined") {
      // SSR / Node fallback. Keep behaviour synchronous so headless
      // renderers and tests that don't poll rAFs still see the
      // updated frame.
      this.render();
      return;
    }
    this.renderRafId = requestAnimationFrame(() => {
      this.renderRafId = null;
      this.render();
    });
  }

  /**
   * Synchronously render the current state. Cancels any pending
   * rAF-scheduled render so the next browser frame doesn't paint
   * a stale state on top.
   *
   * Hosts only need this when they read back the rendered bitmap
   * immediately after a mutation — `editor.toPng()`, custom
   * `canvas.toDataURL()` flows, visual-regression test asserts.
   * Normal interactive flows should let `scheduleRender` do its job.
   */
  forceRender(): void {
    if (this.renderRafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    this.render();
  }

  /**
   * Typed event surface — subscribe to a specific slice (`mode`,
   * `selection`, `scene`, `history`, `viewport`) or the umbrella
   * `change`. Replaces ad-hoc selectors over the coarse `subscribe()`
   * for callers that only care about one dimension. The legacy
   * `subscribe()` still works and fires in lock-step.
   */
  on<K extends keyof EditorEvents>(
    event: K,
    fn: EditorEvents[K],
  ): () => void {
    // Cast through `never`: TS can't prove that EditorEvents[K]
    // satisfies the emitter's `extends AnyListener ? T : never`
    // conditional through a generic body. Every entry of
    // EditorEvents is a function by construction so this is safe.
    return this.events.on(event, fn as never);
  }

  off<K extends keyof EditorEvents>(
    event: K,
    fn: EditorEvents[K],
  ): void {
    this.events.off(event, fn as never);
  }

  /**
   * Public command — re-run the auto-layout spec on the given
   * container shape, regardless of whether the children set actually
   * changed. Useful as an "auto-arrange" toolbar action or for hosts
   * adopting auto-layout after creating shapes programmatically.
   * Returns the patch that was applied, or `null` when nothing
   * changed (no spec, no children, or children already in position).
   * Single undo step.
   */
  runLayout(parentId: ElementId): Patch | null {
    const patch = runAutoLayout(this._scene, parentId);
    if (!patch) return null;
    this._scene = apply(this._scene, patch);
    this._history.push(patch);
    // Refresh the recorded signature so the post-notify auto-check
    // doesn't fire a second redundant run.
    this.autoLayoutScheduler.resetSignature(parentId);
    this.notify();
    return patch;
  }

  /**
   * Per-link signature of the inputs that determine an elbow route
   * (endpoint refs + bound-shape bounds + fixedSegments). When unchanged
   * between frames the A* route is reused — see `rerouteElbows`.
   */
  private readonly elbowRouteSig = new Map<LinkId, string>();

  private elbowSignature(edge: Link): string {
    const part = (ep: LinkEndpoint): string => {
      if (ep.kind === "point") return `p:${ep.position.x},${ep.position.y}`;
      const s = getElement(this._scene, ep.elementId);
      const b = s ? getElementWorldBounds(s) : null;
      const ref =
        ep.kind === "anchor"
          ? JSON.stringify(ep.anchor)
          : ep.kind === "outline"
            ? `o:${ep.ratio}`
            : "f";
      return `${ep.kind}:${ep.elementId}:${ref}:${b ? `${b.x},${b.y},${b.width},${b.height}` : "x"}`;
    };
    return `${part(edge.from)}|${part(edge.to)}`;
  }

  /**
   * Choke-point reroute (standard model): recompute `routedPoints` for
   * every orthogonal link whose inputs changed since the last pass, and
   * bake the result into `_scene`. Runs once per frame before paint —
   * derived state, so no history push / notify (would loop). Cheap when
   * nothing moved (signature short-circuit).
   */
  private rerouteElbows(): void {
    let next = this._scene;
    for (const [id, edge] of this._scene.links) {
      if ((edge.routing ?? "straight") !== "orthogonal") continue;
      const sig = this.elbowSignature(edge);
      if (this.elbowRouteSig.get(id) === sig) continue;
      this.elbowRouteSig.set(id, sig);
      const routedPoints = routeElbowLink(next, edge);
      next = updateLink(next, id, (e) => ({ ...e, routedPoints })).scene;
    }
    this._scene = next;
  }

  // Pure body in `./editor/render-orchestrator.ts` (~130 lines).
  private render(): void {
    this.rerouteElbows();
    // Feed the renderer's animation clock our per-shape playback state
    // so paused / reduced-motion GIFs freeze and resumed ones continue
    // from the right frame. Set immediately before the synchronous
    // render pass (the shape-renderer has no options channel).
    setAnimationClock((shape: { readonly id?: unknown }) => this.playbackClock(shape.id as ElementId));
    renderEditor(this);
    // Present AFTER the paint, on the same tick — deferred-submission
    // surfaces (WebGL2 / OffscreenCanvas) would otherwise lag one frame.
    this.onAfterRender?.();
  }
}

const distanceTo = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

// `coverageRatio` moved to `./editor/container-ops.ts`.

// `hasWidthHeight` moved to `./editor/shape-traits.ts` for shared
// use by container-ops and the future applies/resize module.

/**
 * Convert `PointerEvent.pressure` (0–1) to a brush half-width in local
 * pixels. Devices without pressure (most mice on Chromium) report 0.5 by
 * spec; zero pressure (some Windows touch) falls back to a sensible
 * minimum so a stroke is still visible.
 */
const pressureToWidth = (pressure: number): number => {
  if (pressure <= 0) return DEFAULT_BRUSH_WIDTH;
  return Math.max(0.5, pressure * MAX_BRUSH_WIDTH);
};

/**
 * Type guard — `true` when the value already implements the
 * `HistoryProvider` surface. Used to decide between "host supplied
 * an existing backend (use it as-is)" and "host supplied options
 * (build a default `History`)". Checks the methods that every
 * provider must expose; missing methods → treat as options.
 */
const isHistoryProvider = (
  value: HistoryProvider | HistoryOptions | undefined,
): value is HistoryProvider => {
  if (!value || typeof value !== "object") return false;
  return (
    typeof (value as HistoryProvider).push === "function" &&
    typeof (value as HistoryProvider).undo === "function" &&
    typeof (value as HistoryProvider).redo === "function" &&
    typeof (value as HistoryProvider).transaction === "function"
  );
};

const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// `describeNudge` moved to `./editor/public/selection-ops.ts`.

/**
 * Convert a snap candidate into an `LinkEndpoint`. Anchor snap → named
 * anchor ref; outline snap → outline ref with the sampled ratio. Falls
 * back to a free point if the metadata isn't recognised.
 */
/** Distance from point `p` to the finite segment `a`–`b` (world space). */
function distanceToSegmentPt(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

const endpointFromSnap = (
  elementId: ElementId,
  candidate: SnapCandidate,
  shape: Element,
): LinkEndpoint => {
  if (candidate.kind === "anchor") {
    const ref = candidate.metadata?.ref as AnchorRef | undefined;
    if (ref) return { kind: "anchor", elementId, anchor: ref };
  }
  if (candidate.kind === "outline" && typeof candidate.metadata?.ratio === "number") {
    return { kind: "outline", elementId, ratio: candidate.metadata.ratio };
  }
  // Defensive fallback — should not happen with built-in contributors.
  void shape;
  return { kind: "point", position: candidate.snapped };
};

// `resizeFromHandle`, `applyResizeConstraints`, the four handle-
// quadrant predicates moved to `./editor/resize-helpers.ts` so
// they're shared between applies/resize and the container clamp.
