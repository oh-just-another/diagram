import { createActor, type Actor } from "xstate";
import type { Bounds, ShapeId, Vec2 } from "@oh-just-another/types";
import { shapeId as castShapeId } from "@oh-just-another/types";
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
 WHEEL_ZOOM_SENSITIVITY,
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
  *  reports a coarse primary pointer, else `"mouse"`. Default.
  */
 readonly inputMode?: "mouse" | "touch" | "auto";

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
  *  import { renderViaTiles } from "@oh-just-another/renderer-canvas";
  *  new Editor({ ..., useTileCache: true, tileCompose: renderViaTiles });
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
 private brushStroke: { origin: Vec2; points: BrushPoint[] } | null = null;

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
 private pinchOrigin: {
  readonly midpointWorld: Vec2;
  readonly distance: number;
  readonly midpointScreen: Vec2;
 } | null = null;

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
 private longPressTimer: ReturnType<typeof setTimeout> | null = null;
 private longPressOrigin: Vec2 | null = null;
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

 constructor(options: EditorOptions) {
  this.host = options.host;
  this.mainTarget = options.mainTarget;
  this.overlayTarget = options.overlayTarget;
  this.backgroundTarget = options.backgroundTarget ?? null;
  this._scene = options.initialScene;
  this._history = isHistoryProvider(options.history)
   ? options.history
   : new History(options.history ?? {});
  this.tileComposeFn =
   options.useTileCache === true && options.tileCompose ? options.tileCompose : null;

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

  this.unbind = this.bindPointerEvents();
  this.render();
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

 /**
  * Create a new annotation thread at `position`. When `shapeId` is
  * passed, `position` is treated as an offset relative to that shape;
  * the pin will follow shape moves. `firstComment` seeds the thread —
  * pass an empty string to create an open pin without text.
  *
  * Returns the new annotation id; auto-selects it so the host UI
  * opens the thread for the user to type in.
  */
 addAnnotation(opts: {
  position: Vec2;
  shapeId?: ShapeId | null;
  firstComment?: string;
 }): AnnotationId {
  const now = new Date().toISOString();
  const newId = castAnnotationId(this.uniqueId("ann"));
  const thread: Comment[] = [];
  if (opts.firstComment?.trim()) {
   thread.push({
    id: castCommentId(this.uniqueId("cmt")),
    authorId: this.commentAuthor.id,
    authorName: this.commentAuthor.name,
    body: opts.firstComment.trim(),
    createdAt: now,
   });
  }
  const annotation: Annotation = {
   id: newId,
   shapeId: opts.shapeId ?? null,
   position: opts.position,
   resolved: false,
   thread,
   createdAt: now,
  };
  const result = addAnnotation(this._scene, annotation);
  this._scene = result.scene;
  this._history.push(result.patch);
  this._selectedAnnotation = newId;
  this.notify();
  this.announce("Annotation added");
  return newId;
 }

 /** Remove an annotation thread entirely. Single undo step. */
 removeAnnotation(id: AnnotationId): void {
  if (!this._scene.annotations.has(id)) return;
  const result = removeAnnotation(this._scene, id);
  this._scene = result.scene;
  this._history.push(result.patch);
  if (this._selectedAnnotation === id) this._selectedAnnotation = null;
  this.notify();
  this.announce("Annotation removed");
 }

 /** Toggle the `resolved` flag on an annotation. */
 toggleAnnotationResolved(id: AnnotationId): void {
  const before = this._scene.annotations.get(id);
  if (!before) return;
  const result = updateAnnotation(this._scene, id, (a) => ({ ...a, resolved: !a.resolved }));
  this._scene = result.scene;
  this._history.push(result.patch);
  this.notify();
  this.announce(before.resolved ? "Annotation reopened" : "Annotation resolved");
 }

 /**
  * Append a reply to an annotation thread. Body is trimmed; empty
  * input is a no-op. Author defaults to `commentAuthor`; pass an
  * explicit one when the caller knows better (e.g. host has full
  * user record beyond id+name).
  */
 addComment(
  annotationId: AnnotationId,
  body: string,
  author?: { id: string; name: string },
 ): void {
  const trimmed = body.trim();
  if (!trimmed) return;
  if (!this._scene.annotations.has(annotationId)) return;
  const u = author ?? this.commentAuthor;
  const comment: Comment = {
   id: castCommentId(this.uniqueId("cmt")),
   authorId: u.id,
   authorName: u.name,
   body: trimmed,
   createdAt: new Date().toISOString(),
  };
  const result = updateAnnotation(this._scene, annotationId, (a) => ({
   ...a,
   thread: [...a.thread, comment],
  }));
  this._scene = result.scene;
  this._history.push(result.patch);
  this.notify();
 }

 /** Remove a single comment from a thread. No-op if not found. */
 removeComment(annotationId: AnnotationId, commentId: CommentId): void {
  const before = this._scene.annotations.get(annotationId);
  if (!before?.thread.some((c) => c.id === commentId)) return;
  const result = updateAnnotation(this._scene, annotationId, (a) => ({
   ...a,
   thread: a.thread.filter((c) => c.id !== commentId),
  }));
  this._scene = result.scene;
  this._history.push(result.patch);
  this.notify();
 }

 /**
  * Hit-test an annotation pin in world coordinates. Returns the
  * topmost annotation whose pin contains the point (within
  * `ANNOTATION_PIN_HIT_SLOP` screen pixels, scaled by zoom).
  */
 hitAnnotation(worldPoint: Vec2): AnnotationId | null {
  const zoom = this._scene.viewport.zoom;
  const radius = ANNOTATION_PIN_HIT_SLOP / zoom;
  // Last-added wins (matches z-order intuition: pins on top respond
  // to clicks first).
  const list = [...this._scene.annotations.values()];
  for (let i = list.length - 1; i >= 0; i--) {
   const ann = list[i]!;
   const center = getAnnotationWorldPosition(this._scene, ann);
   const dx = worldPoint.x - center.x;
   const dy = worldPoint.y - center.y;
   if (dx * dx + dy * dy <= radius * radius) return ann.id;
  }
  return null;
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

 /**
  * Internal hook — called from `applyCreate` / `applyCreateEdge`
  * after a successful shape / edge instantiation. Reverts the
  * active mode to `select` unless `_toolLocked` is on. Centralises
  * the rule so any new create path picks it up by calling through.
  */
 private maybeRevertModeAfterCreate(): void {
  if (this._toolLocked) return;
  if (this.mode === "select" || this.mode === "hand") return;
  this.setMode("select");
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
 insertImage(input: {
  src: string;
  width: number;
  height: number;
  position: Vec2;
  /**
   * Pre-decoded `<img>` element. Stored in metadata.image so the
   * Canvas2D renderer can `drawImage(handle, …)` directly — the
   * raw `src` string isn't a CanvasImageSource. Optional; hosts
   * that pass only `src` should ensure their renderer accepts
   * URLs.
   */
  image?: HTMLImageElement;
  /**
   * Mark this image as animated (e.g. GIF). The editor starts a
   * requestAnimationFrame tick while any animated image is in the
   * scene, forcing a redraw each frame so the browser's native
   * GIF animation in the `<img>` element is picked up by
   * subsequent drawImage calls.
   */
  animated?: boolean;
 }): ShapeId {
  const id = castShapeId(this.uniqueId("img"));
  const layerId = this._activeLayerId;
  const order = orderForTop(
   Array.from(this._scene.shapes.values())
    .filter((s) => s.layerId === layerId)
    .map((s) => s.order),
  );
  const metadata: Record<string, unknown> = {};
  if (input.image) metadata.image = input.image;
  if (input.animated) metadata.animated = true;
  const shape: Shape = {
   id,
   layerId,
   type: "image",
   position: input.position,
   rotation: 0,
   scale: { x: 1, y: 1 },
   order,
   style: {},
   width: input.width,
   height: input.height,
   src: input.src,
   ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
  this.addShape(shape);
  if (input.animated) this.animationTick.start();
  return id;
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

 /** True while any shape in the scene carries `metadata.animated`. */
 private hasAnimatedShape(): boolean {
  for (const s of this._scene.shapes.values()) {
   if (s.metadata?.animated === true) return true;
  }
  return false;
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
 beginPlacement(shape: Shape): {
  update: (worldCenter: Vec2) => void;
  commit: () => void;
  cancel: () => void;
 } {
  const tx = this._history.transaction();
  const initialResult = addShape(this._scene, shape);
  this._scene = initialResult.scene;
  this._selection = Selection.single(shape.id);
  this.notify();
  let current = shape;
  const half = getShapeWorldBounds(shape);
  const offsetX = half.width / 2;
  const offsetY = half.height / 2;
  return {
   update: (worldCenter) => {
    const next = {
     ...current,
     position: { x: worldCenter.x - offsetX, y: worldCenter.y - offsetY },
    } as Shape;
    // Apply directly — we'll record a single add-patch on commit.
    const patch: Patch = { kind: "shape", id: shape.id, before: current, after: next };
    this._scene = apply(this._scene, patch);
    current = next;
    this.notify();
   },
   commit: () => {
    // Container drop: if the placed shape lands inside an auto-
    // layout / drop-zone container's zone, reparent it so the
    // container's auto-layout fires on the next microtask. Pure
    // pointer-drag uses applyContainerDrop for the same effect;
    // palette placement bypasses that path, so we hook the check
    // here directly on commit.
    const center = {
     x: current.position.x + (half.width / 2),
     y: current.position.y + (half.height / 2),
    };
    const container = findContainerAt(this._scene, center, new Set([current.id]));
    if (container) {
     const withParent = { ...current, parentId: container.id } as Shape;
     const reparentPatch: Patch = {
      kind: "shape",
      id: shape.id,
      before: current,
      after: withParent,
     };
     this._scene = apply(this._scene, reparentPatch);
     current = withParent;
    }
    tx.add({ kind: "shape", id: shape.id, before: null, after: current });
    tx.commit();
   },
   cancel: () => {
    const removeRes = removeShape(this._scene, shape.id);
    this._scene = removeRes.scene;
    tx.cancel();
    this._selection = Selection.EMPTY;
    this.notify();
   },
  };
 }

 /**
  * Delete every currently-selected shape (or the currently-selected
  * edge). No-op when nothing is selected. Single undo step regardless
  * of how many shapes were removed.
  */
 deleteSelected(): void {
  const targets = [...this._selection];
  const selectedEdge = this._selectedEdge;
  if (targets.length === 0 && !selectedEdge) return;

  const tx = this._history.transaction();
  for (const id of targets) {
   // Drop edges first — removing a shape that still has edges attached
   // would leave dangling endpoint references.
   for (const edge of [...this._scene.edges.values()]) {
    if (
     (edge.from.kind !== "point" && edge.from.shapeId === id) ||
     (edge.to.kind !== "point" && edge.to.shapeId === id)
    ) {
     const r = removeEdge(this._scene, edge.id);
     this._scene = r.scene;
     tx.add(r.patch);
    }
   }
   const r = removeShape(this._scene, id);
   this._scene = r.scene;
   tx.add(r.patch);
  }
  if (selectedEdge) {
   const r = removeEdge(this._scene, selectedEdge);
   this._scene = r.scene;
   tx.add(r.patch);
   this._selectedEdge = null;
  }
  tx.commit();
  this._selection = Selection.EMPTY;
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
 beginTextEdit(id: ShapeId): void {
  const shape = getShape(this._scene, id);
  if (shape?.type !== "text") return;
  if (this.isLayerLocked(shape.layerId)) return;
  this._editingTextShape = id;
  this.notify();
 }

 /** Replace the edited shape's text with `next`. Single undo step. */
 commitTextEdit(next: string): void {
  const id = this._editingTextShape;
  if (!id) return;
  const shape = getShape(this._scene, id);
  if (shape?.type !== "text" || (shape as { text?: string }).text === next) {
   this._editingTextShape = null;
   this.notify();
   return;
  }
  const r = updateShape(this._scene, id, (s) => ({ ...s, text: next }));
  this._scene = r.scene;
  this._history.push(r.patch);
  this._editingTextShape = null;
  this.notify();
 }

 /** Cancel without saving. */
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
 moveSelectionBy(delta: Vec2): void {
  if (this._selection.size === 0 || (delta.x === 0 && delta.y === 0)) return;
  const tx = this._history.transaction();
  let moved = 0;
  // Expand the selection set with every descendant so groups translate
  // as one unit. Dedup so a shape that is both selected and a descendant
  // of another selected shape only moves once.
  const targets = this.expandSelectionWithDescendants();
  for (const id of targets) {
   const shape = getShape(this._scene, id);
   if (!shape) continue;
   // Skip shapes on locked layers — nudge has no effect.
   if (this.isLayerLocked(shape.layerId)) continue;
   const r = updateShape(this._scene, id, (s) => ({
    ...s,
    position: { x: s.position.x + delta.x, y: s.position.y + delta.y },
   }));
   this._scene = r.scene;
   tx.add(r.patch);
   moved++;
  }
  if (moved === 0) {
   tx.cancel();
   return;
  }
  tx.commit();
  this.notify();
  this.announce(describeNudge(delta, moved));
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
 createShapeAtCursor(): ShapeId | null {
  const vp = this._scene.viewport;
  const cssCenter: Vec2 = {
   x: (vp.size.width || 200) / 2,
   y: (vp.size.height || 200) / 2,
  };
  const world = this.screenToWorld(cssCenter);
  const id = castShapeId(`shape-${++this.nextId}-${Date.now().toString(36)}`);
  const order = orderForTop(
   [...this._scene.shapes.values()]
    .filter((s) => s.layerId === this._activeLayerId)
    .map((s) => s.order),
  );
  const currentMode = this.mode;
  const type: Shape["type"] =
   currentMode === "draw-ellipse" ? "ellipse" : "rectangle";
  const width = 120;
  const height = 80;
  const shape: Shape = {
   id,
   layerId: this._activeLayerId,
   type,
   position: { x: world.x - width / 2, y: world.y - height / 2 },
   rotation: 0,
   scale: { x: 1, y: 1 },
   order,
   style: { fill: "#bbb", stroke: "#000", strokeWidth: 1 },
   width,
   height,
  } as Shape;
  const r = addShape(this._scene, shape);
  this._scene = r.scene;
  this._history.push(r.patch);
  this._selection = Selection.single(id);
  this.notify();
  this.announce(`Created ${type} ${id}`);
  return id;
 }

 beginBrushStroke(world: Vec2, pressure = 0.5): void {
  this.brushStroke = {
   points: [{ x: 0, y: 0, width: pressureToWidth(pressure) }],
   origin: world,
  };
  this.notify();
 }

 extendBrushStroke(world: Vec2, pressure = 0.5): void {
  if (!this.brushStroke) return;
  const o = this.brushStroke.origin;
  this.brushStroke.points.push({
   x: world.x - o.x,
   y: world.y - o.y,
   width: pressureToWidth(pressure),
  });
  this.notify();
 }

 commitBrushStroke(): ShapeId | null {
  if (!this.brushStroke || this.brushStroke.points.length === 0) {
   this.brushStroke = null;
   this.notify();
   return null;
  }
  const id = castShapeId(`brush-${++this.nextId}-${Date.now().toString(36)}`);
  const order = orderForTop(
   [...this._scene.shapes.values()]
    .filter((s) => s.layerId === this._activeLayerId)
    .map((s) => s.order),
  );
  const shape: Shape = {
   id,
   layerId: this._activeLayerId,
   type: "brush",
   position: this.brushStroke.origin,
   rotation: 0,
   scale: { x: 1, y: 1 },
   order,
   style: { fill: "#222" },
   points: this.brushStroke.points.slice(),
  } as Shape;
  const r = addShape(this._scene, shape);
  this._scene = r.scene;
  this._history.push(r.patch);
  this.brushStroke = null;
  this.notify();
  return id;
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

 /**
  * Re-position the current selection on a regular grid. `cols`
  * controls column count; `gap` the world-unit spacing between cells.
  * Anchored at the top-left corner of the existing selection bounds
  * so the result lands roughly where the user already had the shapes.
  * Single undo step. No-op when fewer than 2 shapes are selected.
  */
 arrangeAsGrid(opts: { cols?: number; gap?: number } = {}): void {
  const ids = [...this._selection];
  if (ids.length < 2) return;
  const origin = this.combinedSelectionBounds() ?? { x: 0, y: 0 };
  const cols = Math.max(1, opts.cols ?? Math.ceil(Math.sqrt(ids.length)));
  const gap = opts.gap ?? 16;
  const patch = gridLayout(this._scene, { shapeIds: ids, origin, cols, gap });
  if (!patch) return;
  this._scene = apply(this._scene, patch);
  this._history.push(patch);
  this.notify();
  this.announce(`Arranged ${ids.length} shapes on a ${cols}-column grid`);
 }

 /**
  * Stack the current selection horizontally or vertically with `gap`
  * world units between adjacent shapes. Anchored at the selection's
  * top-left, like `arrangeAsGrid`. Single undo step.
  */
 arrangeAsStack(opts: { direction?: "horizontal" | "vertical"; gap?: number } = {}): void {
  const ids = [...this._selection];
  if (ids.length < 2) return;
  const origin = this.combinedSelectionBounds() ?? { x: 0, y: 0 };
  const direction = opts.direction ?? "horizontal";
  const gap = opts.gap ?? 16;
  const patch = stackLayout(this._scene, {
   shapeIds: ids,
   origin,
   direction,
   gap,
  });
  if (!patch) return;
  this._scene = apply(this._scene, patch);
  this._history.push(patch);
  this.notify();
  this.announce(`Stacked ${ids.length} shapes ${direction}`);
 }

 /**
  * Wrap the currently selected shapes into a new group (zero-render
  * container). The first selected shape's layer becomes the group's
  * layer; existing `parentId` links are preserved (the new group
  * becomes the parent of the *topmost* ancestors among selected, not
  * already-nested children). Single undo step.
  */
 groupSelected(): GroupSelectedResult {
  const roots = this.selectionRoots();
  if (roots.length < 2) return { kind: "noop" };
  const layerId = roots[0]!.layerId;
  const groupShapeId = castShapeId(`group-${++this.nextId}-${Date.now().toString(36)}`);
  const order = orderForTop(
   [...this._scene.shapes.values()].filter((s) => s.layerId === layerId).map((s) => s.order),
  );
  const groupShape: Shape = {
   id: groupShapeId,
   layerId,
   type: "group",
   position: { x: 0, y: 0 },
   rotation: 0,
   scale: { x: 1, y: 1 },
   order,
   style: {},
  };
  const tx = this._history.transaction();
  const addRes = addShape(this._scene, groupShape);
  this._scene = addRes.scene;
  tx.add(addRes.patch);
  for (const child of roots) {
   const r = updateShape(this._scene, child.id, (s) => ({ ...s, parentId: groupShapeId }));
   this._scene = r.scene;
   tx.add(r.patch);
  }
  tx.commit();
  this._selection = Selection.single(groupShapeId);
  this.notify();
  return { kind: "grouped", groupId: groupShapeId };
 }

 /**
  * Inverse of `groupSelected`. For each selected shape that is a group
  * (type === "group"), drop the parent link on every direct child and
  * remove the group shape itself. Children that were on locked layers
  * stay put. Single undo step.
  */
 ungroup(): void {
  const targets = [...this._selection]
   .map((id) => getShape(this._scene, id))
   .filter((s): s is Shape => s?.type === "group");
  if (targets.length === 0) return;
  const tx = this._history.transaction();
  const newSelection = new Set<ShapeId>();
  for (const group of targets) {
   const children = [...this._scene.shapes.values()].filter((s) => s.parentId === group.id);
   for (const child of children) {
    const r = updateShape(this._scene, child.id, (s) => {
     const next: Shape = { ...s };
     delete (next as { parentId?: ShapeId }).parentId;
     return next;
    });
    this._scene = r.scene;
    tx.add(r.patch);
    newSelection.add(child.id);
   }
   const rm = removeShape(this._scene, group.id);
   this._scene = rm.scene;
   tx.add(rm.patch);
  }
  tx.commit();
  this._selection = newSelection;
  this.notify();
 }

 /**
  * Top-level shapes among the current selection — descends parents are
  * elided when their group's root is also selected, so caller commands
  * (group, move, copy) operate at the group level instead of double-
  * processing children.
  */
 private selectionRoots(): readonly Shape[] {
  const out: Shape[] = [];
  const seen = new Set<ShapeId>();
  for (const id of this._selection) {
   const shape = getShape(this._scene, id);
   if (!shape) continue;
   // Walk up the parent chain; if any ancestor is also selected, skip.
   let cursor: Shape | undefined = shape;
   let hidden = false;
   for (let i = 0; cursor?.parentId && i < 64; i++) {
    if (this._selection.has(cursor.parentId)) {
     hidden = true;
     break;
    }
    cursor = getShape(this._scene, cursor.parentId);
   }
   if (hidden) continue;
   if (seen.has(shape.id)) continue;
   seen.add(shape.id);
   out.push(shape);
  }
  return out;
 }

 /**
  * Expand the current selection into a flat set of shapes that should
  * be translated together: every selected shape plus every descendant
  * of it (groups carry their children). Used by `moveSelectionBy` and
  * shared with the drag-shape gesture below.
  */
 private expandSelectionWithDescendants(): ReadonlySet<ShapeId> {
  const out = new Set<ShapeId>();
  const visit = (id: ShapeId): void => {
   if (out.has(id)) return;
   const shape = getShape(this._scene, id);
   if (!shape) return;
   out.add(id);
   for (const child of this._scene.shapes.values()) {
    if (child.parentId === id) visit(child.id);
   }
  };
  for (const id of this._selection) visit(id);
  return out;
 }

 /**
  * Cycle keyboard selection through the scene's shapes in z-order.
  * `direction: "next"` advances forward; `"prev"` backward. With no
  * current selection (or selection not in scene), starts at the first
  * (or last) shape. Single-select — modifier-aware multi-select via
  * keyboard is a follow-up.
  */
 focusCycle(direction: "next" | "prev"): void {
  const layers = [...this._scene.layers.values()]
   // Skip hidden and locked layers — focus jumps over them.
   .filter((l) => l.visible && !l.locked)
   .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  const ordered: ShapeId[] = [];
  for (const layer of layers) {
   const inLayer = [...this._scene.shapes.values()]
    .filter((s) => s.layerId === layer.id)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
   for (const s of inLayer) ordered.push(s.id);
  }
  if (ordered.length === 0) return;
  const current = [...this._selection][0];
  let idx = current ? ordered.indexOf(current) : -1;
  if (direction === "next") {
   idx = idx === -1 ? 0 : (idx + 1) % ordered.length;
  } else {
   idx = idx === -1 ? ordered.length - 1 : (idx - 1 + ordered.length) % ordered.length;
  }
  const next = ordered[idx];
  if (!next) return;
  this._selection = Selection.single(next);
  this.notify();
  const shape = getShape(this._scene, next);
  if (shape) this.announce(`Selected ${getShapeAccessibleName(shape)}`);
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
 duplicateSelected(): void {
  const targets = [...this._selection];
  if (targets.length === 0) return;

  const tx = this._history.transaction();
  const newIds: ShapeId[] = [];
  for (const id of targets) {
   const shape = getShape(this._scene, id);
   if (!shape) continue;
   const newId = castShapeId(`shape-${++this.nextId}-${Date.now().toString(36)}`);
   const order = orderForTop(
    [...this._scene.shapes.values()]
     .filter((s) => s.layerId === shape.layerId)
     .map((s) => s.order),
   );
   const clone = {
    ...shape,
    id: newId,
    position: { x: shape.position.x + 10, y: shape.position.y + 10 },
    order,
   } as Shape;
   const r = addShape(this._scene, clone);
   this._scene = r.scene;
   tx.add(r.patch);
   newIds.push(newId);
  }
  tx.commit();
  if (newIds.length > 0) {
   let next = Selection.EMPTY;
   for (const id of newIds) next = Selection.add(next, id);
   this._selection = next;
  }
  this.notify();
 }

 /**
  * Replace the current shape selection with the given ids. Skips ids
  * that no longer resolve to a shape. Notifies subscribers when the
  * resulting selection differs from the current one.
  */
 setSelection(ids: Iterable<ShapeId>): void {
  let next = Selection.EMPTY;
  for (const id of ids) {
   if (!this._scene.shapes.has(id)) continue;
   next = Selection.add(next, id);
  }
  if (Selection.equals(next, this._selection)) return;
  this._selection = next;
  if (this._selectedEdge !== null) this._selectedEdge = null;
  this.notify();
 }

 /**
  * Select every shape in the scene. Skips shapes on hidden or
  * locked layers (consistent with focusCycle).
  */
 selectAll(): void {
  let next = Selection.EMPTY;
  for (const shape of this._scene.shapes.values()) {
   const layer = this._scene.layers.get(shape.layerId);
   if (!layer || !layer.visible || layer.locked) continue;
   next = Selection.add(next, shape.id);
  }
  if (Selection.equals(next, this._selection)) return;
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

 /** Copy current selection into the internal clipboard. */
 copySelected(): void {
  const out = copyShapesHelper(this._scene, this._selection);
  if (out.length === 0) return;
  this.clipboard = out;
  this.announce(`Copied ${out.length} shapes`);
 }

 /** Copy + delete in one transaction. */
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
 paste(targetWorld?: Vec2): void {
  if (this.clipboard.length === 0) return;
  // Defensive: if a gesture is mid-flight (drag / resize) the
  // gestureTx is still open and a fresh `transaction()` inside
  // pasteShapes would throw. The reasonable behaviour for a
  // user pressing Cmd+V mid-gesture is "commit what you have
  // and paste on top", so close the gesture first.
  this.finalizeOpenGestureTx();
  const target = targetWorld ?? this.lastPointerWorld;
  const result = pasteShapesHelper(
   this._scene,
   this._history,
   this.clipboard,
   target ?? null,
   () => castShapeId(`shape-${++this.nextId}-${Date.now().toString(36)}`),
  );
  this._scene = result.scene;
  let next = Selection.EMPTY;
  for (const id of result.newIds) next = Selection.add(next, id);
  this._selection = next;
  this.notify();
  this.announce(`Pasted ${result.newIds.length} shapes`);
 }

 /** Move the selected shape (single-shape MVP) to the top of its layer. */
 bringToFront(id?: ShapeId): void {
  const target = id ?? (this._selection.size === 1 ? [...this._selection][0] : null);
  if (!target) return;
  const shape = getShape(this._scene, target);
  if (!shape) return;
  const order = orderForTop(
   [...this._scene.shapes.values()]
    .filter((s) => s.layerId === shape.layerId && s.id !== shape.id)
    .map((s) => s.order),
  );
  if (order === shape.order) return;
  const result = updateShape(this._scene, shape.id, (s) => ({ ...s, order }));
  this._scene = result.scene;
  this._history.push(result.patch);
  this.notify();
 }

 /** Move the selected shape (single-shape MVP) to the bottom of its layer. */
 sendToBack(id?: ShapeId): void {
  const target = id ?? (this._selection.size === 1 ? [...this._selection][0] : null);
  if (!target) return;
  const shape = getShape(this._scene, target);
  if (!shape) return;
  const order = orderForBottom(
   [...this._scene.shapes.values()]
    .filter((s) => s.layerId === shape.layerId && s.id !== shape.id)
    .map((s) => s.order),
  );
  if (order === shape.order) return;
  const result = updateShape(this._scene, shape.id, (s) => ({ ...s, order }));
  this._scene = result.scene;
  this._history.push(result.patch);
  this.notify();
 }

 /**
  * Rewrite z-order keys in `layerId` (or every layer when omitted) so
  * they form a short, evenly-distributed sequence (`"a0"`, `"a1"`, …).
  * Useful after a burst of `insert-in-the-middle` operations where
  * fractional-index strings have grown long enough to bloat serialised
  * scenes / patches.
  *
  * No-op when the layer is already compact (every key already short
  * and monotonic). Skips when nothing changed — no history entry.
  * Otherwise lands as a single undo step covering every touched shape
  * + edge in the affected layer(s).
  */
 compactLayerZOrder(
  layerId?: LayerId,
  options: { recordHistory?: boolean } = {},
 ): void {
  const recordHistory = options.recordHistory ?? true;
  const layerIds: readonly LayerId[] = layerId
   ? [layerId]
   : [...this._scene.layers.keys()];
  const tx = recordHistory ? this._history.transaction() : null;
  let touched = 0;
  for (const lid of layerIds) {
   // Shapes are rendered separately from edges — z-order is independent
   // within each layer (renderScene makes two passes: shapes, then edges).
   touched += this.rewriteOrders(
    [...this._scene.shapes.values()].filter((s) => s.layerId === lid),
    (shape, order) => {
     const r = updateShape(this._scene, shape.id, (s) => ({ ...s, order }));
     this._scene = r.scene;
     tx?.add(r.patch);
    },
   );
   touched += this.rewriteOrders(
    [...this._scene.edges.values()].filter((e) => e.layerId === lid),
    (edge, order) => {
     const r = updateEdge(this._scene, edge.id, (e) => ({ ...e, order }));
     this._scene = r.scene;
     tx?.add(r.patch);
    },
   );
  }
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
  * Generic helper: replace each entity's `order` with the i-th key of
  * `orderBetweenMany(null, null, n)`. Returns the count of entities
  * whose order actually changed (so callers can skip the history
  * entry on no-ops).
  */
 private rewriteOrders<T extends { readonly order: FractionalIndex }>(
  entities: readonly T[],
  apply: (entity: T, order: FractionalIndex) => void,
 ): number {
  if (entities.length === 0) return 0;
  const sorted = [...entities].sort((a, b) =>
   a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
  );
  const fresh = orderBetweenMany(null, null, sorted.length);
  let changed = 0;
  sorted.forEach((entity, i) => {
   const next = fresh[i]!;
   if (next === entity.order) return;
   apply(entity, next);
   changed++;
  });
  return changed;
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

 /**
  * Create a new top-of-stack layer with the given name and return its id.
  * The new layer is made active. One undo step.
  */
 createLayer(name: string): LayerId {
  const id = castLayerId(`layer-${++this.nextId}-${Date.now().toString(36)}`);
  const topOrder = orderForTop([...this._scene.layers.values()].map((l) => l.order));
  const layer: Layer = { id, name, visible: true, locked: false, order: topOrder };
  const result = addLayer(this._scene, layer);
  this._scene = result.scene;
  this._history.push(result.patch);
  this._activeLayerId = id;
  this.notify();
  return id;
 }

 /**
  * Remove a layer + every shape and edge living on it. One undo step.
  * No-op if the layer doesn't exist; throws if it's the only layer
  * left (hosts get a clear signal that they need to keep at least one).
  */
 removeLayer(id: LayerId): void {
  if (!this._scene.layers.has(id)) return;
  if (this._scene.layers.size <= 1) {
   throw new Error("Cannot remove the only remaining layer.");
  }
  const tx = this._history.transaction();
  for (const shape of [...this._scene.shapes.values()]) {
   if (shape.layerId !== id) continue;
   const r = removeShape(this._scene, shape.id);
   this._scene = r.scene;
   tx.add(r.patch);
  }
  for (const edge of [...this._scene.edges.values()]) {
   if (edge.layerId !== id) continue;
   const r = removeEdge(this._scene, edge.id);
   this._scene = r.scene;
   tx.add(r.patch);
  }
  const r = removeLayer(this._scene, id);
  this._scene = r.scene;
  tx.add(r.patch);
  tx.commit();
  // If we just removed the active layer, fall back to the topmost remaining one.
  if (this._activeLayerId === id) {
   const top = [...this._scene.layers.values()].sort((a, b) =>
    a.order > b.order ? -1 : a.order < b.order ? 1 : 0,
   )[0];
   if (top) this._activeLayerId = top.id;
  }
  this._selection = Selection.EMPTY;
  this.notify();
 }

 /** Rename a layer. One undo step. */
 renameLayer(id: LayerId, name: string): void {
  const layer = this._scene.layers.get(id);
  if (!layer || layer.name === name) return;
  const result = updateLayer(this._scene, id, (l) => ({ ...l, name }));
  this._scene = result.scene;
  this._history.push(result.patch);
  this.notify();
 }

 /** Flip a layer's `visible` flag. */
 toggleLayerVisibility(id: LayerId): void {
  const layer = this._scene.layers.get(id);
  if (!layer) return;
  const result = updateLayer(this._scene, id, (l) => ({ ...l, visible: !l.visible }));
  this._scene = result.scene;
  this._history.push(result.patch);
  this.notify();
 }

 /** Flip a layer's `locked` flag. */
 toggleLayerLock(id: LayerId): void {
  const layer = this._scene.layers.get(id);
  if (!layer) return;
  const result = updateLayer(this._scene, id, (l) => ({ ...l, locked: !l.locked }));
  this._scene = result.scene;
  this._history.push(result.patch);
  this.notify();
 }

 /**
  * Move every currently-selected shape onto `targetLayer`. Edges follow
  * automatically (they stay on whichever layer they were already on —
  * cross-layer edges are valid). One undo step.
  */
 moveSelectionToLayer(targetLayer: LayerId): void {
  if (!this._scene.layers.has(targetLayer) || this._selection.size === 0) return;
  const tx = this._history.transaction();
  let moved = 0;
  for (const id of this._selection) {
   const shape = getShape(this._scene, id);
   if (!shape || shape.layerId === targetLayer) continue;
   const result = updateShape(this._scene, id, (s) => ({ ...s, layerId: targetLayer }));
   this._scene = result.scene;
   tx.add(result.patch);
   moved += 1;
  }
  if (moved === 0) {
   tx.cancel();
   return;
  }
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
 panBy(deltaScreen: Vec2): void {
  if (deltaScreen.x === 0 && deltaScreen.y === 0) return;
  this._scene = { ...this._scene, viewport: viewportPanBy(this._scene.viewport, deltaScreen) };
  this.notify();
 }

 /**
  * Step zoom in / out by `WHEEL_ZOOM_STEP` around the viewport centre.
  * Used by toolbar buttons / hotkeys. Use `zoomAt` for anchor-aware
  * zoom (cursor / pinch).
  */
 zoomIn(): void {
  this.zoomStep(WHEEL_ZOOM_STEP);
 }
 zoomOut(): void {
  this.zoomStep(1 / WHEEL_ZOOM_STEP);
 }

 private zoomStep(factor: number): void {
  const vp = this._scene.viewport;
  const w = vp.size.width;
  const h = vp.size.height;
  if (w <= 0 || h <= 0) return;
  const center = this.screenToWorld({ x: w / 2, y: h / 2 });
  this.zoomAt(factor, center);
 }

 /** Reset zoom to 1.0 and pan to (0, 0). */
 resetZoom(): void {
  if (this._scene.viewport.zoom === 1 && this._scene.viewport.pan.x === 0 && this._scene.viewport.pan.y === 0) return;
  this._scene = {
   ...this._scene,
   viewport: { ...this._scene.viewport, zoom: 1, pan: { x: 0, y: 0 } },
  };
  this.notify();
 }

 /**
  * Fit every shape into the viewport with optional padding (px).
  * No-op when scene is empty or viewport size is 0. Centres content.
  */
 zoomToFit(padding = 40): void {
  if (this._scene.shapes.size === 0) return;
  const vp = this._scene.viewport;
  if (vp.size.width <= 0 || vp.size.height <= 0) return;
  let combined: Bounds | null = null;
  for (const s of this._scene.shapes.values()) {
   const b = getShapeWorldBounds(s);
   combined = combined ? B.union(combined, b) : b;
  }
  if (!combined || combined.width <= 0 || combined.height <= 0) return;
  const availW = vp.size.width - padding * 2;
  const availH = vp.size.height - padding * 2;
  if (availW <= 0 || availH <= 0) return;
  const zoom = clampZoom(Math.min(availW / combined.width, availH / combined.height));
  // Centre the content: pick pan so that combined centre maps to
  // viewport centre at the new zoom.
  const centerWorld = {
   x: combined.x + combined.width / 2,
   y: combined.y + combined.height / 2,
  };
  const pan = {
   x: centerWorld.x - vp.size.width / 2 / zoom,
   y: centerWorld.y - vp.size.height / 2 / zoom,
  };
  this._scene = { ...this._scene, viewport: { ...vp, zoom, pan } };
  this.notify();
 }

 /**
  * Multiplicative zoom around a world-space anchor (the anchor stays
  * under the same screen pixel). `anchorWorld` typically comes from
  * the cursor or pinch midpoint. Result is clamped to `[MIN_ZOOM,
  * MAX_ZOOM]`; a zero-effect call is a no-op.
  */
 zoomAt(factor: number, anchorWorld: Vec2): void {
  const currentZoom = this._scene.viewport.zoom;
  const targetZoom = clampZoom(currentZoom * factor);
  const effectiveFactor = targetZoom / currentZoom;
  if (effectiveFactor === 1) return;
  this._scene = {
   ...this._scene,
   viewport: viewportZoomAt(this._scene.viewport, effectiveFactor, anchorWorld),
  };
  this.notify();
 }

 /**
  * Update the camera's screen-pixel size. Hosts call this from a
  * `ResizeObserver` on the canvas element so culling rects and
  * pinch-midpoint math stay in sync with the visible area.
  */
 setViewportSize(width: number, height: number): void {
  const vp = this._scene.viewport;
  if (vp.size.width === width && vp.size.height === height) return;
  this._scene = { ...this._scene, viewport: viewportResize(vp, width, height) };
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

 private bindPointerEvents(): () => void {
  const onDown = (ev: PointerEvent) => {
   ev.preventDefault();
   this.host.setPointerCapture(ev.pointerId);
   const data = fromPointerEvent(ev, this.host);

   // Pan gesture detection — must come BEFORE the normal flow so a
   // right-click or Space+left-click never starts a select/draw
   // gesture. Two triggers:
   //  • Right mouse button (button === 2).
   //  • Left mouse button + Space currently held.
   // Middle-click (button === 1) historically pans in editors too;
   // we cover it under the same trigger for parity.
   const isRightClick = ev.button === 2 || ev.button === 1;
   const isSpaceLeftDrag = ev.button === 0 && this.spaceHeld;
   const isHandModeLeftDrag = ev.button === 0 && this.mode === "hand";
   if (isRightClick || isSpaceLeftDrag || isHandModeLeftDrag) {
    // Suppress the next native contextmenu — we'll either pan
    // (if user drags) or manually fire the long-press callback
    // at pointerup (if it was a click-style right-click).
    if (isRightClick) this.suppressNextContextMenu = true;
    this.beginPanGesture(ev.pointerId, ev.button, data.point);
    return;
   }

   // Track every active pointer so we can detect a 2-finger pinch.
   // On the *second* concurrent pointer, cancel whatever single-pointer
   // gesture the machine started (it'd otherwise interpret the second
   // touch as a one-finger drag) and enter pinch mode.
   this.activePointers.set(ev.pointerId, data.point);
   if (this.activePointers.size === 2) {
    // First touch already kicked off a POINTER_DOWN — undo it so the
    // shape under finger #1 doesn't get dragged when finger #2 lands.
    this.actor.send({ type: "POINTER_CANCEL" });
    this.cancelGesture();
    this.cancelLongPress();
    this.beginPinch();
    return;
   }
   if (this.activePointers.size > 2) {
    // 3-finger and more: stay in pinch mode but ignore additional
    // contacts — the gesture math uses the first two pointers only.
    return;
   }

   // Schedule a long-press fire — cancelled by movement or release.
   this.startLongPress(data.point);

   const worldPoint = this.screenToWorld(data.point);

   // Brush mode owns the gesture end-to-end — no machine, no
   // interactive testers, no auto-select. Start a stroke at the
   // press point with the device's pressure; onMove extends; onUp
   // commits as a single BrushShape patch.
   if (this.mode === "brush") {
    this.beginBrushStroke(worldPoint, ev.pressure);
    return;
   }

   // Annotation pin drag — when the press lands on a pin, take over
   // the gesture entirely (skip machine, skip interactive testers).
   // Pin position updates per pointermove; commits on pointerup.
   const annHit = this.hitAnnotation(worldPoint);
   if (annHit) {
    const ann = this._scene.annotations.get(annHit);
    if (ann) {
     this.annotationDrag = {
      id: annHit,
      originPosition: { ...ann.position },
      originWorldPoint: worldPoint,
      moved: false,
     };
     this.setSelectedAnnotation(annHit);
     return;
    }
   }

   // Interactive sub-element check: when the press lands on a shape whose
   // type has a registered hit-tester (rich templates, etc.) and the
   // tester finds an interactive node, fire its emit and skip the normal
   // press flow entirely. This is what makes a click on a template Button
   // behave differently from a click on the template body.
   const topShape = this.acceleratedShapeAt(worldPoint);
   if (topShape) {
    const tester = getInteractiveHitTester(topShape.type);
    if (tester) {
     const local = {
      x: worldPoint.x - topShape.position.x,
      y: worldPoint.y - topShape.position.y,
     };
     const emit = tester(topShape, local);
     if (emit) {
      this.applyEmit(emit);
      return;
     }
    }
   }

   const target = this.hitTest(worldPoint);
   // Auto-select on press for shapes / edges that the user is about
   // to act on (drag, resize handles). Matches standard/x5 graph: you
   // can't manipulate an element that isn't selected — so pressing
   // on an unselected one promotes it to the selection BEFORE the
   // drag starts. Shift/Cmd extends instead of replacing. We don't
   // promote inside the group-handle / edge-endpoint paths because
   // those already act on the existing selection.
   if (target.kind === "shape" && !this._selection.has(target.id)) {
    const additive = Boolean(data.modifiers?.shift || data.modifiers?.meta || data.modifiers?.ctrl);
    this._selection = additive ? Selection.add(this._selection, target.id) : Selection.single(target.id);
    if (this._selectedEdge !== null) this._selectedEdge = null;
    // Notify happens at the end of the gesture path; selecting now
    // ensures the live `_selection` reflects what subsequent
    // MOVE_SHAPE emits will operate on.
    this.notify();
   }
   // Track the dragged shape id for container drop / drag-out
   // logic on pointerup. Cleared in onUp / cancel.
   this.dragShapeId = target.kind === "shape" ? target.id : null;
   this.containerHover = null;

   // Snapshot positions for the upcoming drag. Two paths populate the
   // group-move snapshot:
   //  1. Press lands on an already-selected shape → drag the whole
   //   selection (with descendants of any selected group).
   //  2. Press lands on a group shape (whether selected or not) →
   //   drag that group and its descendants. Without this, a click-
   //   drag on an unselected group would only move the wrapper
   //   (zero-bounds, invisible) and leave its children behind —
   //   looking exactly like the group had been ungrouped.
   if (target.kind === "shape") {
    const pressedShape = getShape(this._scene, target.id);
    const pressedIsGroup = pressedShape?.type === "group";
    const pressedIsFrame = pressedShape?.type === "frame";
    const inSelection = this._selection.has(target.id);
    if (inSelection || pressedIsGroup || pressedIsFrame) {
     const ids = new Set<ShapeId>();
     if (inSelection) {
      for (const id of this.expandSelectionWithDescendants()) ids.add(id);
     }
     if (pressedIsGroup) {
      const visit = (parentId: ShapeId): void => {
       if (ids.has(parentId)) return;
       ids.add(parentId);
       for (const child of this._scene.shapes.values()) {
        if (child.parentId === parentId) visit(child.id);
       }
      };
      visit(target.id);
     }
     if (pressedIsFrame) {
      // Frame drag pulls every shape with matching frameId
      // along (standard frame model). Frames are flat
      // associations — no recursive descent needed.
      ids.add(target.id);
      for (const s of this._scene.shapes.values()) {
       if (s.frameId === target.id) ids.add(s.id);
      }
     }
     if (ids.size > 1) {
      const snap = new Map<ShapeId, Vec2>();
      for (const id of ids) {
       const s = getShape(this._scene, id);
       if (s) snap.set(id, s.position);
      }
      this.groupMoveOrigin = snap;
     } else {
      this.groupMoveOrigin = null;
     }
    } else {
     this.groupMoveOrigin = null;
    }
   } else {
    this.groupMoveOrigin = null;
   }
   // Snapshot each member's world bounds + position + scale when the
   // press lands on a group-handle so the per-frame resize math has
   // a stable baseline to scale against.
   //
   // For single-group selection the selection itself is just the
   // group wrapper (zero intrinsic bounds), so the snapshot would
   // be useless. Expand to include every descendant — those are
   // the leaves applyGroupResize actually scales. Same expansion
   // is harmless for plain multi-selection (no descendants).
   if (target.kind === "group-handle") {
    const shapes = new Map<ShapeId, { position: Vec2; bounds: Bounds; scale: Vec2 }>();
    for (const id of this.expandSelectionWithDescendants()) {
     const s = getShape(this._scene, id);
     if (!s) continue;
     shapes.set(id, {
      position: s.position,
      bounds: getShapeWorldBounds(s),
      scale: s.scale,
     });
    }
    this.groupResizeOrigin = { combined: target.bounds, shapes };
   } else {
    this.groupResizeOrigin = null;
   }
   this.actor.send({
    type: "POINTER_DOWN",
    point: worldPoint,
    target,
    modifiers: data.modifiers,
   });
  };

  const onMove = (ev: PointerEvent) => {
   const data = fromPointerEvent(ev, this.host);

   // Pan gesture in flight — translate cursor delta to a screen
   // pan and short-circuit. Doesn't touch the machine.
   if (this.panGesture && this.panGesture.pointerId === ev.pointerId) {
    const dx = data.point.x - this.panGesture.lastPoint.x;
    const dy = data.point.y - this.panGesture.lastPoint.y;
    this.panGesture.lastPoint = data.point;
    // Mark as moved once total displacement crosses the slop
    // threshold — used at pointerup to decide context-menu vs
    // drag for right-click gestures.
    if (
     !this.panGesture.moved &&
     distanceTo(this.panGesture.startPoint, data.point) > LONG_PRESS_MAX_MOVEMENT_PX
    ) {
     this.panGesture.moved = true;
    }
    // Natural-grab direction: cursor right → world moves right
    // (shapes follow the finger). `viewportPanBy` already
    // subtracts deltaScreen from pan, so we pass the raw cursor
    // delta — no extra inversion.
    this.panBy({ x: dx, y: dy });
    return;
   }

   // Update tracked pointer position. In pinch mode, recompute the
   // gesture and short-circuit before sending to the machine.
   if (this.activePointers.has(ev.pointerId)) {
    this.activePointers.set(ev.pointerId, data.point);
   }
   if (this.pinchOrigin) {
    this.applyPinch();
    return;
   }

   // Cancel long-press timer if the finger has moved beyond slop.
   if (this.longPressOrigin) {
    if (distanceTo(this.longPressOrigin, data.point) > LONG_PRESS_MAX_MOVEMENT_PX) {
     this.cancelLongPress();
    }
   }

   const worldPoint = this.screenToWorld(data.point);
   // Track cursor for paste-at-cursor and other commands that want a
   // sensible drop target.
   this.lastPointerWorld = worldPoint;

   // Brush stroke in progress — append a vertex and skip everything
   // else (machine, container hover, hovered-edge target).
   if (this.brushStroke) {
    this.extendBrushStroke(worldPoint, ev.pressure);
    return;
   }

   // Container drop preview: while dragging a single shape, find the
   // topmost container under cursor (excluding the dragged shape and
   // its descendants) and stash the drop-zone for the overlay.
   if (this.dragShapeId) {
    const dragged = this.dragShapeId;
    const exclude = new Set<ShapeId>([dragged]);
    // Don't drop a container onto itself or into one of its own
    // descendants (would create a cycle).
    for (const s of this._scene.shapes.values()) {
     let cursor = s.parentId;
     for (let i = 0; cursor && i < 64; i++) {
      if (cursor === dragged) {
       exclude.add(s.id);
       break;
      }
      cursor = this._scene.shapes.get(cursor)?.parentId;
     }
    }
    const container = findContainerAt(this._scene, worldPoint, exclude);
    if (container) {
     const zone = getDropZoneWorld(container);
     if (zone) {
      const next = { id: container.id, dropZone: zone };
      if (
       !this.containerHover ||
       this.containerHover.id !== next.id ||
       this.containerHover.dropZone !== next.dropZone
      ) {
       this.containerHover = next;
       this.notify();
      }
     }
    } else if (this.containerHover !== null) {
     this.containerHover = null;
     this.notify();
    }
   }

   // Annotation drag — update annotation position from delta. No
   // patches per-move; commit on pointerup so undo is one step.
   if (this.annotationDrag) {
    const drag = this.annotationDrag;
    const dx = worldPoint.x - drag.originWorldPoint.x;
    const dy = worldPoint.y - drag.originWorldPoint.y;
    if (dx !== 0 || dy !== 0) drag.moved = true;
    const ann = this._scene.annotations.get(drag.id);
    if (ann) {
     // Mutate via apply to keep render in sync; final commit on
     // up rewrites the patch from origin to final.
     const newPos = { x: drag.originPosition.x + dx, y: drag.originPosition.y + dy };
     const next = { ...ann, position: newPos };
     const annotations = new Map(this._scene.annotations);
     annotations.set(drag.id, next);
     this._scene = { ...this._scene, annotations };
     this.notify();
    }
    return;
   }

   // Fan out to anyone listening for the local cursor — `@collab`
   // broadcasts it via awareness. Fires on every move; subscribers
   // throttle if they care.
   for (const fn of this.cursorListeners) fn(worldPoint);
   const ctx = this.actor.getSnapshot().context;
   if (
    ctx.pressOrigin &&
    ctx.mode !== "select" &&
    ctx.mode !== "draw-edge" &&
    this.isDrawingPhase(ctx)
   ) {
    // Update rubber-band preview live for rect / ellipse drawing.
    this.drawingPreview = boundsFromPoints(ctx.pressOrigin, worldPoint);
   }
   // Port-overlay tracking in draw-edge mode — both when idle (showing
   // where you can start an edge) and during the gesture (showing the
   // snap target as the pointer crosses shapes).
   if (ctx.mode === "draw-edge") {
    this.updateHoveredEdgeTarget(worldPoint);
   } else if (this.hoveredEdgeTarget !== null) {
    this.hoveredEdgeTarget = null;
    this.notify();
   }
   this.actor.send({ type: "POINTER_MOVE", point: worldPoint });
  };

  const onUp = (ev: PointerEvent) => {
   if (this.host.hasPointerCapture(ev.pointerId)) {
    this.host.releasePointerCapture(ev.pointerId);
   }
   this.activePointers.delete(ev.pointerId);

   // Pan gesture ends — clean up cursor and state, skip the rest.
   if (this.panGesture && this.panGesture.pointerId === ev.pointerId) {
    this.endPanGesture();
    return;
   }

   // Exit pinch when the second-to-last finger lifts — the surviving
   // touch (if any) does NOT resume as a single-finger drag, because
   // we already cancelled the machine on pinch entry.
   if (this.pinchOrigin) {
    if (this.activePointers.size < 2) {
     this.pinchOrigin = null;
    }
    return;
   }

   // Long-press loses its chance the moment the user releases.
   this.cancelLongPress();

   // Commit brush stroke if one is in progress.
   if (this.brushStroke) {
    this.commitBrushStroke();
    return;
   }

   // Annotation drag commit — issue a single patch that goes from
   // origin position to final position so history has one undo step.
   if (this.annotationDrag) {
    const drag = this.annotationDrag;
    this.annotationDrag = null;
    if (drag.moved) {
     const final = this._scene.annotations.get(drag.id);
     if (final) {
      // Reset to origin, then issue patch with proper before/after.
      const origin = { ...final, position: drag.originPosition };
      const annotations = new Map(this._scene.annotations);
      annotations.set(drag.id, origin);
      this._scene = { ...this._scene, annotations };
      const r = updateAnnotation(this._scene, drag.id, () => final);
      this._scene = r.scene;
      this._history.push(r.patch);
      this.notify();
     }
    }
    return;
   }

   const data = fromPointerEvent(ev, this.host);
   const worldPoint = this.screenToWorld(data.point);

   // First, fire any click-style effect derived from the press context.
   const ctxBeforeUp = this.actor.getSnapshot().context;
   const clickEffect = interpretPressEnd(ctxBeforeUp, worldPoint);

   // Group isolation routing:
   //  - Double-click on a grouped shape → enter the topmost group
   //   ancestor; select the inner shape directly (skipping the
   //   promote-to-group logic that would otherwise re-select the
   //   group root).
   //  - Inside isolation, a click that lands outside the entered
   //   group's descendants (empty space OR another shape) exits
   //   isolation and lets the normal selection happen.
   // Both branches override what `interpretPressEnd` produced.
   const handledByIsolation = this.routeIsolationClick(clickEffect, worldPoint);
   if (!handledByIsolation && clickEffect) {
    this.applyEmit(clickEffect);
   }

   this.drawingPreview = null;
   // Provide the up-side hit-test when the gesture cares about where
   // it lands: drawing a new edge, or re-binding an existing edge
   // endpoint. The hit-test sees the *current* selection (edge or
   // shape) and so resolves correctly to either kind.
   const needsUpTarget =
    ctxBeforeUp.mode === "draw-edge" || ctxBeforeUp.pressTarget?.kind === "edge-endpoint";
   const upTarget = needsUpTarget ? this.hitTest(worldPoint) : undefined;
   this.actor.send(
    upTarget !== undefined
     ? { type: "POINTER_UP", point: worldPoint, target: upTarget }
     : { type: "POINTER_UP", point: worldPoint },
   );
   // Container reparent / drag-out — must run before commitGesture
   // so the parentId / autoGrow patches land in the same undo step.
   this.applyContainerDrop(worldPoint);
   this.commitGesture();
  };

  const onCancel = (ev: PointerEvent) => {
   this.activePointers.delete(ev.pointerId);
   if (this.panGesture && this.panGesture.pointerId === ev.pointerId) {
    this.endPanGesture();
    return;
   }
   if (this.pinchOrigin) {
    if (this.activePointers.size < 2) this.pinchOrigin = null;
    return;
   }
   this.cancelLongPress();
   if (this.brushStroke) {
    this.cancelBrushStroke();
    return;
   }
   // Annotation drag — revert to origin on cancel.
   if (this.annotationDrag) {
    const drag = this.annotationDrag;
    this.annotationDrag = null;
    const ann = this._scene.annotations.get(drag.id);
    if (ann) {
     const annotations = new Map(this._scene.annotations);
     annotations.set(drag.id, { ...ann, position: drag.originPosition });
     this._scene = { ...this._scene, annotations };
     this.notify();
    }
    return;
   }
   this.drawingPreview = null;
   this.actor.send({ type: "POINTER_CANCEL" });
   this.cancelGesture();
  };

  this.host.addEventListener("pointerdown", onDown);
  this.host.addEventListener("pointermove", onMove);
  this.host.addEventListener("pointerup", onUp);
  this.host.addEventListener("pointercancel", onCancel);

  // Right-click handling: the contextmenu DOM event fires once per
  // right mouse press, AFTER pointerup on most browsers. We use
  // `suppressNextContextMenu` (set on right-click pointerdown) to:
  //  • preventDefault the native browser menu;
  //  • stopPropagation so window-level listeners (like
  //   `@react-ui/ContextMenu` default) don't re-open a menu when
  //   the user was actually panning.
  // The "menu on click without drag" path lives in `endPanGesture`:
  // it fires `longPressListeners` directly, which is what
  // ContextMenu also subscribes to. So a clean right-click still
  // produces a menu — through our event channel, not the native
  // contextmenu DOM event.
  const onContextMenu = (ev: MouseEvent): void => {
   if (!this.suppressNextContextMenu) return;
   this.suppressNextContextMenu = false;
   ev.preventDefault();
   ev.stopPropagation();
  };
  // Capture phase so we beat the window-level listener that
  // ContextMenu attaches in its useEffect.
  this.host.addEventListener("contextmenu", onContextMenu, true);

  // Window-level Space tracking so Space anywhere on the page
  // arms the next mouse drag as a pan. Skip when focus is in a
  // text input — Space should still type a space there.
  const isEditableTarget = (target: EventTarget | null): boolean => {
   if (!(target instanceof HTMLElement)) return false;
   const tag = target.tagName;
   return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
   );
  };
  const onKeyDown = (ev: KeyboardEvent): void => {
   if (ev.code !== "Space" && ev.key !== " ") return;
   if (isEditableTarget(ev.target)) return;
   if (this.spaceHeld) return;
   this.spaceHeld = true;
   // Visual affordance: "grab" cursor signals the user can drag-pan.
   if (this.previousHostCursor === null) {
    this.previousHostCursor = this.host.style.cursor;
    this.host.style.cursor = "grab";
   }
   // Prevent page scroll on Space — common in browsers when no
   // input is focused. We're holding it as a modifier, not as text.
   ev.preventDefault();
  };
  const onKeyUp = (ev: KeyboardEvent): void => {
   if (ev.code !== "Space" && ev.key !== " ") return;
   if (!this.spaceHeld) return;
   this.spaceHeld = false;
   // Don't reset cursor if a pan gesture is still in flight — the
   // gesture's own end-handler restores it. Otherwise restore now.
   if (!this.panGesture && this.previousHostCursor !== null) {
    this.host.style.cursor = this.previousHostCursor;
    this.previousHostCursor = null;
   }
  };
  // window guard so node-env tests can still construct the editor.
  if (typeof window !== "undefined") {
   window.addEventListener("keydown", onKeyDown);
   window.addEventListener("keyup", onKeyUp);
  }

  // Wheel routing — standard model: mouse wheel → zoom, trackpad → pan
  // / pinch. Browsers fire identical `wheel` events for both
  // devices and no per-event signal is bulletproof (standard,
  // standard, normalize-wheel all give up on per-event device
  // discrimination — see notes below).
  //
  // We use the **modern-style sticky** approach combined with the
  // `deltaX` signal:
  //
  // 1. Cmd/Ctrl + wheel (and trackpad pinch, which browsers
  //  synthesize as `ctrlKey: true`) → ZOOM around cursor.
  // 2. Shift + wheel → horizontal pan from the vertical delta.
  // 3. Otherwise:
  //  • If we've already observed a trackpad signal in this
  //   session (sticky `trackpadDetected` flag) → PAN.
  //  • Per-event signal `deltaX !== 0` (any horizontal component
  //   — mouse wheels never set this) → PAN, AND lock the
  //   sticky flag so subsequent pure-vertical trackpad swipes
  //   also pan.
  //  • A pinch event (`ctrlKey && deltaY` without `metaKey`)
  //   also locks the trackpad flag — once the user has pinched
  //   we know they're on a trackpad.
  //  • Otherwise (plain vertical, no trackpad ever detected) →
  //   ZOOM. This is the mouse-wheel branch.
  //
  // Result: mouse-only users always get zoom on wheel (they never
  // emit deltaX or pinch, so the sticky flag never trips).
  // Trackpad users get zoom on pinch + Cmd, and pan on any swipe
  // including pure-vertical ones after the first non-pure-vertical
  // event (or first pinch).
  //
  // Pan direction: `panBy` subtracts deltaScreen from `viewport.pan`,
  // so we negate the wheel delta — positive deltaX (page scrolls
  // right) → camera right → content shifts LEFT, matching native
  // browser scroll feel.
  //
  // Per-event classification (no sticky state — sticky kept biting
  // when the user touched the trackpad / pinched once and then
  // expected the mouse wheel to keep zooming):
  //
  //  • Cmd / Ctrl + wheel (also browser-synthesized for trackpad
  //   pinch) → ZOOM around cursor.
  //  • Shift + plain wheel → horizontal pan from vertical delta.
  //  • Any deltaX ≠ 0 → trackpad 2D swipe → PAN both axes.
  //  • Plain deltaY only → ZOOM (mouse wheel; rare pure-vertical
  //   trackpad swipes also land here — acceptable tradeoff).
  const onWheel = (ev: WheelEvent): void => {
   ev.preventDefault();
   const rect = this.host.getBoundingClientRect();
   const screenPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };

   const applyZoom = (): void => {
    if (ev.deltaY === 0) return;
    const factor = Math.exp(-ev.deltaY * WHEEL_ZOOM_SENSITIVITY);
    const currentZoom = this._scene.viewport.zoom;
    const nextZoom = clampZoom(currentZoom * factor);
    if (nextZoom === currentZoom) return;
    const anchor = this.screenToWorld(screenPoint);
    this.zoomAt(nextZoom / currentZoom, anchor);
   };

   const applyPan = (): void => {
    let dx = ev.deltaX;
    let dy = ev.deltaY;
    if (ev.shiftKey && dx === 0) {
     dx = dy;
     dy = 0;
    }
    this.panBy({ x: -dx * WHEEL_PAN_FACTOR, y: -dy * WHEEL_PAN_FACTOR });
   };

   // Modifier-driven zoom (Cmd/Ctrl+wheel + trackpad pinch via
   // browser-synthesized ctrlKey).
   if (ev.ctrlKey || ev.metaKey) {
    applyZoom();
    return;
   }

   // Trackpad 2-finger swipe with any horizontal component →
   // pan both axes. Mouse wheels never set deltaX, so this
   // branch never misroutes mouse input.
   if (ev.deltaX !== 0) {
    applyPan();
    return;
   }

   // Plain vertical wheel — always ZOOM (standard behaviour).
   // Pure-vertical trackpad swipes also hit this; users who want
   // vertical-only trackpad pan use Space+drag or right-drag.
   applyZoom();
  };
  // `passive: false` because we preventDefault. Browsers default wheel
  // listeners to passive — must opt out explicitly.
  this.host.addEventListener("wheel", onWheel, { passive: false });

  return () => {
   this.host.removeEventListener("pointerdown", onDown);
   this.host.removeEventListener("pointermove", onMove);
   this.host.removeEventListener("pointerup", onUp);
   this.host.removeEventListener("pointercancel", onCancel);
   this.host.removeEventListener("contextmenu", onContextMenu, true);
   this.host.removeEventListener("wheel", onWheel);
   if (typeof window !== "undefined") {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
   }
  };
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

 // --- Long-press ---

 private startLongPress(screenPoint: Vec2): void {
  this.cancelLongPress();
  this.longPressOrigin = screenPoint;
  this.longPressTimer = setTimeout(() => {
   this.longPressTimer = null;
   const origin = this.longPressOrigin;
   this.longPressOrigin = null;
   if (!origin) return;
   const worldPoint = this.screenToWorld(origin);
   // Fire AFTER we clear local state so listeners can call back
   // into the editor (e.g. select shape under press) safely.
   for (const fn of this.longPressListeners) fn({ screenPoint: origin, worldPoint });
  }, LONG_PRESS_DELAY_MS);
 }

 private cancelLongPress(): void {
  if (this.longPressTimer !== null) {
   clearTimeout(this.longPressTimer);
   this.longPressTimer = null;
  }
  this.longPressOrigin = null;
 }

 // --- Pinch gesture ---

 private beginPinch(): void {
  const pts = [...this.activePointers.values()];
  if (pts.length < 2) return;
  const [p1, p2] = pts as [Vec2, Vec2];
  const midpointScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  this.pinchOrigin = {
   midpointWorld: this.screenToWorld(midpointScreen),
   distance: distanceTo(p1, p2),
   midpointScreen,
  };
 }

 private applyPinch(): void {
  if (!this.pinchOrigin) return;
  const pts = [...this.activePointers.values()];
  if (pts.length < 2) return;
  const [p1, p2] = pts as [Vec2, Vec2];

  const distance = distanceTo(p1, p2);
  const midScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  // Skip jitter frames so resting fingers don't drift the camera.
  const moved =
   distanceTo(midScreen, this.pinchOrigin.midpointScreen) +
   Math.abs(distance - this.pinchOrigin.distance);
  if (moved < PINCH_MIN_MOVEMENT_PX) return;

  // Zoom: ratio of current finger distance over the start distance,
  // centered on the *current* midpoint (so the gesture feels grounded
  // even as the user's fingers rotate / drift).
  const factor = distance / this.pinchOrigin.distance;
  if (factor !== 1) {
   const anchorWorld = this.screenToWorld(midScreen);
   this.zoomAt(factor, anchorWorld);
  }
  // Pan: screen delta between the original and current midpoint. After
  // the zoom-around-current-midpoint above this delta translates to
  // pure translation in world space.
  const dx = midScreen.x - this.pinchOrigin.midpointScreen.x;
  const dy = midScreen.y - this.pinchOrigin.midpointScreen.y;
  if (dx !== 0 || dy !== 0) {
   this.panBy({ x: dx, y: dy });
  }

  // Re-baseline so the next frame is incremental, not cumulative.
  this.pinchOrigin = {
   midpointWorld: this.screenToWorld(midScreen),
   distance,
   midpointScreen: midScreen,
  };
 }

 /**
  * Convert a point in the host element's CSS-pixel coordinate space into
  * world coordinates. Public so drop handlers (drag-from-palette, paste)
  * can map pointer positions back to scene space.
  */
 screenToWorld(point: Vec2): Vec2 {
  return matrix.applyToPoint(getScreenToWorld(this._scene.viewport), point);
 }

 private hitTest(worldPoint: Vec2): PressTarget {
  const zoom = this._scene.viewport.zoom;
  // 0. Annotation pin first — pins sit visually above everything,
  //  so a pointer-down that lands on a pin should drive the pin
  //  drag gesture regardless of what's underneath ().
  const annId = this.hitAnnotation(worldPoint);
  if (annId !== null) {
   const ann = this._scene.annotations.get(annId);
   if (ann) {
    return {
     kind: "annotation",
     id: annId,
     origin: getAnnotationWorldPosition(this._scene, ann),
    };
   }
  }
  // 1a. Group resize handles win when several shapes are selected,
  //   OR when a single group-typed shape is selected (which has
  //   no intrinsic bounds — children's union AABB serves as the
  //   resize frame). Aspect-locked groups restrict the hit set to
  //   the four corner handles.
  const useGroupHandles = this._selection.size > 1 || this.selectionIsAspectLocked();
  if (useGroupHandles) {
   const combined = this.combinedSelectionBounds();
   if (combined) {
    const aspectLocked = this.selectionIsAspectLocked();
    const handleSet = aspectLocked ? CORNER_HANDLES : ALL_HANDLES;
    const handle = hitHandle(
     worldPoint,
     combined,
     zoom,
     this.handleHitSlop,
     handleSet,
    );
    if (handle) {
     return { kind: "group-handle", handle, bounds: combined };
    }
   }
  }
  // 1b. Resize handles on a single selected shape — only when exactly
  //   one shape is selected. Multi-selection drops per-shape handles
  //   in favour of the group bbox handles above; otherwise users
  //   could resize one child outside the combined frame, which is
  //   surprising and inconsistent with the group outline.
  if (this._selection.size === 1) {
   for (const id of this._selection) {
    const shape = getShape(this._scene, id);
    if (!shape || !isResizable(shape)) continue;
    const bounds = getShapeWorldBounds(shape);
    const handle = hitHandle(worldPoint, bounds, zoom, this.handleHitSlop);
    if (handle) {
     return { kind: "handle", shapeId: id, handle, bounds };
    }
   }
  }
  // 2. Endpoint handles on a selected edge — only when an edge is
  //  selected. Threshold in screen pixels, converted to world.
  if (this._selectedEdge) {
   const edge = getEdge(this._scene, this._selectedEdge);
   if (edge) {
    const path = getEdgePath(this._scene, edge);
    if (path && path.length >= 2) {
     const handleR = this.edgeHandleHitSlop / zoom;
     const fromPoint = path[0]!;
     const toPoint = path[path.length - 1]!;
     if (distanceTo(worldPoint, fromPoint) <= handleR) {
      return { kind: "edge-endpoint", edgeId: edge.id, side: "from" };
     }
     if (distanceTo(worldPoint, toPoint) <= handleR) {
      return { kind: "edge-endpoint", edgeId: edge.id, side: "to" };
     }
    }
   }
  }
  // 3. Topmost shape under cursor. Skip shapes whose layer is locked
  //  OR whose own / ancestor `locked` flag is set (group lock
  //  propagation). When the hit shape is a child of a group,
  //  promote to the group root unless the user has "entered" that
  //  group via double-click.
  const shape = this.acceleratedShapeAt(worldPoint);
  if (shape && !this.isShapeInteractable(shape)) {
   // Hit landed on a non-interactable shape; treat as miss.
  } else if (shape) {
   const target = this.promoteToGroupRoot(shape);
   return { kind: "shape", id: target.id, bounds: getShapeWorldBounds(target) };
  }
  // 4. Edge body under cursor.
  const edge = findEdgeAt(this._scene, worldPoint, this.edgeHitThreshold / zoom);
  if (edge && !this.isLayerLocked(edge.layerId)) {
   return { kind: "edge", id: edge.id };
  }
  return { kind: "empty" };
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
  * Collect every shape that should be hidden this frame due to its
  * own `hidden` flag or that of any ancestor via `parentId`.
  * Returns `undefined` when nothing is hidden — keeps the
  * RenderSceneOptions payload empty in the common case so the
  * renderer's hot loop skips the `has()` check entirely.
  */
 private computeHiddenShapes(): ReadonlySet<ShapeId> | undefined {
  let out: Set<ShapeId> | null = null;
  for (const s of this._scene.shapes.values()) {
   if (isShapeHidden(this._scene, s)) {
    if (!out) out = new Set();
    out.add(s.id);
   }
  }
  return out ?? undefined;
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
  *  1. **Double-click on a grouped shape (not yet in isolation):**
  *   enter that group; select the raw inner shape (bypassing the
  *   group-root promotion that ran in hitTest).
  *  2. **Inside isolation, click on a non-descendant shape OR empty
  *   space:** exit isolation. Let the normal click then run so the
  *   newly clicked element / empty selection takes hold.
  *  3. **Inside isolation, double-click on the entered group's own
  *   child group:** drill another level deeper. (Implicit: same as
  *   case 1 but topGroupAncestor here returns the inner child
  *   group because the outer group is already entered.)
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
  //  1) text shape → open inline text editor (highest priority —
  //   double-clicking text in any editor means "edit the body");
  //  2) shape with a group ancestor → drill into that group.
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
  *  next group inward (one level deeper).
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
 private applyAnnotationMove(id: AnnotationId, delta: Vec2, origin: Vec2): void {
  const ann = this._scene.annotations.get(id);
  if (!ann) return;
  // Compute target position relative to whatever coordinate space
  // the annotation lives in. For shape-anchored, the stored
  // position is shape-local; for free, it's world. The delta is
  // always in world coords (the gesture machine emits world-space
  // deltas), but a translation maps 1:1 across the two spaces (no
  // rotation between shape-local and world here).
  const next: Vec2 = {
   x: origin.x + delta.x,
   y: origin.y + delta.y,
  };
  // For shape-anchored annotations, the stored field is the
  // *offset from the shape's world position*. Subtract the
  // shape's world position to translate world → local space.
  let storedPosition: Vec2 = next;
  if (ann.shapeId) {
   const shape = getShape(this._scene, ann.shapeId);
   if (shape) {
    storedPosition = { x: next.x - shape.position.x, y: next.y - shape.position.y };
   }
  }
  if (storedPosition.x === ann.position.x && storedPosition.y === ann.position.y) return;
  const r = updateAnnotation(this._scene, id, (a) => ({ ...a, position: storedPosition }));
  this._scene = r.scene;
  this.recordGesturePatch(r.patch);
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

 private applyMove(id: ShapeId, delta: Vec2, originalBounds: Bounds): void {
  const shape = getShape(this._scene, id);
  if (!shape) return;
  // originalBounds gives us the world-space position at press-down time;
  // we adjust the shape's `position` by the same delta.
  const localBounds = getShapeWorldBounds(shape);
  const offsetX = originalBounds.x - localBounds.x;
  const offsetY = originalBounds.y - localBounds.y;
  const next: Shape = {
   ...shape,
   position: {
    x: shape.position.x + delta.x + offsetX,
    y: shape.position.y + delta.y + offsetY,
   },
  };
  const patch: Patch = { kind: "shape", id, before: shape, after: next };
  this._scene = apply(this._scene, patch);
  this.recordGesturePatch(patch);
  this.notify();
 }

 /**
  * Translate every shape in the active group-drag snapshot by `delta`.
  * `delta` is the cumulative cursor displacement since press-down, so
  * each shape lands at `originPosition + delta` every frame — no
  * accumulator state inside the loop.
  *
  * All per-shape patches go through the gesture's open transaction so
  * the entire move collapses into a single undo step.
  */
 private applyGroupMove(delta: Vec2): void {
  if (!this.groupMoveOrigin) return;
  for (const [id, origin] of this.groupMoveOrigin) {
   const shape = getShape(this._scene, id);
   if (!shape) continue;
   const next: Shape = {
    ...shape,
    position: { x: origin.x + delta.x, y: origin.y + delta.y },
   };
   if (next.position.x === shape.position.x && next.position.y === shape.position.y) continue;
   const patch: Patch = { kind: "shape", id, before: shape, after: next };
   this._scene = apply(this._scene, patch);
   this.recordGesturePatch(patch);
  }
  this.notify();
 }

 /**
  * World-space AABB of the screen viewport, inflated by ~10% so a slow
  * pan does not flicker shapes near the edge. Returns `null` until the
  * host has resized the viewport at least once (size is 0×0).
  */
 private computeViewportWorld(): Bounds | null {
  const vp = this._scene.viewport;
  const w = vp.size.width;
  const h = vp.size.height;
  if (w <= 0 || h <= 0) return null;
  const s2w = getScreenToWorld(vp);
  const corners = [
   matrix.applyToPoint(s2w, { x: 0, y: 0 }),
   matrix.applyToPoint(s2w, { x: w, y: 0 }),
   matrix.applyToPoint(s2w, { x: 0, y: h }),
   matrix.applyToPoint(s2w, { x: w, y: h }),
  ];
  const bb = B.fromPoints(corners);
  return B.expand(bb, Math.max(bb.width, bb.height) * VIEWPORT_CULL_PADDING_RATIO);
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
  // Inflate by a couple pixels to cover anti-aliased stroke fuzz
  // around the geometry edges.
  return acc ? B.expand(acc, 4) : { x: -1e9, y: -1e9, width: 0, height: 0 };
 }

 private combinedSelectionBounds(): Bounds | null {
  let acc: Bounds | null = null;
  for (const id of this._selection) {
   const s = getShape(this._scene, id);
   if (!s) continue;
   // Group shapes carry no intrinsic geometry — substitute the
   // union AABB of their descendants so the combined bbox actually
   // reflects on-screen content.
   const b = s.type === "group" ? this.groupChildrenUnion(s.id) : getShapeWorldBounds(s);
   if (!b) continue;
   acc = acc ? B.union(acc, b) : b;
  }
  return acc;
 }

 /**
  * Union of every direct/indirect descendant's world AABB. `null`
  * for empty groups (which is the only failure mode — every leaf
  * has bounds). Mirrors the helper in overlay.ts kept private there;
  * duplicated here so editor doesn't depend on overlay internals.
  */
 private groupChildrenUnion(groupId: ShapeId): Bounds | null {
  let acc: Bounds | null = null;
  for (const s of this._scene.shapes.values()) {
   if (s.parentId !== groupId) continue;
   const inner = s.type === "group" ? this.groupChildrenUnion(s.id) : getShapeWorldBounds(s);
   if (!inner) continue;
   acc = acc ? B.union(acc, inner) : inner;
  }
  return acc;
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

 /**
  * Group resize — scale every snapshotted member proportionally based
  * on how `originalBounds` morphs into the new combined bounds. Each
  * member's *position offset* inside the original combined box scales
  * by the same factor; each member's `scale.{x,y}` is multiplied so
  * the visible size tracks the gesture. Mirroring (flip) is allowed
  * when the user drags past the opposite edge.
  *
  * All per-shape patches collapse into the gesture transaction → one
  * undo step.
  */
 private applyGroupResize(handle: HandleId, delta: Vec2, originalBounds: Bounds): void {
  if (!this.groupResizeOrigin) return;
  const next = resizeFromHandle(originalBounds, handle, delta);
  const minDim = 1;
  let sx = originalBounds.width > 0 ? next.width / originalBounds.width : 1;
  let sy = originalBounds.height > 0 ? next.height / originalBounds.height : 1;
  // Aspect-lock: groups can only scale uniformly. Use the larger
  // magnitude so the dragged corner moves along the diagonal toward
  // the cursor (modern-style); sign is preserved per-axis so a drag
  // past the anchor still mirrors the group uniformly.
  if (this.selectionIsAspectLocked()) {
   const locked = Math.max(Math.abs(sx), Math.abs(sy));
   sx = locked * (sx >= 0 ? 1 : -1);
   sy = locked * (sy >= 0 ? 1 : -1);
  }
  // Anchor for the scale = the unchanging corner / edge midpoint of the
  // original bounds (opposite to the dragged handle).
  const ax = handle.includes("w")
   ? originalBounds.x + originalBounds.width
   : handle.includes("e")
    ? originalBounds.x
    : originalBounds.x;
  const ay = handle.includes("n")
   ? originalBounds.y + originalBounds.height
   : handle.includes("s")
    ? originalBounds.y
    : originalBounds.y;

  for (const [id, origin] of this.groupResizeOrigin.shapes) {
   const shape = getShape(this._scene, id);
   if (!shape) continue;
   // Translate origin position around the anchor, then scale, then
   // translate back. Same math for x and y independently.
   const newPx = ax + (origin.position.x - ax) * sx;
   const newPy = ay + (origin.position.y - ay) * sy;

   // Prefer changing the box's intrinsic width/height for shapes
   // that have one — that way the stroke and other style fields
   // stay at their authored thickness instead of being scaled by
   // the matrix transform. Shapes without a width/height
   // (polygons, paths, text, brush, group) still ride the scale
   // multiplier — that's the only handle the renderer has on
   // their size.
   if (hasWidthHeight(shape)) {
    const newWidth = origin.bounds.width * sx;
    const newHeight = origin.bounds.height * sy;
    if (Math.abs(newWidth) < minDim || Math.abs(newHeight) < minDim) continue;
    const nextShape: Shape = {
     ...shape,
     position: { x: newPx, y: newPy },
     // Pin scale at 1 / -1 so flipping past the anchor still
     // mirrors the shape. The sign comes from the resize math —
     // negative width / height means the user dragged past the
     // opposite edge.
     scale: {
      x: newWidth >= 0 ? 1 : -1,
      y: newHeight >= 0 ? 1 : -1,
     },
     width: Math.abs(newWidth),
     height: Math.abs(newHeight),
    } as Shape;
    const patch: Patch = { kind: "shape", id, before: shape, after: nextShape };
    this._scene = apply(this._scene, patch);
    this.recordGesturePatch(patch);
    continue;
   }

   const newScaleX = origin.scale.x * sx;
   const newScaleY = origin.scale.y * sy;
   if (Math.abs(newScaleX) < minDim / Math.max(1, origin.bounds.width)) continue;
   if (Math.abs(newScaleY) < minDim / Math.max(1, origin.bounds.height)) continue;
   const nextShape: Shape = {
    ...shape,
    position: { x: newPx, y: newPy },
    scale: { x: newScaleX, y: newScaleY },
   };
   const patch: Patch = { kind: "shape", id, before: shape, after: nextShape };
   this._scene = apply(this._scene, patch);
   this.recordGesturePatch(patch);
  }
  this.notify();
 }

 private applyResize(id: ShapeId, handle: HandleId, delta: Vec2, originalBounds: Bounds): void {
  const shape = getShape(this._scene, id);
  if (!shape) return;
  // Built-in shapes with a width/height box: rectangle, ellipse, image, template.
  if (!hasWidthHeight(shape)) return;

  const raw = resizeFromHandle(originalBounds, handle, delta);
  const intermediate = applyResizeConstraints(originalBounds, raw, handle, shape);
  // If the shape is a container, never let the drop-zone shrink past
  // the union AABB of its children. Anchored to the opposite edge
  // so the dragged handle still controls direction — the shape only
  // refuses to go smaller than the children require.
  const constrained = this.clampContainerToChildren(shape, intermediate, handle);

  // `constrained` is in world units (originalBounds was world AABB).
  // For shapes with a width/height field, persist that directly and
  // pin `scale` to 1 — otherwise a non-1 scale carried over from a
  // previous group resize would multiply the new width and the
  // shape would jump out from under the cursor on the next gesture.
  const next: Shape = {
   ...shape,
   position: { x: constrained.x, y: constrained.y },
   scale: { x: 1, y: 1 },
   width: constrained.width,
   height: constrained.height,
  } as Shape;
  const patch: Patch = { kind: "shape", id, before: shape, after: next };
  this._scene = apply(this._scene, patch);
  this.recordGesturePatch(patch);
  this.notify();
 }

 private applyCreate(kind: "rect" | "ellipse" | "frame", bounds: Bounds): void {
  const id = castShapeId(`shape-${++this.nextId}-${Date.now().toString(36)}`);
  const layerId = this._activeLayerId;
  const orders = Array.from(this._scene.shapes.values())
   .filter((s) => s.layerId === layerId)
   .map((s) => s.order);
  // Frames belong at the BOTTOM of their layer so the children
  // they contain (drawn after = on top) still receive clicks.
  // Other shapes go to the top of the stack as usual.
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
  let shape: Shape;
  if (kind === "rect") {
   shape = {
    ...common,
    type: "rectangle",
    style: { fill: "#cfe1ff", stroke: "#1a40b0", strokeWidth: 2 },
   };
  } else if (kind === "ellipse") {
   shape = {
    ...common,
    type: "ellipse",
    style: { fill: "#ffd6d6", stroke: "#a01a1a", strokeWidth: 2 },
   };
  } else {
   // Frame — empty style (renderer hard-codes the dashed look),
   // auto-numbered name. Created at the bbox of the drag.
   shape = {
    ...common,
    type: "frame",
    style: {},
    name: this.nextFrameName(),
   };
  }
  const result = addShape(this._scene, shape);
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

 /**
  * Build an `Edge` from a draw-edge gesture and commit it as a single
  * history record. Endpoints are landed on `center` of the source /
  * target shape when present and fall back to free `point`
  * endpoints otherwise.
  */
 private applyCreateEdge(emit: Extract<InteractionEmit, { type: "CREATE_EDGE" }>): void {
  const from = this.snapEdgeEndpoint(emit.fromShape, emit.fromPoint);
  const to = this.snapEdgeEndpoint(emit.toShape, emit.toPoint);

  const layerId = this._activeLayerId;
  const order = orderForTop(
   Array.from(this._scene.edges.values())
    .filter((e) => e.layerId === layerId)
    .map((e) => e.order),
  );

  const id = castEdgeId(`edge-${++this.nextId}-${Date.now().toString(36)}`);
  const edge: Edge = {
   id,
   layerId,
   from,
   to,
   order,
   style: { stroke: "#444", strokeWidth: 1.5 },
   arrowheads: { to: "triangle" },
  };
  const result = addEdge(this._scene, edge);
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

 /**
  * Select every shape whose world-bounds intersect the lasso rectangle.
  * `mode: "replace"` swaps the selection wholesale; `"add"` extends it
  * (Shift / Cmd lasso).
  */
 private applySelectByBounds(bounds: Bounds, mode: "replace" | "add"): void {
  const hits = getShapesCoveredByBounds(this._scene, bounds, LASSO_COVERAGE_THRESHOLD);
  let next: Selection.Selection = mode === "replace" ? Selection.EMPTY : this._selection;
  for (const shape of hits) {
   // Skip shapes on locked layers — lock prevents selection / drag.
   if (this.isLayerLocked(shape.layerId)) continue;
   next = Selection.add(next, shape.id);
  }
  if (this._selectedEdge !== null) this._selectedEdge = null;
  if (Selection.equals(next, this._selection)) {
   this.notify();
   return;
  }
  this._selection = next;
  this.notify();
 }

 /**
  * Live-preview variant of `applySelectByBounds` for in-progress
  * lassos. Same hit-test rule, but the starting set comes from the
  * captured `lassoBaseSelection` snapshot — that way `replace` mode
  * shrinks the selection to whatever the box currently covers
  * (instead of accumulating since press-down), and `add` mode keeps
  * the user's pre-existing picks intact.
  */
 private applyLassoLiveSelection(bounds: Bounds, mode: "replace" | "add"): void {
  const base = this.lassoBaseSelection ?? Selection.EMPTY;
  let next: Selection.Selection = mode === "replace" ? Selection.EMPTY : base;
  const hits = getShapesCoveredByBounds(this._scene, bounds, LASSO_COVERAGE_THRESHOLD);
  for (const shape of hits) {
   if (this.isLayerLocked(shape.layerId)) continue;
   next = Selection.add(next, shape.id);
  }
  if (Selection.equals(next, this._selection)) return;
  if (this._selectedEdge !== null) this._selectedEdge = null;
  this._selection = next;
 }

 private applyEdgeEndpointUpdate(
  emit: Extract<InteractionEmit, { type: "UPDATE_EDGE_ENDPOINT" }>,
 ): void {
  const edge = getEdge(this._scene, emit.edgeId);
  if (!edge) {
   this.edgeEndpointDrag = null;
   this.notify();
   return;
  }
  const newEndpoint = this.snapEdgeEndpoint(emit.toShape, emit.toPoint);
  const result = updateEdge(this._scene, edge.id, (e) => ({ ...e, [emit.side]: newEndpoint }));
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

 private applyEdgePreview(fromShape: ShapeId | null, fromPoint: Vec2, toPoint: Vec2): void {
  // When the gesture started on a shape, snap the visible start to the
  // shape's nearest port relative to the press-down point. The final
  // edge will use the same snap target on the to-side, so the preview
  // already shows the user where the connector will land.
  let from = fromPoint;
  if (fromShape) {
   const shape = getShape(this._scene, fromShape);
   if (shape) from = findNearestAnchor(shape, fromPoint, snapExcludedAnchors(shape)).world;
  }
  let to = toPoint;
  // If the pointer is currently hovering a shape, snap the visible end
  // to its nearest port too. The host has no way to know the hovered
  // shape mid-drag (no PressTarget pushed in POINTER_MOVE) — but we can
  // simply hit-test the scene here.
  const hovered = getShapeAt(this._scene, toPoint);
  if (hovered) {
   to = findNearestAnchor(hovered, toPoint, snapExcludedAnchors(hovered)).world;
  }
  this.edgePreview = { from, to };
  this.notify();
 }

 /**
  * Open a gesture transaction on the first drag-emitted patch, then add
  * subsequent patches to it. POINTER_UP commits it as one history record.
  */
 private recordGesturePatch(patch: Patch): void {
  this.gestureTx ??= this._history.transaction();
  this.gestureTx.add(patch);
 }

 private commitGesture(): void {
  this.groupMoveOrigin = null;
  this.groupResizeOrigin = null;
  this.dragShapeId = null;
  if (this.containerHover !== null) {
   this.containerHover = null;
   this.notify();
  }
  if (!this.gestureTx) return;
  this.gestureTx.commit();
  this.gestureTx = null;
 }

 /**
  * Defensive cleanup invoked by public commands (paste, etc.) that
  * open their own history transaction. A real gesture-in-flight
  * gets committed (preserving user work); a leaked stale tx — one
  * that survived an earlier exception — gets cancelled. Either way
  * the next `transaction()` call lands on a clean slot.
  *
  * Without this, pressing Cmd+V mid-drag throws "A transaction is
  * already open" because the gestureTx hasn't been committed yet.
  */
 private finalizeOpenGestureTx(): void {
  if (!this.gestureTx) return;
  try {
   this.gestureTx.commit();
  } catch {
   this.gestureTx.cancel();
  }
  this.gestureTx = null;
 }

 /**
  * End-of-drag container hookup. Runs after the state machine has
  * received POINTER_UP but before the gesture transaction commits,
  * so reparent + auto-grow land in a single undo step with the drag.
  *
  * Rules:
  * - If the shape hovered over a container and is not yet its child →
  *  set `parentId`. If the shape exceeds the dropZone bounds,
  *  grow the zone (expand container size).
  * - If the shape was a child of something but the final world bounds
  *  no longer intersect the parent's drop-zone — clear `parentId` (drag-out).
  * - Cycles (container into its own descendant) are prevented
  *  by the `containerHover` pipeline above — the exclude set blocks them.
  */
 private applyContainerDrop(worldPoint: Vec2): void {
  void worldPoint;
  const dragId = this.dragShapeId;
  if (!dragId) return;
  const shape = getShape(this._scene, dragId);
  if (!shape) return;
  // Containers themselves can also be dragged into other
  // containers (nesting); cycle-check is already performed in the hover-pipeline.

  const hover = this.containerHover;
  if (hover && hover.id !== shape.parentId) {
   // Reparent into hovered container. Bump the dropped shape to
   // top z-order of its layer so it lands ABOVE the container's
   // visual body (otherwise the container's fill obscures it).
   const tx = this.beginOrAttachGesture();
   const topOrder = orderForTop(
    [...this._scene.shapes.values()]
     .filter((s) => s.layerId === shape.layerId && s.id !== dragId)
     .map((s) => s.order),
   );
   const r = updateShape(this._scene, dragId, (s) => ({
    ...s,
    parentId: hover.id,
    order: topOrder,
   }));
   this._scene = r.scene;
   tx.add(r.patch);
   this.maybeGrowContainer(hover.id, dragId);
   return;
  }

  if (hover && hover.id === shape.parentId) {
   // Drag-within: cursor still over the same parent. If the child's
   // bounds overflow the drop-zone, grow the parent to fit.
   this.maybeGrowContainer(shape.parentId, dragId);
   return;
  }

  if (shape.parentId) {
   const parent = getShape(this._scene, shape.parentId);
   // Group parents have no drop-zone — they're logical wrappers,
   // not spatial containers. The drag-out / coverage logic is for
   // proper containers (swimlane, frame, template); a group child
   // must stay parented to its group regardless of its world bounds.
   if (parent?.type === "group") return;
   // hover = null: cursor left the parent's zone, but the child
   // itself may still be mostly inside. Coverage check decides:
   //  ≥ CONTAINER_KEEP_THRESHOLD → keep parent + grow zone to fit.
   //  < threshold → un-parent (drag-out).
   const parentZone = parent ? getDropZoneWorld(parent) : null;
   const childBounds = getShapeWorldBounds(shape);
   const coverage = parentZone ? coverageRatio(childBounds, parentZone) : 0;
   if (parentZone && coverage >= CONTAINER_KEEP_THRESHOLD) {
    this.maybeGrowContainer(shape.parentId, dragId);
    return;
   }
   const tx = this.beginOrAttachGesture();
   const r = updateShape(this._scene, dragId, (s) => {
    const next: Shape = { ...s };
    delete (next as { parentId?: ShapeId }).parentId;
    return next;
   });
   this._scene = r.scene;
   tx.add(r.patch);
  }
 }

 /**
  * If `childId` no longer fits inside `containerId`'s drop-zone,
  * expand the zone + the container's outer size. Single patch added
  * to the running gesture. Skips no-op cases (already fits, container
  * has no width/height field).
  */
 private maybeGrowContainer(containerId: ShapeId, childId: ShapeId): void {
  const container = getShape(this._scene, containerId);
  const child = getShape(this._scene, childId);
  if (!container || !child) return;
  const spec = getContainerSpec(container);
  if (!spec) return;
  const childWorld = getShapeWorldBounds(child);
  const expanded = expandDropZoneToFit(container, childWorld);
  if (!expanded) return;

  const containerHasBox =
   container.type === "rectangle" ||
   container.type === "ellipse" ||
   container.type === "image" ||
   container.type === "template";
  const tx = this.beginOrAttachGesture();

  if (containerHasBox) {
   const widthHeight = container as Shape & { width: number; height: number };
   const sized = containerSizeForZone(
    { width: widthHeight.width, height: widthHeight.height, spec },
    expanded,
   );
   const r = updateShape(this._scene, containerId, (s) => ({
    ...s,
    position: {
     x: s.position.x + sized.positionOffset.x,
     y: s.position.y + sized.positionOffset.y,
    },
    width: sized.width,
    height: sized.height,
    metadata: {
     ...(s.metadata ?? {}),
     container: { ...spec, dropZone: expanded },
    },
   }) as Shape);
   this._scene = r.scene;
   tx.add(r.patch);
   // Children are stored in absolute world coords — translating the
   // container's `position` does NOT visually move them, so no
   // compensating patch is needed. (Earlier code shifted the child
   // and pushed it off-screen.)
  } else {
   const r = updateShape(this._scene, containerId, (s) => ({
    ...s,
    metadata: {
     ...(s.metadata ?? {}),
     container: { ...spec, dropZone: expanded },
    },
   }));
   this._scene = r.scene;
   tx.add(r.patch);
  }
 }

 /**
  * Floor the proposed container bounds to whatever is required to keep
  * every child fully inside the drop-zone. The expansion is applied at
  * the edges touched by `handle`, so the dragged corner / side keeps
  * controlling direction — the shape just refuses to go smaller than
  * the children mandate.
  *
  * Works for any shape with a `ContainerSpec` (template-driven or
  * static metadata). Returns `raw` unchanged when the shape has no
  * children or isn't a container.
  */
 private clampContainerToChildren(shape: Shape, raw: Bounds, handle: HandleId): Bounds {
  if (!isContainer(shape) || !hasWidthHeight(shape)) return raw;
  const childrenBox = this.childrenWorldUnion(shape.id);
  if (!childrenBox) return raw;
  // Compose a hypothetical container with the proposed bounds, then
  // ask the resolver where the drop-zone lands at that size. Chrome
  // (header / margin / padding) stays constant across resize, so a
  // single-pass expansion is sound for typical templates.
  const hypothetical = {
   ...shape,
   position: { x: raw.x, y: raw.y },
   width: raw.width,
   height: raw.height,
  } as Shape;
  const dropZoneWorld = getDropZoneWorld(hypothetical);
  if (!dropZoneWorld) return raw;

  let { x, y, width, height } = raw;
  const dx0 = dropZoneWorld.x;
  const dy0 = dropZoneWorld.y;
  const dx1 = dropZoneWorld.x + dropZoneWorld.width;
  const dy1 = dropZoneWorld.y + dropZoneWorld.height;
  const cx0 = childrenBox.x;
  const cy0 = childrenBox.y;
  const cx1 = childrenBox.x + childrenBox.width;
  const cy1 = childrenBox.y + childrenBox.height;

  // East side dragged: extend width rightward to cover children.
  if (handle.includes("e") && dx1 < cx1) {
   width += cx1 - dx1;
  }
  // South side dragged: extend height downward.
  if (handle.includes("s") && dy1 < cy1) {
   height += cy1 - dy1;
  }
  // West side dragged: position can't move past child's left edge.
  // Shift x back and re-extend width to keep the right edge anchored.
  if (handle.includes("w") && dx0 > cx0) {
   const shift = dx0 - cx0;
   x -= shift;
   width += shift;
  }
  // North side dragged: same idea on the vertical axis.
  if (handle.includes("n") && dy0 > cy0) {
   const shift = dy0 - cy0;
   y -= shift;
   height += shift;
  }
  return { x, y, width, height };
 }

 /**
  * Union of every direct child's world-space AABB. Returns `null` when
  * the container has no children. Recursive descent isn't needed — we
  * only constrain to direct children because container resize doesn't
  * cascade into nested containers (the inner one self-constrains via
  * its own `clampContainerToChildren` call).
  */
 private childrenWorldUnion(containerId: ShapeId): Bounds | null {
  let acc: Bounds | null = null;
  for (const s of this._scene.shapes.values()) {
   if (s.parentId !== containerId) continue;
   const b = getShapeWorldBounds(s);
   acc = acc ? B.union(acc, b) : b;
  }
  return acc;
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

 private cancelGesture(): void {
  this.groupMoveOrigin = null;
  this.groupResizeOrigin = null;
  if (!this.gestureTx) return;
  this.gestureTx.cancel();
  this.gestureTx = null;
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
  for (const fn of this.listeners) fn();
  this.autoCompactScheduler.schedule();
  this.autoLayoutScheduler.schedule();
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

 /**
  * Children-set fingerprint used for auto-layout dirty detection.
  * Sorted ids joined by comma — cheap to compute, stable under
  * pure position edits (we want those), changes under add / remove /
  * reparent (we want to react to those).
  */
 private render(): void {
  // Background layer (grid) — when the host gave us a dedicated target.
  // Otherwise the grid lives on mainTarget *before* shapes are drawn,
  // so renderScene's clear takes care of it.
  if (this.backgroundTarget) {
   renderGrid(this._scene, this.backgroundTarget);
  }
  // World-space viewport rect — used by `renderScene` to skip off-screen
  // shapes. Computed by mapping the screen viewport corners through the
  // inverse projection. Slightly inflated so geometry near the edge
  // does not flicker during pan.
  const viewportWorld = this.computeViewportWorld();
  const dirtyWorld = this.computeDirtyWorld();
  const dimShapes = this._enteredGroup
   ? this.computeDimShapes(this._enteredGroup)
   : undefined;
  const hideShapes = this.computeHiddenShapes();

  if (this.tileComposeFn && viewportWorld) {
   // Tile-cache path: clear main once, then composite cached
   // tiles. Dim / hide sets aren't honoured by the tile cache
   // yet (would require a separate pass) — opt-in path is
   // intended for very-large static scenes where neither
   // typically applies.
   this.mainTarget.clear();
   this.tileComposeFn(this._scene, this.mainTarget, {
    viewport: viewportWorld,
    changedShapes: this.tileDirtyShapes,
    zoomBucket:
     this._scene.viewport.zoom > 0
      ? 2 ** Math.round(Math.log2(this._scene.viewport.zoom))
      : 1,
   });
   this.tileDirtyShapes = new Map();
   renderEdges(this._scene, this.mainTarget, {
    ...(viewportWorld ? { viewportWorld } : {}),
   });
  } else {
   // For very large scenes share the same SpatialGrid the hit-test
   // path already maintains — `renderScene` uses it to skip the
   // per-shape AABB cull on shapes outside the viewport. Free win
   // because the grid is already built / cached for hit-tests.
   const sharedIndex =
    this._scene.shapes.size >= LARGE_SCENE_HIT_THRESHOLD
     ? this.ensureSpatialIndex()
     : null;
   renderScene(this._scene, this.mainTarget, {
    ...(viewportWorld ? { viewport: viewportWorld } : {}),
    ...(dirtyWorld ? { dirtyWorld } : {}),
    boundsCache: this.boundsCache,
    lod: DEFAULT_LOD,
    ...(dimShapes ? { dimShapes, dimOpacity: ISOLATION_DIM_OPACITY } : {}),
    ...(hideShapes ? { hideShapes } : {}),
    ...(sharedIndex ? { spatialIndex: sharedIndex } : {}),
   });
   renderEdges(this._scene, this.mainTarget, {
    ...(viewportWorld ? { viewportWorld } : {}),
    ...(dirtyWorld ? { dirtyWorld } : {}),
   });
  }
  this.lastRenderedScene = this._scene;
  this.lastRenderedEnteredGroup = this._enteredGroup;
  const overlayOpts: Parameters<typeof renderOverlay>[3] = {};
  // Lasso and rect-draw share the same dashed-rect visual. Both can't
  // run simultaneously (different gestures), so a single `drawingPreview`
  // slot covers both.
  if (this.lassoPreview) overlayOpts.drawingPreview = this.lassoPreview;
  else if (this.drawingPreview) overlayOpts.drawingPreview = this.drawingPreview;
  if (this.edgePreview) overlayOpts.edgePreview = this.edgePreview;
  if (this.hoveredEdgeTarget) {
   const shape = getShape(this._scene, this.hoveredEdgeTarget.shapeId);
   if (shape) {
    const excluded = snapExcludedAnchors(shape);
    const names = [...listAnchorsLocal(shape).keys()].filter((n) => !excluded.has(n));
    const worldPoints = names.map((name) => getAnchorWorld(shape, { kind: "named", name }));
    const activeIndex =
     this.hoveredEdgeTarget.activeAnchor !== null
      ? names.indexOf(this.hoveredEdgeTarget.activeAnchor)
      : -1;
    overlayOpts.ports = {
     worldPoints,
     ...(activeIndex >= 0 ? { activeIndex } : {}),
    };
   }
  }
  // Group-handle overlay: multi-selection OR a single group-typed
  // shape. Aspect-locked groups also flag the overlay so it draws
  // only the four corner handles.
  if (this._selection.size > 1 || this.selectionIsAspectLocked()) {
   const combined = this.combinedSelectionBounds();
   if (combined) overlayOpts.groupBounds = combined;
   if (this.selectionIsAspectLocked()) overlayOpts.groupAspectLocked = true;
  }
  if (this.containerHover) {
   overlayOpts.containerDropZone = this.containerHover.dropZone;
  }
  if (this.brushStroke) {
   overlayOpts.brushPreview = {
    origin: this.brushStroke.origin,
    points: this.brushStroke.points,
    fill: "#222",
   };
  }
  if (this._selectedEdge) {
   const edge = getEdge(this._scene, this._selectedEdge);
   if (edge) {
    const path = getEdgePath(this._scene, edge);
    if (path && path.length >= 2) {
     // Endpoints in their stored positions; the dragged side jumps to
     // the cursor so the user sees where the rebind will land. The
     // edge itself stays on its old path until release.
     let from = path[0]!;
     let to = path[path.length - 1]!;
     if (this.edgeEndpointDrag?.edgeId === this._selectedEdge) {
      if (this.edgeEndpointDrag.side === "from") from = this.edgeEndpointDrag.toPoint;
      else to = this.edgeEndpointDrag.toPoint;
     }
     overlayOpts.edgeSelection = { from, to };
    }
   }
  }
  if (this._peerCursors.length > 0) overlayOpts.peerCursors = this._peerCursors;
  if (this._peerSelections.length > 0) overlayOpts.peerSelections = this._peerSelections;
  if (this._scene.annotations.size > 0) {
   overlayOpts.annotations = [...this._scene.annotations.values()];
   overlayOpts.selectedAnnotation = this._selectedAnnotation;
  }
  renderOverlay(this._scene, this._selection, this.overlayTarget, overlayOpts);
 }
}

const distanceTo = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Fraction of `child`'s area that lies inside `zone`. Returns 0 when
 * either bbox is degenerate or they don't intersect. Used by the
 * container drop handler to decide between "child still belongs to
 * the lane" and "user dragged it out".
 */
const coverageRatio = (child: Bounds, zone: Bounds): number => {
 const area = child.width * child.height;
 if (area <= 0) return 0;
 const ix = Math.max(child.x, zone.x);
 const iy = Math.max(child.y, zone.y);
 const ix2 = Math.min(child.x + child.width, zone.x + zone.width);
 const iy2 = Math.min(child.y + child.height, zone.y + zone.height);
 const iw = ix2 - ix;
 const ih = iy2 - iy;
 if (iw <= 0 || ih <= 0) return 0;
 return (iw * ih) / area;
};

/**
 * True when the shape's geometry is parametrised by `width` / `height`
 * fields the editor can rewrite directly during a resize. Anything
 * else (paths, polygons, brush strokes, text, groups) has to ride the
 * `scale` multiplier instead.
 */
const hasWidthHeight = (s: Shape): s is Shape & { width: number; height: number } =>
 s.type === "rectangle" ||
 s.type === "ellipse" ||
 s.type === "image" ||
 s.type === "template";

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

const describeNudge = (delta: Vec2, count: number): string => {
 const parts: string[] = [];
 if (delta.x > 0) parts.push(`${delta.x} px right`);
 else if (delta.x < 0) parts.push(`${-delta.x} px left`);
 if (delta.y > 0) parts.push(`${delta.y} px down`);
 else if (delta.y < 0) parts.push(`${-delta.y} px up`);
 const subject = count === 1 ? "shape" : `${count} shapes`;
 return `Moved ${subject} ${parts.join(" and ")}`;
};

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

// Local helper duplicated from `handle.ts` so this file does not introduce a
// circular import. Equivalent to `handle.resizeBounds` for the case where the
// shape's local AABB starts at (0, 0) — we apply the delta directly to the
// world bounds we captured at press-down.
const resizeFromHandle = (b: Bounds, handle: HandleId, delta: Vec2): Bounds => {
 let x = b.x;
 let y = b.y;
 let width = b.width;
 let height = b.height;
 switch (handle) {
  case "nw":
   x += delta.x;
   y += delta.y;
   width -= delta.x;
   height -= delta.y;
   break;
  case "n":
   y += delta.y;
   height -= delta.y;
   break;
  case "ne":
   y += delta.y;
   width += delta.x;
   height -= delta.y;
   break;
  case "e":
   width += delta.x;
   break;
  case "se":
   width += delta.x;
   height += delta.y;
   break;
  case "s":
   height += delta.y;
   break;
  case "sw":
   x += delta.x;
   width -= delta.x;
   height += delta.y;
   break;
  case "w":
   x += delta.x;
   width -= delta.x;
   break;
 }
 return { x, y, width, height };
};

interface ResizeConstraints {
 readonly minWidth?: number;
 readonly minHeight?: number;
 readonly maxWidth?: number;
 readonly maxHeight?: number;
 readonly noFlip?: boolean;
}

/**
 * Apply min/max + no-flip constraints to a freshly-computed `raw` bounds.
 *
 * The constraints anchor on the edge **opposite** the dragged handle —
 * dragging `se` keeps `(originalBounds.x, originalBounds.y)` fixed and
 * adjusts width/height; dragging `nw` keeps the bottom-right corner. This
 * matches the visual expectation that the opposite edge stays put.
 *
 * `noFlip` forces width/height to stay non-negative (or above `minWidth` /
 * `minHeight` if set). Without it, dragging past the opposite edge mirrors
 * the shape — restored by `bounds.normalize`.
 */
const applyResizeConstraints = (
 original: Bounds,
 raw: Bounds,
 handle: HandleId,
 constraints: ResizeConstraints,
): Bounds => {
 // Floor for width/height. `noFlip` clamps to the explicit min, or 0 if no
 // min is set; otherwise the floor is just `minWidth` / `minHeight` (which
 // may be undefined, meaning "no floor").
 const minW = constraints.noFlip ? (constraints.minWidth ?? 0) : constraints.minWidth;
 const minH = constraints.noFlip ? (constraints.minHeight ?? 0) : constraints.minHeight;
 const maxW = constraints.maxWidth;
 const maxH = constraints.maxHeight;

 const clamp = (v: number, lo: number | undefined, hi: number | undefined): number => {
  let r = v;
  if (lo !== undefined && r < lo) r = lo;
  if (hi !== undefined && r > hi) r = hi;
  return r;
 };

 // When `noFlip` is true, clamp width/height first (preserving sign by working
 // with non-negative values), then re-derive x/y so the anchor edge stays put.
 // When `noFlip` is false, raw width/height may go negative; we still apply
 // `maxWidth`/`maxHeight` by clamping the absolute value, then keep the raw
 // sign so `bounds.normalize` later flips correctly.

 const left = handleAffectsLeft(handle);
 const right = handleAffectsRight(handle);
 const top = handleAffectsTop(handle);
 const bottom = handleAffectsBottom(handle);

 // X / width
 let x = raw.x;
 let width = raw.width;
 if (constraints.noFlip) {
  width = clamp(width, minW, maxW);
 } else if (maxW !== undefined && Math.abs(width) > maxW) {
  width = width < 0 ? -maxW : maxW;
 } else if (minW !== undefined && Math.abs(width) < minW && width !== 0) {
  width = width < 0 ? -minW : minW;
 }
 if (left && !right) {
  // Anchor right edge: x = original.right - width
  x = original.x + original.width - width;
 } else if (right && !left) {
  x = original.x;
 }

 // Y / height
 let y = raw.y;
 let height = raw.height;
 if (constraints.noFlip) {
  height = clamp(height, minH, maxH);
 } else if (maxH !== undefined && Math.abs(height) > maxH) {
  height = height < 0 ? -maxH : maxH;
 } else if (minH !== undefined && Math.abs(height) < minH && height !== 0) {
  height = height < 0 ? -minH : minH;
 }
 if (top && !bottom) {
  y = original.y + original.height - height;
 } else if (bottom && !top) {
  y = original.y;
 }

 const out = { x, y, width, height };
 return constraints.noFlip ? out : bounds_normalize(out);
};

const bounds_normalize = (b: Bounds): Bounds => B.normalize(b);

const handleAffectsLeft = (h: HandleId): boolean => h === "nw" || h === "w" || h === "sw";
const handleAffectsRight = (h: HandleId): boolean => h === "ne" || h === "e" || h === "se";
const handleAffectsTop = (h: HandleId): boolean => h === "nw" || h === "n" || h === "ne";
const handleAffectsBottom = (h: HandleId): boolean => h === "sw" || h === "s" || h === "se";
