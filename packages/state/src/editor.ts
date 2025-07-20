import { createActor, type Actor } from "xstate";
import { createEmitter, type Emitter } from "@oh-just-another/events";
import type { Bounds, FileId, ShapeId, Vec2 } from "@oh-just-another/types";
import { fileId as castFileId, shapeId as castShapeId } from "@oh-just-another/types";
import {
  addAnnotation,
  addEdge,
  addLayer,
  addShape,
  anchorSnapper,
  apply,
  buildSpatialIndex,
  gridLayout,
  isShapeHidden,
  isShapeLocked,
  runAutoLayout,
  stackLayout,
  DEFAULT_LAYER_ID,
  findEdgeAt,
  findNearestAnchor,
  getAnchorWorld,
  getAnnotationWorldPosition,
  getEdge,
  getEdgePath,
  getShape,
  getShapeAccessibleName,
  getShapeAt,
  getShapeAtIndexed,
  getShapesCoveredByBounds,
  getShapesInBounds,
  isContainer,
  getContainerSpec,
  getDropZoneWorld,
  findContainerAt,
  expandDropZoneToFit,
  containerSizeForZone,
  getShapeWorldBounds,
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
  removeEdge,
  removeLayer,
  removeShape,
  SnapEngine,
  SpatialGrid,
  type BrushPoint,
  updateAnnotation,
  updateEdge,
  updateLayer,
  updateShape,
  type Annotation,
  type Comment,
  type Edge,
  type EdgeEndpoint,
  type Layer,
  type Patch,
  type Scene,
  type Shape,
  type SnapCandidate,
  type Style,
  createBinaryFile,
} from "@oh-just-another/scene";
import {
  annotationId as castAnnotationId,
  commentId as castCommentId,
  edgeId as castEdgeId,
  layerId as castLayerId,
  type AnnotationId,
  type CommentId,
  type EdgeId,
  type LayerId,
} from "@oh-just-another/types";
import { bounds as B, matrix } from "@oh-just-another/math";
import {
  computeEdgeWorldBounds,
  DEFAULT_LOD,
  renderEdges,
  renderGrid,
  renderScene,
  setActiveRasterizer,
  setActiveTextShaper,
  ShapeCache,
  type RenderTarget,
} from "@oh-just-another/renderer-core";
import {
  History,
  type HistoryOptions,
  type HistoryProvider,
  type TransactionHandle,
} from "@oh-just-another/history";
import { fromPointerEvent } from "./dom-events.js";
import {
  FileDropRegistry,
  type FileDropContext,
  type FileDropHandler,
} from "./file-drop.js";
import { imageFileDropHandler, videoFileDropHandler } from "./built-in-handlers.js";
import { AnimationTick } from "./animation-tick.js";
import {
  computeDimShapes as computeDimShapesHelper,
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
  copyShapes as copyShapesHelper,
  pasteShapes as pasteShapesHelper,
} from "./clipboard.js";
import { AutoCompactScheduler } from "./auto-compact.js";
import { AutoLayoutScheduler } from "./auto-layout-scheduler.js";
import {
  ANNOTATION_PIN_HIT_SLOP,
  DEFAULT_BRUSH_WIDTH,
  DEFAULT_SNAP_THRESHOLD,
  EDGE_ENDPOINT_HANDLE_RADIUS,
  CONTAINER_KEEP_THRESHOLD,
  EDGE_HIT_THRESHOLD,
  LARGE_SCENE_HIT_THRESHOLD,
  LASSO_COVERAGE_THRESHOLD,
  MAX_BRUSH_WIDTH,
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_MAX_MOVEMENT_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  PINCH_MIN_MOVEMENT_PX,
  TOUCH_EDGE_HANDLE_HIT_SLOP,
  TOUCH_EDGE_HIT_THRESHOLD,
  TOUCH_HANDLE_HIT_SLOP,
  VIEWPORT_CULL_PADDING_RATIO,
  DOUBLE_CLICK_MS,
  DOUBLE_CLICK_TOLERANCE_PX,
  ISOLATION_DIM_OPACITY,
  WHEEL_PAN_FACTOR,
  WHEEL_ZOOM_MAX_STEP,
  WHEEL_ZOOM_SPEED,
  WHEEL_ZOOM_STEP,
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
  computeShapeResize,
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
import {
  canBeginTextEdit,
  computeCommitTextEdit,
} from "./editor/public/text-edit.js";
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
  newGroupShapeId,
  pickFocusCycle,
  selectionRoots,
} from "./editor/public/arrange-group.js";
import {
  buildImageShape,
  computeAddBinaryFile,
  hasAnimatedShape,
} from "./editor/public/image-insert.js";
import {
  computeDeleteSelection,
  computeDuplicateSelection,
  computeMoveSelectionBy,
  computeSelectAll,
  computeSetSelection,
  computeUpdateStyle,
  describeNudge as describeNudgePure,
  selectionFromNewIds,
} from "./editor/public/selection-ops.js";
import {
  beginPlacementState,
  buildShapeAtCursor,
  computePlacementCancel,
  computePlacementContainerDrop,
  computePlacementUpdate,
  newShapeIdAtCursor,
  type PlacementState,
} from "./editor/public/placement.js";
import { renderEditor } from "./editor/render-orchestrator.js";
import {
  combinedSelectionBounds as combinedSelectionBoundsPure,
  computeViewportWorld as computeViewportWorldPure,
  groupChildrenUnion as groupChildrenUnionPure,
} from "./editor/viewport-helpers.js";
import { computeHiddenShapes as computeHiddenShapesPure } from "./editor/shape-filters.js";
import {
  selectByBounds as selectByBoundsPure,
  selectByBoundsLive as selectByBoundsLivePure,
} from "./editor/applies/selection.js";
import {
  computeEdgeEndpointUpdate,
  computeEdgePreviewEndpoints,
} from "./editor/applies/edge.js";
import {
  computeAnnotationMovePatch,
  computeGroupMovePatches,
  computeShapeMovePatch,
} from "./editor/applies/move.js";
import {
  computeCreateEdge,
  computeCreateShape,
  newEdgeId,
  newShapeId,
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
   * Optional rasterizer. When supplied, hosts of `renderEdges` /
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
    readonly changedShapes: ReadonlyMap<ShapeId, { before: Bounds | null; after: Bounds | null }>;
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
  | { readonly kind: "grouped"; readonly groupId: ShapeId };

export class Editor {
  private readonly host: HTMLElement;
  private readonly mainTarget: RenderTarget;
  private readonly overlayTarget: RenderTarget;
  private readonly backgroundTarget: RenderTarget | null;
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
   * Shape being hovered while draw-edge mode is active. Drives the port-
   * overlay render so the user sees attachment points. `null` outside
   * draw-edge mode or when the pointer is over empty canvas.
   */
  private hoveredEdgeTarget: { shapeId: ShapeId; activeAnchor: string | null } | null = null;
  /**
   * Currently selected edge.
   */
  private _selectedEdge: EdgeId | null = null;
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
  private edgeEndpointDrag: {
    edgeId: EdgeId;
    side: "from" | "to";
    toPoint: Vec2;
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
  private groupMoveOrigin: ReadonlyMap<ShapeId, Vec2> | null = null;
  /**
   * Per-shape snapshot for a group-resize gesture — `bounds` is the
   * shape's world AABB at press-down. Editor scales the relative
   * position / size against the combined bounds delta each frame.
   */
  private groupResizeOrigin: {
    readonly combined: Bounds;
    readonly shapes: ReadonlyMap<
      ShapeId,
      { readonly position: Vec2; readonly bounds: Bounds; readonly scale: Vec2 }
    >;
  } | null = null;
  /**
   * Active layer — new shapes created via `addShape` / `applyCreate` land
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
  private readonly boundsCache: ShapeCache<Bounds> = new ShapeCache<Bounds>();

  /**
   * Lazy SpatialGrid for hit-test acceleration in large scenes.
   * Built on demand when `scene.shapes.size >= LARGE_SCENE_HIT_THRESHOLD`
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
  private _enteredGroup: ShapeId | null = null;

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
  private lastRenderedEnteredGroup: ShapeId | null = null;

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
      this.render();
      for (const fn of this.listeners) fn();
    },
  });

  /**
   * Shape id that the user started dragging on press-down. Tracked
   * separately from the state machine so the editor knows what to
   * (re)parent / drop into a container on pointerup. `null` between
   * gestures, set in onDown when press lands on a shape and cleared
   * in onUp / cancel.
   */
  private dragShapeId: ShapeId | null = null;

  /**
   * Live container highlight: the container shape the dragged item is
   * currently hovering over. Drawn by the overlay as a dashed
   * accent rect on the container's drop-zone so the user knows where
   * the shape will land after release.
   */
  private containerHover: { id: ShapeId; dropZone: Bounds } | null = null;

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
  private tileDirtyShapes: Map<
    ShapeId,
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
    this._scene = options.initialScene;
    this._history = isHistoryProvider(options.history)
      ? options.history
      : new History(options.history ?? {});
    // Build the gesture controller against a narrow getter/setter
    // bridge to the editor's mutable state. The bridge is a thin
    // adapter — keeps `gestureTx`/`dragShapeId` etc. as `private`
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
      get dragShapeId() {
        return self.dragShapeId;
      },
      set dragShapeId(v) {
        self.dragShapeId = v;
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
      this.inputMode === "touch" ? TOUCH_EDGE_HANDLE_HIT_SLOP : EDGE_ENDPOINT_HANDLE_RADIUS;
    this.edgeHitThreshold =
      this.inputMode === "touch" ? TOUCH_EDGE_HIT_THRESHOLD : EDGE_HIT_THRESHOLD;

    this.actor = createActor(interactionMachine);
    this.actor.subscribe({
      next: () => {
        // Render on any state change so drawing rubber-band updates.
        this.render();
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
      get dragShapeId() {
        return self2.dragShapeId;
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
    this.render();
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
    shapeId?: ShapeId | null;
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
    this.render();
  }

  /**
   * Replace the remote peer selections painted by the overlay. The
   * host resolves a peer's `selection: ShapeId[]` into world bounds
   * before passing them in.
   */
  setPeerSelections(selections: readonly PeerSelection[]): void {
    this._peerSelections = selections;
    this.render();
  }

  /** Whether the active draw-mode sticks after a create (toolbar lock). */
  get toolLocked(): boolean {
    return this._toolLocked;
  }

  /** Currently-selected edge id, if any. Null when no edge is selected. */
  get selectedEdge(): EdgeId | null {
    return this._selectedEdge;
  }

  /**
   * Apply an in-place mutation to the currently-selected edge as a
   * single history step. The `updater` receives a clone of the edge
   * and returns the next version (callers should produce a new
   * object — Edge is readonly). No-op when no edge is selected.
   */
  updateSelectedEdge(updater: (edge: Edge) => Edge): void {
    const id = this._selectedEdge;
    if (id === null) return;
    const r = updateEdge(this._scene, id, updater);
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
    // Cancel any in-progress drag gesture so the partial state is not recorded.
    if (this.gestureTx) {
      this.gestureTx.cancel();
      this.gestureTx = null;
    }
    // Hide the port overlay when leaving draw-edge.
    if (mode !== "draw-edge" && this.hoveredEdgeTarget !== null) {
      this.hoveredEdgeTarget = null;
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
  addShape(shape: Shape, options?: { select?: boolean }): Patch {
    const result = addShape(this._scene, shape);
    this._scene = result.scene;
    if (options?.select ?? true) {
      this._selection = Selection.single(shape.id);
    }
    this._history.push(result.patch);
    this.notify();
    return result.patch;
  }

  /**
   * Insert an image at the given world position. Wraps `addShape`
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
  }): ShapeId {
    const id = castShapeId(this.uniqueId("img"));
    const shape = buildImageShape(this._scene, input, id, this._activeLayerId);
    this.addShape(shape);
    if (input.animated) this.animationTick.start();
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
  private readonly animationTick = new AnimationTick({
    isAnimated: () => this.hasAnimatedShape(),
    onTick: () => {
      // Force a full re-render: the scene reference hasn't changed,
      // but the browser's native GIF animation has advanced inside
      // the `<img>` element. Re-painting picks up the current frame.
      this.lastRenderedScene = null;
      this.render();
    },
  });

  // Pure body in `./editor/public/image-insert.ts`.
  private hasAnimatedShape(): boolean {
    return hasAnimatedShape(this._scene);
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
  beginPlacement(shape: Shape): {
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
        tx.add({ kind: "shape", id: shape.id, before: null, after: state.current });
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
    const result = computeDeleteSelection(this._scene, this._selection, this._selectedEdge);
    if (!result) return;
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    this._selection = Selection.EMPTY;
    this._selectedEdge = null;
    this.notify();
  }

  // --- Inline text editing ---

  /**
   * Currently edited text shape (or null). Set by `beginTextEdit`;
   * cleared by `commitTextEdit` / `cancelTextEdit`. The host overlay
   * (`<TextEditorOverlay>` in `@react-ui`) subscribes via `editor`
   * and renders a `<textarea>` positioned over the shape.
   */
  private _editingTextShape: ShapeId | null = null;
  get editingTextShape(): ShapeId | null {
    return this._editingTextShape;
  }

  /**
   * Begin editing a text shape's body. No-op when the shape doesn't
   * exist or isn't a text shape. Concurrent edits cancel themselves
   * (only one shape at a time).
   */
  // Pure bodies in `./editor/public/text-edit.ts`.
  beginTextEdit(id: ShapeId): void {
    if (!canBeginTextEdit(this._scene, id, (lid) => this.isLayerLocked(lid))) return;
    this._editingTextShape = id;
    this.notify();
  }
  commitTextEdit(next: string): void {
    const id = this._editingTextShape;
    if (!id) return;
    const result = computeCommitTextEdit(this._scene, id, next);
    if (!result) {
      this._editingTextShape = null;
      this.notify();
      return;
    }
    this._scene = result.scene;
    this._history.push(result.patch);
    this._editingTextShape = null;
    this.notify();
  }
  cancelTextEdit(): void {
    if (this._editingTextShape === null) return;
    this._editingTextShape = null;
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
  createShapeAtCursor(): ShapeId | null {
    const vp = this._scene.viewport;
    const world = this.screenToWorld({
      x: (vp.size.width || 200) / 2,
      y: (vp.size.height || 200) / 2,
    });
    const id = newShapeIdAtCursor(++this.nextId);
    const shape = buildShapeAtCursor(this._scene, this.mode, world, this._activeLayerId, id);
    const r = addShape(this._scene, shape);
    this._scene = r.scene;
    this._history.push(r.patch);
    this._selection = Selection.single(id);
    this.notify();
    this.announce(`Created ${shape.type} ${id}`);
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
  commitBrushStroke(): ShapeId | null {
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
    return result.shapeId;
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
      newGroupShapeId(++this.nextId),
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
  private selectionRoots(): readonly Shape[] {
    return selectionRoots(this._scene, this._selection);
  }
  private expandSelectionWithDescendants(): ReadonlySet<ShapeId> {
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
    // Esc exits group-isolation if active. The selection that was
    // active inside the group is dropped (Esc reads as a full
    // "back out" — selecting the group is a separate gesture).
    if (this._enteredGroup !== null) {
      this._enteredGroup = null;
    }
    this._selection = Selection.EMPTY;
    this._selectedEdge = null;
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
  setSelection(ids: Iterable<ShapeId>): void {
    const next = computeSetSelection(this._scene, ids, this._selection);
    if (!next) return;
    this._selection = next;
    if (this._selectedEdge !== null) this._selectedEdge = null;
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
  private clipboard: Shape[] = [];

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
    // pasteShapes would throw. Reasonable behaviour for a user
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
  updateStyle(ids: Iterable<ShapeId>, partial: Partial<Style>): void {
    const result = computeUpdateStyle(this._scene, ids, partial);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  // Pure bodies in `./editor/public/z-order.ts`.
  bringToFront(id?: ShapeId): void {
    const result = computeBringToFront(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }
  sendToBack(id?: ShapeId): void {
    const result = computeSendToBack(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /** Move the target shape one step toward the top of its layer. */
  bringForward(id?: ShapeId): void {
    const result = computeBringForward(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /** Move the target shape one step toward the bottom of its layer. */
  sendBackward(id?: ShapeId): void {
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
    if (this._scene.shapes.size === 0 && this._scene.edges.size === 0) return;
    this._scene = {
      ...this._scene,
      shapes: new Map(),
      edges: new Map(),
    };
    this._selection = Selection.EMPTY;
    this._selectedEdge = null;
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
    this.notify();
    // Loaded scene may carry animated shapes (e.g. GIF re-imported
    // from saved JSON). Re-arm the tick — the runtime <img>
    // element won't survive serialisation, but `metadata.animated`
    // does, so hosts that want animation back will need to re-supply
    // the image element (or just have the renderer re-decode `src`).
    if (this.hasAnimatedShape()) this.animationTick.start();
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
  // helpers (acceleratedShapeAt, isShapeInteractable, …).
  private hitTest(worldPoint: Vec2): PressTarget {
    return pickPressTarget(worldPoint, {
      scene: this._scene,
      selection: this._selection,
      selectedEdge: this._selectedEdge,
      enteredGroup: this._enteredGroup,
      handleHitSlop: this.handleHitSlop,
      edgeHandleHitSlop: this.edgeHandleHitSlop,
      edgeHitThreshold: this.edgeHitThreshold,
      hitAnnotation: (p) => this.hitAnnotation(p),
      selectionIsAspectLocked: () => this.selectionIsAspectLocked(),
      combinedSelectionBounds: () => this.combinedSelectionBounds(),
      acceleratedShapeAt: (p) => this.acceleratedShapeAt(p),
      isShapeInteractable: (s) => this.isShapeInteractable(s),
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
  private isShapeInteractable(shape: Shape): boolean {
    if (this.isLayerLocked(shape.layerId)) return false;
    if (isShapeLocked(this._scene, shape)) return false;
    if (isShapeHidden(this._scene, shape)) return false;
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
  private promoteToGroupRoot(shape: Shape): Shape {
    return promoteToGroupRootHelper(this._scene, shape, this._enteredGroup);
  }

  /**
   * Topmost group ancestor of `shape` (walks parentId chain, returns
   * the highest `type === "group"` parent). `null` if `shape` has no
   * group ancestor. Used by drill-down: a double-click on a shape
   * with a group ancestor enters that group. Body extracted to
   * `./group-helpers.ts`.
   */
  private topGroupAncestor(shape: Shape): Shape | null {
    return topGroupAncestorHelper(this._scene, shape);
  }

  /**
   * True when `shapeId`'s parent chain contains `groupId`. Used by the
   * isolation exit path: a click on a shape whose parent chain *does
   * not* lead through the entered group is a click "outside" the
   * group, which exits isolation.
   */
  private isDescendantOfGroup(shapeId: ShapeId, groupId: ShapeId): boolean {
    return isDescendantOfGroupHelper(this._scene, shapeId, groupId);
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
  private computeHiddenShapes(): ReadonlySet<ShapeId> | undefined {
    return computeHiddenShapesPure(this._scene);
  }

  private computeDimShapes(enteredGroupId: ShapeId): ReadonlySet<ShapeId> {
    return computeDimShapesHelper(this._scene, this._selection, enteredGroupId);
  }

  /**
   * Enter a group — subsequent hits inside this group return children
   * directly instead of the group root. `null` exits group-edit mode.
   * Bound to double-click on a group in the default handler.
   */
  enterGroup(groupId: ShapeId | null): void {
    this._enteredGroup = groupId;
    this.notify();
  }

  /** Currently "entered" group, if any. */
  get enteredGroup(): ShapeId | null {
    return this._enteredGroup;
  }

  /**
   * SpatialGrid-accelerated topmost-shape lookup. Linear scan for small
   * scenes; for larger scenes builds a grid lazily, keyed by current 
   * scene-identity. Scene operations replace `_scene` (immutable patches), 
   * so reference-equality is a sufficient invalidation signal.
   */
  private acceleratedShapeAt(worldPoint: Vec2): Shape | undefined {
    if (this._scene.shapes.size < LARGE_SCENE_HIT_THRESHOLD) {
      return getShapeAt(this._scene, worldPoint);
    }
    return getShapeAtIndexed(this._scene, this.ensureSpatialIndex(), worldPoint);
  }

  /**
   * Build (or return the cached) `SpatialGrid` for the current scene.
   * Re-built only when `_scene` reference changes — scene operations
   * always produce a fresh object, so reference equality is a
   * sufficient invalidation signal.
   *
   * Shared between the hit-test path (`acceleratedShapeAt`) and the
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
    if (isDouble && (clickEffect.type === "SELECT_REPLACE" || clickEffect.type === "SELECT_TOGGLE")) {
      const raw = this.acceleratedShapeAt(worldPoint);
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
          if (this._selectedEdge !== null) this._selectedEdge = null;
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
  private pickDrillTarget(raw: Shape, top: Shape | null): Shape | null {
    return pickDrillTargetHelper(this._scene, raw, top, this._enteredGroup);
  }

  private applyEmit(emit: InteractionEmit): void {
    switch (emit.type) {
      case "SELECT_REPLACE":
        this._selection = Selection.single(emit.id);
        if (this._selectedEdge !== null) this._selectedEdge = null;
        this.notify();
        return;
      case "SELECT_TOGGLE":
        this._selection = Selection.toggle(this._selection, emit.id);
        if (this._selectedEdge !== null) this._selectedEdge = null;
        this.notify();
        return;
      case "SELECT_CLEAR":
        this._selection = Selection.EMPTY;
        if (this._selectedEdge !== null) this._selectedEdge = null;
        this.notify();
        return;
      case "SELECT_EDGE_REPLACE":
        this._selectedEdge = emit.id;
        this._selection = Selection.EMPTY;
        this.notify();
        return;
      case "SELECT_EDGE_CLEAR":
        if (this._selectedEdge !== null) {
          this._selectedEdge = null;
          this.notify();
        }
        return;
      case "UPDATE_EDGE_ENDPOINT_PREVIEW":
        this.edgeEndpointDrag = {
          edgeId: emit.edgeId,
          side: emit.side,
          toPoint: emit.toPoint,
        };
        this.notify();
        return;
      case "UPDATE_EDGE_ENDPOINT":
        this.applyEdgeEndpointUpdate(emit);
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
        this.applyCreateEdge(emit);
        return;
      case "DRAW_EDGE_PREVIEW":
        this.applyEdgePreview(emit.fromShape, emit.fromPoint, emit.toPoint);
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
  private applyMove(id: ShapeId, delta: Vec2, originalBounds: Bounds): void {
    const patch = computeShapeMovePatch(this._scene, id, delta, originalBounds);
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
      this.dragShapeId !== null ||
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
    // Track shapes that changed (added / removed / mutated). Edges
    // attached to any of these have stale rendered paths even when
    // the edge object itself is reference-equal — the path resolves
    // through the shape's new position, but the old path stays on
    // screen as a "ghost" trail unless we explicitly invalidate it.
    const changedShapeIds = new Set<ShapeId>();
    for (const [id, shape] of next.shapes) {
      const old = prev.shapes.get(id);
      if (old === shape) continue;
      changedShapeIds.add(id);
      const afterBounds = getShapeWorldBounds(shape);
      const beforeBounds = old ? getShapeWorldBounds(old) : null;
      add(afterBounds);
      if (beforeBounds) add(beforeBounds);
      // Stash for the tile-cache path — covers add + move via
      // before/after pair; pure mutation re-uses the single
      // afterBounds rect.
      if (this.tileComposeFn !== null) {
        this.tileDirtyShapes.set(id, { before: beforeBounds, after: afterBounds });
      }
    }
    for (const [id, shape] of prev.shapes) {
      if (!next.shapes.has(id)) {
        changedShapeIds.add(id);
        const beforeBounds = getShapeWorldBounds(shape);
        add(beforeBounds);
        if (this.tileComposeFn !== null) {
          this.tileDirtyShapes.set(id, { before: beforeBounds, after: null });
        }
      }
    }
    const edgeTouchesChangedShape = (edge: Edge): boolean => {
      for (const ep of [edge.from, edge.to]) {
        if (ep.kind === "anchor" || ep.kind === "outline") {
          if (changedShapeIds.has(ep.shapeId)) return true;
        }
      }
      return false;
    };
    for (const [id, edge] of next.edges) {
      const old = prev.edges.get(id);
      // Refresh edge dirty-rect when: edge object changed, OR an
      // endpoint references a shape that moved this frame (path is
      // re-resolved every render but the old screen pixels persist).
      if (old === edge && !edgeTouchesChangedShape(edge)) continue;
      const b = computeEdgeWorldBounds(next, edge);
      if (b) add(b);
      const oldEdge = old ?? edge; // prev scene resolves with prev shapes for ghost-clear
      const ob = computeEdgeWorldBounds(prev, oldEdge);
      if (ob) add(ob);
    }
    for (const [id, edge] of prev.edges) {
      if (!next.edges.has(id)) {
        const b = computeEdgeWorldBounds(prev, edge);
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
    // in `getShapesInLayer`; the bug is missed shapes, not
    // wrong order.
    const visited = new Set<ShapeId>();
    let expanded: Bounds = acc;
    let grew = true;
    while (grew) {
      grew = false;
      for (const shape of next.shapes.values()) {
        if (visited.has(shape.id)) continue;
        const bb = getShapeWorldBounds(shape);
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
  private groupChildrenUnion(groupId: ShapeId): Bounds | null {
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
    if (this._selection.size !== 1) return false;
    const [only] = [...this._selection];
    if (!only) return false;
    return getShape(this._scene, only)?.type === "group";
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

  private applyResize(id: ShapeId, handle: HandleId, delta: Vec2, originalBounds: Bounds): void {
    const result = computeShapeResize(this._scene, id, handle, delta, originalBounds, (s, raw, h) =>
      this.clampContainerToChildren(s, raw, h),
    );
    if (!result) return;
    this._scene = result.scene;
    this.recordGesturePatch(result.patch);
    this.notify();
  }

  // Pure body in `./editor/applies/create.ts`.
  private applyCreate(kind: "rect" | "ellipse" | "frame", bounds: Bounds): void {
    const id = newShapeId(++this.nextId);
    const result = computeCreateShape(this._scene, kind, bounds, id, this._activeLayerId, () =>
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
  private assignFrameMembers(frameId: ShapeId, frameBounds: Bounds): void {
    this._scene = assignFrameMembersHelper(
      this._scene,
      this._history,
      frameId,
      frameBounds,
    );
  }

  // Pure body in `./editor/applies/create.ts`. Endpoint snapping
  // stays here because it needs the snap engine.
  private applyCreateEdge(emit: Extract<InteractionEmit, { type: "CREATE_EDGE" }>): void {
    const from = this.snapEdgeEndpoint(emit.fromShape, emit.fromPoint);
    const to = this.snapEdgeEndpoint(emit.toShape, emit.toPoint);
    const id = newEdgeId(++this.nextId);
    const result = computeCreateEdge(this._scene, from, to, id, this._activeLayerId);
    this._scene = result.scene;
    this._history.push(result.patch);
    this.edgePreview = null;
    this.maybeRevertModeAfterCreate();
    this.notify();
  }

  /**
   * Build an `EdgeEndpoint` for a draw-edge / re-bind gesture. Runs the
   * scene's snap engine for the probe point, prefers anchor snap when
   * close enough, falls back to outline snap (so the user can attach
   * "anywhere on the right edge"), then `point` for the free-floating
   * case.
   *
   * `pressTargetShape` is the shape the gesture originated from or
   * landed on (used as a strong hint — we don't snap onto unrelated
   * shapes when the user clearly aimed for this one).
   */
  private snapEdgeEndpoint(pressTargetShape: ShapeId | null, worldPoint: Vec2): EdgeEndpoint {
    if (!pressTargetShape) {
      return { kind: "point", position: worldPoint };
    }
    const shape = getShape(this._scene, pressTargetShape);
    if (!shape) return { kind: "point", position: worldPoint };

    const result = this.snapEngine.snap({
      scene: this._scene,
      probe: worldPoint,
      threshold: this.snapThreshold,
      gesture: "draw-edge",
    });

    // Prefer a snap candidate that belongs to the press-target shape —
    // avoids attaching to a neighbouring shape that happens to be even
    // closer to the release point.
    const onTarget = result.all.filter((c) => c.metadata?.shapeId === pressTargetShape);
    const winner =
      onTarget.find((c) => c.kind === "anchor") ??
      onTarget.find((c) => c.kind === "outline") ??
      null;
    if (winner) return endpointFromSnap(pressTargetShape, winner, shape);

    // No snap fired (release outside threshold of any port / outline) —
    // fall back to nearest anchor on the target shape so the edge still
    // sticks to it.
    const { ref } = findNearestAnchor(shape, worldPoint, snapExcludedAnchors(shape));
    return { kind: "anchor", shapeId: pressTargetShape, anchor: ref };
  }

  // Pure body in `./editor/applies/selection.ts`. The wrappers
  // here own the side effects (`_selectedEdge` clearing, notify).
  private applySelectByBounds(bounds: Bounds, mode: "replace" | "add"): void {
    const next = selectByBoundsPure(
      this._scene,
      this._selection,
      (id) => this.isLayerLocked(id),
      bounds,
      mode,
    );
    if (this._selectedEdge !== null) this._selectedEdge = null;
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
    if (this._selectedEdge !== null) this._selectedEdge = null;
    this._selection = next;
  }

  // Pure body in `./editor/applies/edge.ts`. The wrapper here
  // owns the side effects (history push, drag-state clearing,
  // notify).
  private applyEdgeEndpointUpdate(
    emit: Extract<InteractionEmit, { type: "UPDATE_EDGE_ENDPOINT" }>,
  ): void {
    const result = computeEdgeEndpointUpdate(this._scene, emit, (toShape, toPoint) =>
      this.snapEdgeEndpoint(toShape, toPoint),
    );
    if (result === null) {
      this.edgeEndpointDrag = null;
      this.notify();
      return;
    }
    this._scene = result.scene;
    this._history.push(result.patch);
    this.edgeEndpointDrag = null;
    this.notify();
  }

  private updateHoveredEdgeTarget(worldPoint: Vec2): void {
    const shape = this.acceleratedShapeAt(worldPoint);
    if (!shape) {
      if (this.hoveredEdgeTarget !== null) {
        this.hoveredEdgeTarget = null;
        this.notify();
      }
      return;
    }
    const nearest = findNearestAnchor(shape, worldPoint, snapExcludedAnchors(shape));
    const activeName = nearest.ref.kind === "named" ? nearest.ref.name : null;
    const prev = this.hoveredEdgeTarget;
    if (prev?.shapeId === shape.id && prev.activeAnchor === activeName) return;
    this.hoveredEdgeTarget = { shapeId: shape.id, activeAnchor: activeName };
    this.notify();
  }

  // Pure body in `./editor/applies/edge.ts`.
  private applyEdgePreview(fromShape: ShapeId | null, fromPoint: Vec2, toPoint: Vec2): void {
    this.edgePreview = computeEdgePreviewEndpoints(this._scene, fromShape, fromPoint, toPoint);
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
  private maybeGrowContainer(containerId: ShapeId, childId: ShapeId): void {
    maybeGrowContainerPure(this.containerOpsRef, containerId, childId);
  }

  // Pure body in `./editor/container-ops.ts`.
  private clampContainerToChildren(shape: Shape, raw: Bounds, handle: HandleId): Bounds {
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
    this.gestures.cancel();
  }

  /**
   * Drop ids from the selection that no longer exist in the scene. Needed
   * after undoing a CREATE — the shape goes away and the selection becomes
   * stale.
   */
  private pruneSelection(): void {
    let next: Set<ShapeId> | null = null;
    for (const id of this._selection) {
      if (!this._scene.shapes.has(id)) {
        next ??= new Set(this._selection);
        next.delete(id);
      }
    }
    if (next !== null) this._selection = next;
  }

  private notify(): void {
    this.render();
    fanOutEvents(this.eventCache, this.events, this.observableSnapshot());
    for (const fn of this.listeners) fn();
    this.autoCompactScheduler.schedule();
    this.autoLayoutScheduler.schedule();
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
  runLayout(parentId: ShapeId): Patch | null {
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

  // Pure body in `./editor/render-orchestrator.ts` (~130 lines).
  private render(): void {
    renderEditor(this);
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
 * Convert a snap candidate into an `EdgeEndpoint`. Anchor snap → named
 * anchor ref; outline snap → outline ref with the sampled ratio. Falls
 * back to a free point if the metadata isn't recognised.
 */
const endpointFromSnap = (
  shapeId: ShapeId,
  candidate: SnapCandidate,
  shape: Shape,
): EdgeEndpoint => {
  if (candidate.kind === "anchor") {
    const ref = candidate.metadata?.ref as AnchorRefLike | undefined;
    if (ref) return { kind: "anchor", shapeId, anchor: ref };
  }
  if (candidate.kind === "outline" && typeof candidate.metadata?.ratio === "number") {
    return { kind: "outline", shapeId, ratio: candidate.metadata.ratio };
  }
  // Defensive fallback — should not happen with built-in contributors.
  void shape;
  return { kind: "point", position: candidate.snapped };
};

type AnchorRefLike = Extract<EdgeEndpoint, { kind: "anchor" }>["anchor"];

// `resizeFromHandle`, `applyResizeConstraints`, the four handle-
// quadrant predicates moved to `./editor/resize-helpers.ts` so
// they're shared between applies/resize and the container clamp.
