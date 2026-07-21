import { createActor, type Actor } from "xstate";
import { createEmitter, type Emitter } from "@oh-just-another/events";
import type { Bounds, FileId, ElementId, Vec2 } from "@oh-just-another/types";
import { elementId as castElementId } from "@oh-just-another/types";
import type { SpatialGrid } from "@oh-just-another/scene";
import {
  addElement,
  getLinkCurvePoints,
  linkLabelAnchor,
  addLink,
  endpointElementId,
  anchorSnapper,
  apply,
  buildSpatialIndex,
  isElementHidden,
  isElementLocked,
  runAutoLayout,
  DEFAULT_LAYER_ID,
  routeElbowLink,
  routeElbowPreview,
  getLink,
  getLinkPath,
  getElement,
  getElementAt,
  getElementAtIndexed,
  getElementLocalBounds,
  localToWorld,
  worldToLocal,
  isFrame,
  isGroup,
  isText,
  isImage,
  isBrush,
  brushBodyColor,
  getElementWorldBounds,
  setTextMeasurer,
  getScreenToWorld,
  gridSnapper,
  type FractionalIndex,
  outlineSnapper,
  SnapEngine,
  invert,
  type BrushPoint,
  updateLink,
  updateElement,
  isAnchorRef,
  type Link,
  type LinkEndpoint,
  type Patch,
  type Scene,
  type Element,
  type GridStyle,
  type ImageCrop,
  type Style,
  type TextStyle,
  isSnapToGridEnabled,
  resolveSnapSpacing,
} from "@oh-just-another/scene";
import {
  layerId as castLayerId,
  type AnnotationId,
  type Color,
  type CommentId,
  type LinkId,
  type LayerId,
} from "@oh-just-another/types";
import { bounds as B, matrix, vec2 } from "@oh-just-another/math";
import {
  onAnimationContentReady,
  setActiveRasterizer,
  setActiveTextShaper,
  ElementCache,
  type RenderTarget,
  type TextShaper,
  type Rasterizer,
} from "@oh-just-another/renderer-core";
import {
  History,
  type HistoryOptions,
  type HistoryProvider,
  type TransactionHandle,
} from "@oh-just-another/history";
import { DEFAULT_LINK_ROUTING } from "./constants.js";
import {
  FileDropRegistry,
  type FileDropContext,
  type FileDropHandler,
} from "./features/file-drop.js";
import { imageFileDropHandler, videoFileDropHandler } from "./features/built-in-handlers.js";
import {
  computeDimElements as computeDimElementsHelper,
  isDescendantOfGroup as isDescendantOfGroupHelper,
  pickDrillTarget as pickDrillTargetHelper,
  promoteToGroupRoot as promoteToGroupRootHelper,
  topGroupAncestor as topGroupAncestorHelper,
} from "./helpers/group-helpers.js";
import {
  assignFrameMembers as assignFrameMembersHelper,
  nextFrameName as nextFrameNameHelper,
  reconcileFrameMembership as reconcileFrameMembershipHelper,
} from "./helpers/frame-helpers.js";
import { AutoCompactScheduler } from "./helpers/auto-compact.js";
import { AutoLayoutScheduler } from "./helpers/auto-layout-scheduler.js";
import {
  DEFAULT_SNAP_THRESHOLD,
  LINK_ENDPOINT_HANDLE_RADIUS,
  LINK_HIT_THRESHOLD,
  LARGE_SCENE_HIT_THRESHOLD,
  TOUCH_LINK_HANDLE_HIT_SLOP,
  TOUCH_LINK_HIT_THRESHOLD,
  TOUCH_HANDLE_HIT_SLOP,
  ANCHOR_START_HIT_SLOP,
  ANCHOR_DOT_CLICK_RADIUS,
  TOUCH_ANCHOR_START_HIT_SLOP,
  TOUCH_ANCHOR_DOT_CLICK_RADIUS,
  DOUBLE_CLICK_MS,
  DOUBLE_CLICK_TOLERANCE_PX,
  WHEEL_ZOOM_STEP,
  ROTATE_SNAP_RADIANS,
  CROP_HANDLE_HIT_RADIUS,
  FLOWCHART_MAX_SIBLINGS,
  ERASER_TRAIL_TTL_MS,
} from "./constants.js";
import { HANDLE_HIT_SLOP } from "./interaction/handle.js";
import { req } from "./helpers/util.js";
import {
  interactionMachine,
  type InteractionContext,
  type InteractionEmit,
  type PressTarget,
} from "./interaction/machine.js";
import type { HandleId } from "./interaction/handle.js";
import type { ActiveTool, Mode } from "./interaction/modes.js";
import { DEFAULT_MODE } from "./interaction/modes.js";
import type { EditorEvents } from "./editor/editor-events.js";
import {
  createEventCache,
  fanOutEvents,
  primeEventCache,
  type EditorEventCache,
} from "./editor/event-fanout.js";
import { AnimationController } from "./editor/animation.js";
import { GestureController } from "./editor/gesture-tx.js";
import { GifPlaybackController } from "./editor/gif-playback.js";
import * as animScene from "./editor/animation-scene.js";
import { computeSceneDirtyRect } from "./editor/dirty-rect.js";
import { LongPressController } from "./editor/long-press.js";
import { pickPressTarget } from "./editor/hit-test.js";
import { PinchController } from "./editor/pinch.js";
import {
  applyContainerDrop as applyContainerDropPure,
  clampContainerToChildren as clampContainerToChildrenPure,
  maybeGrowContainer as maybeGrowContainerPure,
  type ContainerOpsRef,
} from "./editor/container-ops.js";
import {
  computeGroupResizePatches,
  computeElementResize,
  computeRotatedElementResize,
  computeTextResize,
} from "./editor/applies/resize.js";
import { bindPointerEvents as bindPointerEventsExternal } from "./editor/pointer-binding.js";
import {
  InteractionState,
  type AnnotationDrag,
  type ContainerHover,
  type EdgePreview,
  type GroupResizeOrigin,
  type HoveredLinkTarget,
  type LinkDragFromAnchor,
  type PanGesture,
  type RotateGestureOrigin,
} from "./editor/interaction-state.js";
import {
  beginBrushStroke as beginBrushStrokePure,
  commitBrushStroke as commitBrushStrokePure,
  extendBrushStroke as extendBrushStrokePure,
  brushCommitPoints,
  brushStyleFromSettings,
  computeSetBrushWidth,
  DEFAULT_BRUSH_SETTINGS,
  newBrushId,
  type BrushSettings,
  type BrushStrokeState,
} from "./editor/public/brush.js";
import {
  beginEraseStroke as beginEraseStrokePure,
  sampleErase as sampleErasePure,
  computeEraseCommit,
  type EraseStrokeState,
} from "./editor/public/eraser.js";
import {
  computeEraseFromMasks,
  computeStrokeErasePreviewFromMasks,
  markErasedIntervals,
} from "./editor/public/stroke-eraser.js";
import { coveredLength } from "./editor/public/stroke-eraser-coverage.js";
import {
  beginLaserStroke as beginLaserStrokePure,
  extendLaserStroke as extendLaserStrokePure,
  pruneLaserStrokes,
  type LaserStroke,
} from "./editor/public/laser.js";
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
  computeZoomToBounds,
  computeRevealBounds,
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
  frameHeaderAt as computeFrameHeaderAt,
  computeFrameNameCommit,
} from "./editor/public/frame-name.js";
import { computeCursor } from "./editor/public/cursor.js";
import type { CursorRole, CursorSpec } from "./editor/public/cursor.js";
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
  computeSelectAllLinks,
  computeAdjustFontSize,
  computeApplyTextRunStyle,
  computeSetSelection,
  computeUpdateStyle,
  computeUpdateTextProps,
  describeNudge as describeNudgePure,
  findClosestInDirection,
  selectionFromNewIds,
} from "./editor/public/selection-ops.js";
import {
  computeSetLink,
  normalizeHref,
  safeHref,
  snapLinkEndpoint as snapLinkEndpointPure,
} from "./editor/public/link.js";
import {
  beginPlacementState,
  buildElementAtCursor,
  buildTextElementAt,
  computePlacementCancel,
  computePlacementContainerDrop,
  computePlacementUpdate,
  computeLinkedElementFromAnchor,
  computeDuplicateInPlace,
  computeShapeAtLinkDrop,
  newElementIdAtCursor,
  previewClickCreate as previewClickCreatePure,
  type PlacementState,
} from "./editor/public/placement.js";
import {
  computeConvertType,
  computeCommitImageCrop,
  computeCropBodyPan,
  computeCropHandleDrag,
  computeSpawnConnectedNode,
  computeSpawnConnectedNodes,
  cropFullImageLocalRect,
  cropHandleWorldPoints,
  CROP_HANDLES,
  FULL_CROP,
  pickColorAt,
  type ConvertTarget,
  type CropHandle,
  type SpawnDirection,
} from "./editor/public/tool-ops.js";
import {
  renderEditor,
  type RenderSnapshot,
  type BrushPreview,
} from "./editor/render-orchestrator.js";
import { TextEditController } from "./editor/text-edit.js";
import { LinkHandleDragController } from "./editor/link-handle-drag.js";
import {
  combinedSelectionBounds as combinedSelectionBoundsPure,
  computeViewportWorld as computeViewportWorldPure,
  groupChildrenUnion as groupChildrenUnionPure,
} from "./editor/viewport-helpers.js";
import { computeHiddenElements as computeHiddenElementsPure } from "./editor/shape-filters.js";
import {
  selectByBounds as selectByBoundsPure,
  selectByBoundsLive as selectByBoundsLivePure,
  selectLinksByBoundsLive as selectLinksByBoundsLivePure,
} from "./editor/applies/selection.js";
import { computeLinkPreviewEndpoints, elbowSignature } from "./editor/applies/edge.js";
import {
  computeAnnotationMovePatch,
  computeGroupMovePatches,
  computeElementMovePatch,
  constrainDeltaToAxis,
} from "./editor/applies/move.js";
import {
  computeAlignPatches,
  computeDistributePatches,
  computeFlipPatches,
  computeRotatePatches,
  selectionCenter,
  type AlignEdge,
  type DistributeAxis,
  type FlipAxis,
} from "./editor/applies/arrange.js";
import { computeMovingLinkPatches, computeMovingLinkForNudge } from "./editor/applies/link-move.js";
import {
  computeCreateLink,
  computeCreateElement,
  newLinkId,
  newElementId,
} from "./editor/applies/create.js";
import {
  snapCreateBounds,
  snapGroupDelta,
  snapMoveDelta,
  snapResizeDelta,
} from "./editor/applies/snap-grid.js";
import { type PeerCursor, type PeerSelection } from "./render/overlay.js";
import * as Selection from "./selection/selection.js";
import * as LinkSelection from "./selection/link-selection.js";

/**
 * The editor's observable state at one instant — the object handed to the
 * event-fanout. A superset of `EditorObservableSnapshot` (adds `selectedLinks`).
 * Memoized by {@link Editor.observableSnapshot} while its slices are unchanged.
 */
interface ObservableSnapshot {
  readonly activeTool: ActiveTool;
  readonly selection: Selection.Selection;
  readonly selectedLinks: LinkSelection.LinkSelection;
  readonly scene: Scene;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface LoadSceneOptions {
  /**
   * Keep the existing undo/redo stack when swapping scenes. Used by
   * `@collab/bindEditor` when a peer update arrives — the user's
   * local history must survive remote edits. Default `false`:
   * top-level callers loading a saved scene get a clean slate.
   *
   * When `true`, history patches that reference shapes removed by the
   * remote peer become un-applicable: the local user sees an undo no-op
   * or an exception on that step.
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
   * paint, leaving the surface one frame behind. No-op surfaces (Canvas2D)
   * can omit it.
   */
  readonly onAfterRender?: () => void;
  readonly initialScene: Scene;
  readonly initialTool?: Mode;
  /**
   * Start the editor in read-only / view mode. Pointer edits (create /
   * move / resize / rotate / delete) and non-`viewMode` actions are gated;
   * pan / zoom / select still work. Toggle at runtime via
   * {@link Editor.setReadOnly}. Defaults to `false`.
   */
  readonly readOnly?: boolean;
  /**
   * Pre-existing history backend, or options for the default
   * `History` (linear stack). Any `HistoryProvider` implementation
   * works — `@oh-just-another/collab` ships `CollabHistory` that wraps
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
  readonly textShaper?: TextShaper;
  /**
   * Optional rasterizer. When supplied, hosts of `renderLinks` /
   * future path-heavy code can opt in to WASM bezier / stroke-to-
   * fill via `WasmRasterizer.loadBundled()` from
   * `@oh-just-another/raster-wasm`. The kernel itself doesn't consume
   * this directly today — exposed here so the field travels with
   * `EditorOptions` and hosts have a single config surface.
   */
  readonly rasterizer?: Rasterizer;

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
    readonly changedElements: ReadonlyMap<
      ElementId,
      { before: Bounds | null; after: Bounds | null }
    >;
    readonly zoomBucket: number;
    /**
     * Elements omitted from tile rasterisation (stroke-eraser preview and
     * per-element hide). The compositor invalidates the tiles an element
     * touches when it enters/leaves the set.
     */
    readonly hideElements?: ReadonlySet<ElementId>;
    /**
     * Persistent spatial index over the scene's current element world-AABBs,
     * when the editor maintains one (large scenes, shared with the hit-test
     * path). A tile compositor that supports it (`renderViaTiles`) queries the
     * index for per-tile element selection instead of scanning every shape in
     * every layer. Omitted for small scenes; compositors must fall back to a
     * full scan when absent.
     */
    readonly index?: SpatialGrid;
  },
) => void;

/**
 * Top-level interaction controller. Owns the scene + selection state, wires
 * pointer events from the host element into the interaction machine, applies
 * the machine's emitted effects back to the scene, and re-renders main and
 * overlay on every change.
 */

/** Outcome of `Editor.groupSelected`. `noop` when nothing was selected. */
export type GroupSelectedResult =
  | { readonly kind: "noop" }
  | { readonly kind: "grouped"; readonly groupId: ElementId };

// Re-exported here so the public API path (`@oh-just-another/state`) is stable.
export type { CursorRole, CursorSpec };

/**
 * Machine-emit types dropped while the editor is in read-only mode — every
 * scene mutation the interaction machine can produce. Selection / lasso /
 * preview-clear emits are absent so a viewer keeps click + marquee select.
 */
const READ_ONLY_BLOCKED_EMITS: ReadonlySet<InteractionEmit["type"]> = new Set([
  "MOVE_SHAPE",
  "RESIZE_GROUP",
  "RESIZE_SHAPE",
  "ROTATE",
  "CREATE_SHAPE",
  "CREATE_EDGE",
  "MOVE_ANNOTATION",
  "COMMIT_ANNOTATION_DRAG",
  "UPDATE_EDGE_ENDPOINT",
  "UPDATE_EDGE_ENDPOINT_PREVIEW",
  "DRAW_EDGE_PREVIEW",
]);

/** Shared empty id set — returned by `pendingErase` when no eraser stroke runs. */
const EMPTY_ELEMENT_SET: ReadonlySet<ElementId> = Object.freeze(new Set<ElementId>());

/** Monotonic wall-clock in ms, matching the domain used by the overlay fade. */
const nowMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class Editor {
  public readonly host: HTMLElement;
  public readonly mainTarget: RenderTarget;
  public readonly overlayTarget: RenderTarget;
  public readonly backgroundTarget: RenderTarget | null;
  private readonly onAfterRender: (() => void) | null;
  /**
   * Debug: when true the overlay paints every element's mouse hit-zones
   * (handle slop / edge endpoint / edge body). Toggled by the host
   * debug panel via `setDebugHitZones`; read by the render orchestrator.
   * View-only — never persisted or recorded in history.
   */
  debugHitZones = false;
  /**
   * Read-only / view mode. When true the pointer paths that create,
   * move, resize, rotate or delete are gated (pan / zoom / select stay
   * live) and the action registry only runs actions flagged
   * `viewMode`. View-only — never persisted or recorded in history.
   * Read via {@link readOnly}; flip via {@link setReadOnly}.
   */
  private _readOnly = false;
  public actor!: Actor<typeof interactionMachine>;
  private readonly listeners = new Set<() => void>();
  /**
   * Typed event surface. Specific events (`mode`, `selection`,
   * `scene`, `history`, `viewport`) fan out of `notify()` based on
   * what actually changed since the last fire, so subscribers only
   * wake up when their slice flips. `change` still fires once per
   * `notify()` for callers that don't care which slice.
   *
   * The `subscribe()` set runs in lockstep with the typed events.
   */
  private readonly events: Emitter<EditorEvents> = createEmitter<EditorEvents>();
  /**
   * Last-emitted snapshot of every observable slice. Used by
   * `fanOutEvents` to decide which
   * typed events to fire on each `notify()` — only the slices
   * whose identity changed since the previous notify get an event.
   */
  private readonly eventCache: EditorEventCache = createEventCache();
  private readonly unbind: () => void;

  public _scene: Scene;
  public _selection: Selection.Selection = Selection.EMPTY;
  /**
   * Ephemeral interaction / gesture state (previews, gesture origins,
   * transient modifiers). Single source of truth for the short-lived fields
   * the pointer handlers, render orchestrator and container-ops read/write
   * while a gesture is in flight. The public fields below delegate to it so
   * external writers keep referencing `editor.<field>` unchanged.
   */
  public readonly interaction = new InteractionState();

  /** Snapshot of an in-progress annotation-pin drag. */
  get annotationDrag(): AnnotationDrag | null {
    return this.interaction.annotationDrag;
  }
  set annotationDrag(v: AnnotationDrag | null) {
    this.interaction.annotationDrag = v;
  }
  /** Live preview while drawing a new shape; null when not drawing. */
  get drawingPreview(): Bounds | null {
    return this.interaction.drawingPreview;
  }
  set drawingPreview(v: Bounds | null) {
    this.interaction.drawingPreview = v;
  }
  /** Live preview of an edge being drawn. */
  get edgePreview(): EdgePreview | null {
    return this.interaction.edgePreview;
  }
  set edgePreview(v: EdgePreview | null) {
    this.interaction.edgePreview = v;
  }
  /** Active "drag a link from a start-anchor" gesture. */
  get linkDragFromAnchor(): LinkDragFromAnchor | null {
    return this.interaction.linkDragFromAnchor;
  }
  set linkDragFromAnchor(v: LinkDragFromAnchor | null) {
    this.interaction.linkDragFromAnchor = v;
  }
  /** Element hovered while draw-edge mode is active (drives the port overlay). */
  get hoveredLinkTarget(): HoveredLinkTarget | null {
    return this.interaction.hoveredLinkTarget;
  }
  set hoveredLinkTarget(v: HoveredLinkTarget | null) {
    this.interaction.hoveredLinkTarget = v;
  }
  /** Last idle cursor position (world) in select mode — grows the nearest dot. */
  get hoverCursorWorld(): Vec2 | null {
    return this.interaction.hoverCursorWorld;
  }
  set hoverCursorWorld(v: Vec2 | null) {
    this.interaction.hoverCursorWorld = v;
  }
  /**
   * Currently selected links (connectors). Links are first-class members
   * of the selection: they coexist with selected elements, join Cmd+A and
   * marquee, and multi-select via Shift-click. Endpoint drag handles show
   * only when EXACTLY one link is selected and no elements are (see
   * `selectedLink`). Empty set = no link selected.
   */
  public _selectedLinks: LinkSelection.LinkSelection = LinkSelection.EMPTY;
  /**
   * Currently focused annotation thread — overlay highlights its pin
   * with an accent ring and hosts (e.g. `<CommentsPopover>`) render
   * the thread for this id. Independent of shape / edge selection so
   * users can edit shapes while a comment thread is open.
   */
  public _selectedAnnotation: AnnotationId | null = null;
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
   * State lives in `LinkHandleDragController`; this is a delegate.
   */
  get linkEndpointDrag(): {
    linkId: LinkId;
    side: "from" | "to";
    toPoint: Vec2;
  } | null {
    return this.linkHandles.endpointDrag;
  }
  /**
   * Host-managed waypoint (bend-point) drag of the selected link. `index`
   * is the position in `edge.waypoints`. `pendingInsert` means the gesture
   * began on a segment midpoint and will splice a new waypoint on the
   * first move (so a no-move click adds nothing). Live-mutated through the
   * gesture transaction → one undo step per drag.
   * State lives in `LinkHandleDragController`; this is a delegate.
   */
  get linkWaypointDrag(): {
    linkId: LinkId;
    index: number;
    pendingInsert: boolean;
  } | null {
    return this.linkHandles.waypointDrag;
  }
  /**
   * Host-managed elbow segment drag. `axis` is the segment's orientation.
   * Dragging pins the segment's perpendicular coordinate into
   * `Link.fixedSegments`; the reroute pass re-flows the rest. One undo
   * step via the gesture tx.
   * State lives in `LinkHandleDragController`; this is a delegate.
   */
  get linkSegmentDrag(): { linkId: LinkId; axis: "h" | "v"; at: number } | null {
    return this.linkHandles.segmentDrag;
  }
  /** Live lasso bounds during a rubber-band select gesture. */
  get lassoPreview(): Bounds | null {
    return this.interaction.lassoPreview;
  }
  set lassoPreview(v: Bounds | null) {
    this.interaction.lassoPreview = v;
  }
  /** Snapshot of every selected shape's `position` at press-down (multi-drag). */
  get groupMoveOrigin(): ReadonlyMap<ElementId, Vec2> | null {
    return this.interaction.groupMoveOrigin;
  }
  set groupMoveOrigin(v: ReadonlyMap<ElementId, Vec2> | null) {
    this.interaction.groupMoveOrigin = v;
  }
  /** Press-time snapshot of connectors that follow a multi-element drag rigidly. */
  get groupLinkMoveOrigin(): ReadonlyMap<LinkId, Link> | null {
    return this.interaction.groupLinkMoveOrigin;
  }
  set groupLinkMoveOrigin(v: ReadonlyMap<LinkId, Link> | null) {
    this.interaction.groupLinkMoveOrigin = v;
  }
  /** Per-shape snapshot for a group-resize gesture. */
  get groupResizeOrigin(): GroupResizeOrigin | null {
    return this.interaction.groupResizeOrigin;
  }
  set groupResizeOrigin(v: GroupResizeOrigin | null) {
    this.interaction.groupResizeOrigin = v;
  }
  /** Press-time snapshot for a rotate gesture. */
  get rotateGestureOrigin(): RotateGestureOrigin | null {
    return this.interaction.rotateGestureOrigin;
  }
  set rotateGestureOrigin(v: RotateGestureOrigin | null) {
    this.interaction.rotateGestureOrigin = v;
  }
  /**
   * Active layer — new shapes created via `addElement` / `applyCreate` land
   * here when their input doesn't specify a `layerId`. Defaults to the
   * scene's `DEFAULT_LAYER_ID`; hosts switch via `setActiveLayer`.
   */
  public _activeLayerId: LayerId = castLayerId(DEFAULT_LAYER_ID);
  private nextId = 0;

  /** Generate a short unique id with a stable prefix. */
  private uniqueId(prefix: string): string {
    return `${prefix}-${++this.nextId}-${Date.now().toString(36)}`;
  }

  /**
   * Snap engine — defaults to grid + anchor + outline contributors.
   */
  private readonly snapEngine: SnapEngine = new SnapEngine([
    gridSnapper,
    anchorSnapper,
    outlineSnapper,
  ]);
  /** Snap threshold in world units. */
  private readonly snapThreshold = DEFAULT_SNAP_THRESHOLD;

  /**
   * In-editor style memory for copy-style / paste-style. Holds the visual
   * `style` (fill / stroke / dash / …) captured from a shape; `null` until a
   * copy happens. Not the OS clipboard — a lightweight per-editor buffer.
   */
  private styleClipboard: Style | null = null;

  /**
   * Persistent world-bounds cache shared with `renderScene` for viewport
   * culling. Object-identity keyed — invalidates automatically whenever
   * a scene op replaces the shape ref. Could be exposed for hit-test
   * sharing in a follow-up.
   */
  public readonly boundsCache: ElementCache<Bounds> = new ElementCache<Bounds>();

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
  public _enteredGroup: ElementId | null = null;

  /**
   * In-progress brush stroke. Hosts push points via
   * `extendBrushStroke`; the overlay reads it through
   * `pendingBrushStroke` to draw a live preview.
   */
  get brushStroke(): BrushStrokeState | null {
    return this.interaction.brushStroke;
  }
  set brushStroke(v: BrushStrokeState | null) {
    this.interaction.brushStroke = v;
  }

  /**
   * The in-progress brush stroke run through the SAME commit pipeline
   * `commitBrushStroke` applies on release (see {@link brushCommitPoints}:
   * raw catch-up point + Catmull-Rom resample), so the stroke reads exactly
   * as it will land in the scene instead of snapping on release. A fresh
   * object each call (points diverge from `brushStroke.points`), so the
   * overlay memo repaints every move that grows the stroke.
   */
  private get brushPreviewStroke(): BrushPreview | null {
    const s = this.interaction.brushStroke;
    if (!s) return null;
    const style = brushStyleFromSettings(this._brushSettings);
    return {
      origin: s.origin,
      points: brushCommitPoints(s, style).points,
      fill: brushBodyColor(style),
      opacity: style.opacity ?? 1,
    };
  }

  /** In-progress eraser stroke (pending-delete set), or null between strokes. */
  get eraseStroke(): EraseStrokeState | null {
    return this.interaction.eraseStroke;
  }
  set eraseStroke(v: EraseStrokeState | null) {
    this.interaction.eraseStroke = v;
  }
  /** Ids swept by the current eraser stroke — previewed dimmed, deleted on release. */
  get pendingErase(): ReadonlySet<ElementId> {
    return this.interaction.eraseStroke?.pending ?? EMPTY_ELEMENT_SET;
  }

  /** Live laser-pointer trails (ephemeral, fading). Empty when none active. */
  get laserStrokes(): readonly LaserStroke[] {
    return this.interaction.laserStrokes;
  }

  /**
   * Last world-space pointer position observed by the host's onMove
   * handler. `paste()` uses it as the default drop target so a fresh
   * paste lands under the cursor instead of overlapping the originals.
   * `null` until the pointer first enters the host.
   */
  get lastPointerWorld(): Vec2 | null {
    return this.interaction.lastPointerWorld;
  }
  set lastPointerWorld(v: Vec2 | null) {
    this.interaction.lastPointerWorld = v;
  }
  /** Host-registered custom cursor images per role (see `setCursorOverride`). */
  private readonly cursorOverrides = new Map<CursorRole, CursorSpec>();

  /**
   * Scene rendered on the last frame. Used to compute a dirty rect by
   * identity-diffing against the current scene — every shape / edge
   * whose ref didn't change is also pixel-identical to its last paint
   * and gets skipped together with the surrounding clear. `null` until
   * the first render.
   */
  public lastRenderedScene: Scene | null = null;
  /**
   * Last-painted isolation root — paired with `lastRenderedScene` so
   * the dirty-rect optimization invalidates when the user enters or
   * exits a group, even when the scene reference is unchanged. Without
   * this, drilling into a group never triggers a redraw → the dim
   * pass would never visibly apply.
   */
  public lastRenderedEnteredGroup: ElementId | null = null;
  /**
   * Whether the last paint had eraser-dim active — paired with
   * `lastRenderedScene` like {@link lastRenderedEnteredGroup}. When an eraser
   * stroke ENDS by cancel (Esc), the marked shapes un-dim without a scene
   * change, so the dirty-rect diff is empty and the dim would linger on screen;
   * this lets that active→inactive transition force one full repaint.
   */
  public lastRenderedEraseActive = false;
  /**
   * Set whenever an eraser move actually CHANGES the marked / cut set (a new
   * shape marked, un-marked, or a brush point cut). Gates the forced full
   * repaint during erasing: only the frames that change the preview repaint the
   * whole scene; a slowly-moving or stopped cursor over already-covered area
   * skips the expensive main pass (only the overlay cursor / trail refresh).
   * Cleared after each paint.
   */
  private eraseDirty = false;

  /**
   * Fractional-order compaction scheduler (microtask-coalesced).
   * Triggered from every `notify()`; only does real work when at
   * least one shape/edge order string crossed AUTO_COMPACT_THRESHOLD.
   */
  private readonly autoCompactScheduler = new AutoCompactScheduler({
    getScene: () => this._scene,
    compact: (layerId) => {
      this.compactLayerZOrder(layerId, { recordHistory: false });
    },
  });

  /**
   * Auto-layout scheduler — microtask-coalesced re-run of every
   * shape carrying `metadata.autoLayout`.
   */
  private readonly autoLayoutScheduler = new AutoLayoutScheduler({
    getScene: () => this._scene,
    applyPatch: (patch) => {
      this._scene = apply(this._scene, patch);
      if (this.gestureTx) this.gestureTx.add(patch);
      else this._history.push(patch);
    },
    growContainer: (parentId, childId) => {
      this.maybeGrowContainer(parentId, childId);
    },
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
  get dragElementId(): ElementId | null {
    return this.interaction.dragElementId;
  }
  set dragElementId(v: ElementId | null) {
    this.interaction.dragElementId = v;
  }

  /**
   * Element that the current press added to the selection additively
   * (shift / meta click on an unselected shape). The press promotes it
   * so a subsequent drag moves it; on a *tap* the up-handler would
   * otherwise `SELECT_TOGGLE` it straight back off, so it consults this
   * to skip that redundant toggle. Reset at every press-down.
   */
  get additivePressAdded(): ElementId | null {
    return this.interaction.additivePressAdded;
  }
  set additivePressAdded(v: ElementId | null) {
    this.interaction.additivePressAdded = v;
  }

  /**
   * Live container highlight: the container shape the dragged item is
   * currently hovering over. Drawn by the overlay as a dashed
   * accent rect on the container's drop-zone so the user sees where the
   * shape will land after release.
   */
  get containerHover(): ContainerHover | null {
    return this.interaction.containerHover;
  }
  set containerHover(v: ContainerHover | null) {
    this.interaction.containerHover = v;
  }

  /**
   * Remote peer cursors / selections, pushed in by the host (typically
   * a `bindAwareness(editor, awareness)` helper in `@collab`). The
   * editor only renders them; it doesn't fetch or interpret. Each
   * setter triggers `render()` so the overlay updates immediately.
   */
  public _peerCursors: readonly PeerCursor[] = [];
  public _peerSelections: readonly PeerSelection[] = [];

  /**
   * Subscribers notified on every host pointer move (world-space). Used
   * by `@collab` to broadcast the local cursor into awareness.
   */
  public readonly cursorListeners = new Set<(point: Vec2) => void>();

  /**
   * Active screen-space pointer positions keyed by `pointerId`. With
   * one entry the editor's normal single-pointer flow applies. With
   * two or more entries we enter a pinch / pan gesture and bypass the
   * interaction machine — `pinchOrigin` holds the baseline.
   */
  get activePointers(): Map<number, Vec2> {
    return this.interaction.activePointers;
  }
  /**
   * One-finger-pan candidate: set at pointer-down when a TOUCH press lands
   * on empty canvas in select mode. A tap (no movement) still falls through
   * to select/deselect; once the finger drags past slop, onMove promotes
   * this to a real pan instead of a marquee lasso (mobile convention).
   * Screen-space origin point.
   */
  get touchPanCandidate(): Vec2 | null {
    return this.interaction.touchPanCandidate;
  }
  set touchPanCandidate(v: Vec2 | null) {
    this.interaction.touchPanCandidate = v;
  }
  // Pinch gesture state lives in PinchController; `pinch.isActive()`
  // reports whether a two-finger gesture is in flight.
  public pinch!: PinchController;
  /** Bridge for the container-ops helpers. Built lazily in constructor. */
  private containerOpsRef!: ContainerOpsRef;

  /**
   * Space-bar held → next pointer drag pans the canvas instead of
   * doing whatever the current mode would do. Visual cursor goes to
   * "grab" / "grabbing". Wires a window-level keydown/keyup listener
   * in `bindPointerEvents`.
   */
  get spaceHeld(): boolean {
    return this.interaction.spaceHeld;
  }
  set spaceHeld(v: boolean) {
    this.interaction.spaceHeld = v;
  }

  /**
   * Host-supplied tile compositor — when set (via
   * `EditorOptions.useTileCache` + `tileCompose`), the per-frame
   * render path delegates to it instead of `renderScene`. Stays
   * `null` for the typical small-scene case.
   */
  public readonly tileComposeFn: TileComposeFn | null;

  /**
   * Per-shape change record (before/after world bbox) since the last
   * tile-cache invalidation pass. Populated by `computeDirtyWorld`'s
   * diff loop when `tileComposeFn` is on; forwarded to the compositor
   * each frame so it can invalidate by add / remove / move correctly.
   * (A plain id set lost adds — new id wasn't in the tile reverse
   * index yet.)
   */
  public tileDirtyElements = new Map<ElementId, { before: Bounds | null; after: Bounds | null }>();

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

  /** The tool active before the current one — `activeTool.lastActiveTool`. */
  private _lastActiveTool: Mode | null = null;

  /** Cached `activeTool` value object; rebuilt only when a component changes. */
  private _activeToolCache: ActiveTool = {
    type: DEFAULT_MODE,
    locked: false,
    lastActiveTool: null,
  };

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
  get panGesture(): PanGesture | null {
    return this.interaction.panGesture;
  }
  set panGesture(v: PanGesture | null) {
    this.interaction.panGesture = v;
  }

  /**
   * Set on a right-click pointerdown so the upcoming native
   * `contextmenu` event can be unconditionally preventDefault'ed
   * (the gesture decides whether to fire the menu manually on
   * pointerup based on whether the user dragged).
   */
  get suppressNextContextMenu(): boolean {
    return this.interaction.suppressNextContextMenu;
  }
  set suppressNextContextMenu(v: boolean) {
    this.interaction.suppressNextContextMenu = v;
  }

  /**
   * Long-press tracking. Starts on `pointerdown`; cancelled on
   * `pointermove > LONG_PRESS_MAX_MOVEMENT_PX` or `pointerup` before
   * the timer fires. Hosts subscribe via `onLongPress` to surface a
   * context menu (mobile alternative to right-click).
   */
  // Long-press timer + origin live in LongPressController. The Set of
  // subscribers stays here because `onLongPress` is part of the public
  // Editor API.
  public longPress!: LongPressController;
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
  private inputMode!: "mouse" | "touch";
  private handleHitSlop!: number;
  private edgeHandleHitSlop!: number;
  private edgeHitThreshold!: number;
  /** Link-start anchor-dot grab/click hit radii — touch-enlarged in touch mode. */
  public anchorStartHitSlop!: number;
  public anchorClickRadius!: number;

  public readonly _history: HistoryProvider;
  /** Open transaction during a single drag/resize gesture. */
  public gestureTx: TransactionHandle | null = null;
  /**
   * Immutable snapshot of `_scene` taken when a gesture transaction opens.
   * The history transaction only records patches for undo — cancelling it does
   * NOT roll back `_scene`. Keeping the pre-gesture scene lets Escape (and any
   * cancel) restore it, so a drag/move/resize/endpoint-rebind aborted with Esc
   * leaves the scene exactly as it was. Cleared on commit.
   */
  private gestureStartScene: Scene | null = null;
  /**
   * Wraps gesture lifecycle (transaction open/commit/cancel +
   * post-create mode revert) so editor.ts doesn't carry the bodies.
   * The controller calls back through the narrow `GestureRef` bridge
   * built lazily below.
   */
  private gestures!: GestureController;
  /**
   * Owns the inline text-edit session (edited shape, pending creation,
   * origin snapshot, live selection, drag anchor and caret blink).
   * Editor keeps thin delegate wrappers so the public API is unchanged.
   */
  private textEdit!: TextEditController;
  /**
   * Owns the link edit-handle drags (waypoint / segment / endpoint) and
   * the handle double-click detector. Editor keeps thin delegate
   * wrappers so the public API is unchanged.
   */
  private linkHandles!: LinkHandleDragController;

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
    this.tileComposeFn =
      options.useTileCache === true && options.tileCompose ? options.tileCompose : null;

    this.initControllers();
    this.initGlobalHooks(options);
    this.initInputMode(options);
    this.initActor(options);

    this.unbind = this.bindPointerEvents();
    // Pause animation playback when the tab / window is hidden (browsers
    // throttle rAF to ~1fps in background but don't stop it; an explicit
    // stop saves the decode + render entirely). Resume when visible again,
    // viewport permitting.
    this.animation.attach();
    // Restore GIF/video bytes onto animated image shapes loaded from
    // an initial scene (e.g. localStorage), then arm the tick so the
    // animation plays from first paint.
    animScene.rehydrateAnimatedImages(this);
    // Rebuild live handles for static images restored from storage — their
    // `metadata.image` didn't survive serialisation and `src` is a dead
    // `blob:` URL, so decode the bytes back from `Scene.files`. Async;
    // repaints itself when the decode lands.
    void animScene.rehydrateStaticImages(this);
    this.maybeAnimate();
    // An animated adapter (GIF) decodes asynchronously; when a decode
    // completes it nudges us here. Re-render so a PAUSED animated shape
    // (reduced-motion / auto-stopped / frozen) — which has no tick to
    // pick the frames up — paints its decoded frame after reload.
    this.animationContentOff = onAnimationContentReady(() => {
      this.scheduleRender();
    });
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

  /**
   * Build the interaction controllers (gestures, text edit, link-handle
   * drag, long-press, pinch) and the container-ops bridge. Each wires to a
   * narrow getter/setter surface over the editor's mutable fields, so the
   * controllers live in their own modules without importing Editor. The
   * getters/setters in the object literals rebind `this`, so a single
   * `self` alias captures the Editor reference for all of them.
   */
  private initControllers(): void {
    // Build the gesture controller against a narrow getter/setter
    // bridge to the editor's mutable state. The bridge is a thin
    // adapter — keeps `gestureTx`/`dragElementId` etc. as `private`
    // fields on Editor (instead of forcing them public to satisfy
    // structural implements), and lets the controller live in its
    // own module without importing Editor.
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- getters/setters in the literal rebind `this`; alias keeps Editor reference
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
        self.groupMoveOrigin = v;
      },
      get groupLinkMoveOrigin() {
        return self.groupLinkMoveOrigin;
      },
      set groupLinkMoveOrigin(v) {
        self.groupLinkMoveOrigin = v;
      },
      get groupResizeOrigin() {
        return self.groupResizeOrigin;
      },
      set groupResizeOrigin(v) {
        self.groupResizeOrigin = v;
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
        self.containerHover = v;
      },
      get toolLocked() {
        return self._toolLocked;
      },
      get mode() {
        return self.activeTool.type;
      },
      setMode: (m) => {
        self.setActiveTool(m);
      },
      notify: () => {
        self.notify();
      },
    });
    // Same bridge pattern for the text-edit controller: scene access goes
    // through get/set so live edits replace `_scene` without history.
    this.textEdit = new TextEditController({
      get scene() {
        return self._scene;
      },
      set scene(s) {
        self._scene = s;
      },
      pushHistory: (patch) => {
        self._history.push(patch);
      },
      notify: () => {
        self.notify();
      },
      isLayerLocked: (id) => self.isLayerLocked(id),
      clearSelectionFor: (id) => {
        if (self._selection.has(id)) self._selection = Selection.EMPTY;
      },
      mainTarget: this.mainTarget,
    });
    // Same bridge pattern for the link handle-drag controller.
    this.linkHandles = new LinkHandleDragController({
      get scene() {
        return self._scene;
      },
      set scene(s) {
        self._scene = s;
      },
      pushHistory: (patch) => {
        self._history.push(patch);
      },
      recordGesturePatch: (patch) => {
        self.recordGesturePatch(patch);
      },
      commitGesture: () => {
        self.commitGesture();
      },
      cancelGesture: () => {
        self.cancelGesture();
      },
      hasGestureTx: () => self.gestureTx !== null,
      notify: () => {
        self.notify();
      },
      linkAttachTargetAt: (worldPoint) => self.linkAttachTargetAt(worldPoint),
      snapLinkEndpoint: (targetId, worldPoint) => self.snapLinkEndpoint(targetId, worldPoint),
      updateHoveredLinkTarget: (worldPoint) => {
        self.updateHoveredLinkTarget(worldPoint);
      },
      clearHoveredLinkTarget: () => {
        self.hoveredLinkTarget = null;
      },
    });
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
      (factor, anchorWorld) => {
        this.zoomAt(factor, anchorWorld);
      },
      (delta) => {
        this.panBy(delta);
      },
    );
    // Bridge for the container-ops helpers — narrow surface that the
    // pure functions call back into.
    this.containerOpsRef = {
      get scene() {
        return self._scene;
      },
      get dragElementId() {
        return self.dragElementId;
      },
      get containerHover() {
        return self.containerHover;
      },
      applyPatch(patch, nextScene) {
        self._scene = nextScene;
        self.beginOrAttachGesture().add(patch);
      },
    };
  }

  /**
   * Install process-global hooks the host opted into: a custom text shaper
   * and rasterizer for the WebGL2 backend, plus the scene text measurer that
   * routes through the renderer's own metrics so selection boxes hug text.
   */
  private initGlobalHooks(options: EditorOptions): void {
    // If the host plugged a TextShaper, install it process-globally so the
    // built-in text renderer's wrap path uses it instead of
    // Canvas2D.measureText. Hosts that don't care leave the field unset and
    // the default behaviour is unchanged.
    if (options.textShaper) setActiveTextShaper(options.textShaper);
    // Same pattern for the Rasterizer. The WebGL2 backend reads
    // `getActiveRasterizer()` from its curve methods and routes through WASM
    // flatten / strokeToFill when set. Other backends (Canvas2D, SVG) leave
    // the field alone — native ctx.bezierCurveTo beats any WASM round-trip
    // there.
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
  }

  /**
   * Resolve the input mode (`touch` vs `mouse`, `auto` reads the coarse-
   * pointer media query) and the derived hit slops / thresholds once.
   */
  private initInputMode(options: EditorOptions): void {
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
    this.anchorStartHitSlop =
      this.inputMode === "touch" ? TOUCH_ANCHOR_START_HIT_SLOP : ANCHOR_START_HIT_SLOP;
    this.anchorClickRadius =
      this.inputMode === "touch" ? TOUCH_ANCHOR_DOT_CLICK_RADIUS : ANCHOR_DOT_CLICK_RADIUS;
  }

  /**
   * Create and start the interaction state-machine actor, wire its render /
   * emit subscriptions, register the built-in file-drop handlers, and apply
   * the initial mode.
   */
  private initActor(options: EditorOptions): void {
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

    this._readOnly = options.readOnly ?? false;

    if (options.initialTool) {
      this.actor.send({ type: "SET_MODE", mode: options.initialTool });
    }
  }

  /**
   * Last {@link observableSnapshot} object, reused while none of its slices
   * have flipped. `null` until the first snapshot is built.
   */
  private snapshotCache: ObservableSnapshot | null = null;

  /**
   * Snapshot used by event-fanout. Kept private — internal API.
   *
   * Memoized by slice identity: `notify()` fires on many mutations that touch
   * no observable slice (annotation focus, cursor pushes, viewport-only re-arm),
   * so rebuilding the object every call is pure churn on the hot drag path.
   * We reuse the cached object whenever all six slices compare equal (refs for
   * mode/selection/selectedLinks/scene — scene uses structural sharing so a new
   * ref iff something changed — plus the two history booleans), and only
   * allocate a fresh one on a real flip. `fanOutEvents` sees identical values
   * either way, so emitted events are unchanged.
   */
  private observableSnapshot(): ObservableSnapshot {
    const activeTool = this.activeTool;
    const selection = this._selection;
    const selectedLinks = this._selectedLinks;
    const scene = this._scene;
    const canUndo = this.canUndo;
    const canRedo = this.canRedo;
    const cached = this.snapshotCache;
    if (
      cached !== null &&
      cached.activeTool === activeTool &&
      cached.selection === selection &&
      cached.selectedLinks === selectedLinks &&
      cached.scene === scene &&
      cached.canUndo === canUndo &&
      cached.canRedo === canRedo
    ) {
      return cached;
    }
    const snapshot: ObservableSnapshot = {
      activeTool,
      selection,
      selectedLinks,
      scene,
      canUndo,
      canRedo,
    };
    this.snapshotCache = snapshot;
    return snapshot;
  }

  // --- Public state ---

  get scene(): Scene {
    return this._scene;
  }
  get selection(): Selection.Selection {
    return this._selection;
  }
  /**
   * The active tool as a single value object (`{ type, locked,
   * lastActiveTool }`) — the one source of truth for the current tool.
   * The reference is stable between changes (safe for React deps).
   */
  get activeTool(): ActiveTool {
    const type = this.actor.getSnapshot().context.mode;
    const c = this._activeToolCache;
    if (
      c.type !== type ||
      c.locked !== this._toolLocked ||
      c.lastActiveTool !== this._lastActiveTool
    ) {
      this._activeToolCache = {
        type,
        locked: this._toolLocked,
        lastActiveTool: this._lastActiveTool,
      };
    }
    return this._activeToolCache;
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

  /**
   * Read-only / view mode flag. `true` gates pointer edits and
   * non-`viewMode` actions while leaving pan / zoom / select live.
   */
  get readOnly(): boolean {
    return this._readOnly;
  }

  /**
   * Enter / leave read-only (view) mode. Notifies subscribers so the UI
   * can re-render disabled chrome, and repaints (no visual diff today, but
   * keeps the contract symmetric with other view toggles). Idempotent.
   */
  setReadOnly(on: boolean): void {
    if (this._readOnly === on) return;
    this._readOnly = on;
    this.notify();
    this.scheduleRender();
  }

  /** Toggle read-only (view) mode. */
  toggleReadOnly(): void {
    this.setReadOnly(!this._readOnly);
  }

  /** Whether the background grid is enabled for the scene. */
  get gridEnabled(): boolean {
    return this._scene.viewport.gridEnabled;
  }

  /** Show/hide the background grid (`g`). Persists in the viewport, not in history. */
  setGridVisible(on: boolean): void {
    this.setGrid({ enabled: on });
  }

  /** Toggle the background grid on/off. */
  toggleGrid(): void {
    this.setGrid({ enabled: !this.gridEnabled });
  }

  /** All currently-selected link (connector) ids. */
  get selectedLinks(): LinkSelection.LinkSelection {
    return this._selectedLinks;
  }

  /**
   * The sole selected link — non-null ONLY when exactly one link and no
   * elements are selected. Drives endpoint handles, the edge-style panel,
   * caption edit and `updateSelectedLink`; a multi/mixed selection yields
   * null so those single-link affordances stay hidden.
   */
  get selectedLink(): LinkId | null {
    if (this._selection.size > 0) return null;
    return LinkSelection.sole(this._selectedLinks);
  }

  /**
   * Apply an in-place mutation to the currently-selected edge as a
   * single history step. The `updater` receives a clone of the edge
   * and returns the next version (callers should produce a new
   * object — Link is readonly). No-op when no edge is selected.
   */
  updateSelectedLink(updater: (edge: Link) => Link): void {
    if (this.readOnly) return;
    const id = this.selectedLink;
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
   * Toggle the tool lock (`activeTool.locked`). With `true`, draw tools
   * persist after each successful shape create — the user keeps drawing
   * rectangles without re-pressing R. With `false` (default), the
   * editor reverts to `select` after each create.
   */
  setToolLocked(locked: boolean): void {
    if (this._toolLocked === locked) return;
    this._toolLocked = locked;
    this.notify();
  }

  private maybeRevertToolAfterCreate(): void {
    this.gestures.maybeRevertModeAfterCreate();
  }

  /**
   * Switch the active tool. The single entry point for tool changes —
   * toolbar buttons and hotkeys reach it through the action registry.
   * Records the outgoing tool in `activeTool.lastActiveTool`.
   */
  setActiveTool(mode: Mode): void {
    const prev = this.actor.getSnapshot().context.mode;
    if (prev !== mode) this._lastActiveTool = prev;
    // A tool switch cancels any armed colour-picker pipette.
    this.pendingEyedropperPick = null;
    // Switching tools commits any in-flight text edit (standard: leaving the
    // editing context ends it, keeping the typed text).
    if (this.editingTextElement !== null) this.commitTextEdit();
    // Cancel any in-progress drag gesture so the partial state is not recorded.
    if (this.gestureTx) {
      this.gestureTx.cancel();
      this.gestureTx = null;
    }
    // Hide the port overlay when leaving draw-edge.
    if (mode !== "draw-edge" && this.hoveredLinkTarget !== null) {
      this.hoveredLinkTarget = null;
    }
    this.actor.send({ type: "SET_MODE", mode });
    // Cursor affordance follows the new mode (hand → grab, draw tools →
    // crosshair, etc.) — recompute through the single chokepoint.
    this.refreshCursor();
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
  insertImage(input: {
    src: string;
    width: number;
    height: number;
    position: Vec2;
    image?: ImageBitmap | HTMLImageElement;
    animated?: boolean;
    fileId?: FileId;
    animationKind?: string;
    animationData?: unknown;
  }): ElementId {
    const id = castElementId(this.uniqueId("img"));
    const shape = buildImageElement(this._scene, input, id, this._activeLayerId);
    this.addElement(shape);
    if (input.animated) {
      this.gifPlayback.ensure(id);
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
   * Lifecycle managed by the `AnimationTick` helper.
   * `insertImage({animated:true})` and `loadScene` start the tick;
   * `dispose()` stops it.
   */
  private readonly animation = new AnimationController({
    // Laser trails also need a per-frame repaint to animate their fade — OR
    // them into the tick predicate so the same rAF loop drives both.
    hasVisibleAnimatedElement: () =>
      animScene.hasVisibleAnimatedElement(this) || this.hasActiveLaser(),
    autoStopHeavyGifs: () => {
      animScene.autoStopHeavyGifs(this);
    },
    forceAnimationRepaint: () => {
      // The scene reference hasn't changed, but the adapter advanced the GIF
      // frame — drop the paint cache and force a repaint.
      this.lastRenderedScene = null;
      this.render();
    },
  });

  private hasAnimatedElement(): boolean {
    return hasAnimatedElement(this._scene);
  }

  /**
   * Re-arm the animation tick after a change that may have brought an
   * animated shape into (or out of) view — pan / zoom / scene edit.
   * `AnimationTick.start()` no-ops when already running or when
   * `isAnimated()` is false, so this is cheap to call from `notify()`.
   */
  private maybeAnimate(): void {
    this.animation.maybe();
  }

  /**
   * Per-shape GIF playback state (auto-stop + reduced-motion). Extracted into
   * a controller; the Editor keeps the orchestration (scene iteration,
   * animation tick, render scheduling) and delegates state ops here.
   */
  readonly gifPlayback = new GifPlaybackController();

  /**
   * Toggle GIF playback for a shape — wired to a click on an animated
   * image (resume after auto-stop, play after reduced-motion). Resuming
   * continues from the frozen frame.
   */
  togglePlayback(id: ElementId): void {
    this.gifPlayback.toggle(id);
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
    if (this.gifPlayback.hoverEnter(id)) {
      this.maybeAnimate();
      this.scheduleRender();
    }
  }

  /** True when the shape's GIF is paused (drives the overlay badge). */
  isPlaybackPaused(id: ElementId): boolean {
    return this.gifPlayback.isPaused(id);
  }

  /**
   * Record the idle cursor position so the overlay can grow the SINGLE
   * selected element's link-start dot nearest the cursor. Only the selected
   * element shows start dots (connecting from an unselected element on hover
   * was a cancelled product decision). Pass `null` to clear.
   */
  setHoverCursorWorld(cursor: Vec2 | null): void {
    this.hoverCursorWorld = cursor;
    // Dots only render for a single selection; skip notify otherwise.
    if (this._selection.size === 1) this.notify();
  }

  /** Live link-draw preview polyline (elbow), or null when not drawing. */
  get linkPreviewPath(): readonly Vec2[] | null {
    return this.edgePreview?.points ?? null;
  }

  /** Current connector attach target + mode (point=fixed / element=floating). */
  get linkAttachTarget(): { elementId: ElementId; mode: "point" | "element" } | null {
    const t = this.hoveredLinkTarget;
    return t ? { elementId: t.elementId, mode: t.mode } : null;
  }

  /**
   * Drag-to-place flow for palette templates. Adds the shape to the
   * scene immediately so the user sees it dragging under the cursor,
   * but defers the history entry until `commit()` is called. `update`
   * re-positions without writing per-move patches; `cancel` removes
   * the shape entirely and leaves history untouched (no undo entry).
   *
   * Typical wiring: HTML5 dragenter starts the placement, dragover
   * updates, drop commits, dragleave / window keydown(Escape) cancel.
   */
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
        // Notify is mandatory here. The dragover snapshots carried the
        // placement preview WITHOUT `parentId`, so the
        // AutoLayoutScheduler's `signatureFor(parent)` did not include the
        // new child and no `runAutoLayout` was scheduled. The reparent above
        // set `parentId`; this final `notify()` lets the scheduler see the
        // change so the child is laid out immediately instead of on the next
        // unrelated notification.
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

  deleteSelected(): void {
    if (this.readOnly) return;
    const result = computeDeleteSelection(this._scene, this._selection, this._selectedLinks);
    if (!result) return;
    const tx = this._history.transaction();
    this._scene = result.scene;
    for (const patch of result.patches) tx.add(patch);
    tx.commit();
    this._selection = Selection.EMPTY;
    this._selectedLinks = LinkSelection.EMPTY;
    this.notify();
  }

  // --- Inline text editing ---

  /**
   * Currently edited text shape (or null). Set by `beginTextEdit`;
   * cleared by `commitTextEdit` / `cancelTextEdit`. The host overlay
   * (`<TextEditorOverlay>` in `@react-ui`) subscribes via `editor`
   * and renders a `<textarea>` positioned over the shape.
   * State lives in `TextEditController`; this is a delegate.
   */
  get editingTextElement(): ElementId | null {
    return this.textEdit.editingElement;
  }
  /** Link whose caption is being edited inline (double-click), or null. */
  get editingLinkCaption(): LinkId | null {
    return this.interaction.editingLinkCaption;
  }
  /**
   * Frame whose NAME (header label) is being edited inline (double-click
   * the header), or null. The host overlay (`<FrameNameEditorOverlay>` in
   * `@react-ui`) renders an input over the header and commits the name.
   */
  private _editingFrameName: ElementId | null = null;
  get editingFrameName(): ElementId | null {
    return this._editingFrameName;
  }
  get editingTextSelection(): { start: number; end: number; dir: "forward" | "backward" } | null {
    return this.textEdit.selection;
  }
  /** Caret offset = the moving end of the selection. */
  get editingTextCaret(): number | null {
    return this.textEdit.caret;
  }
  get caretBlinkOn(): boolean {
    return this.textEdit.caretBlinkOn;
  }
  /** `true` while a canvas drag-select inside the edited text is active. */
  get isTextDragging(): boolean {
    return this.textEdit.isDragging;
  }

  /**
   * Begin editing a text shape's body. No-op when the shape doesn't
   * exist or isn't a text shape. Concurrent edits commit themselves
   * (only one shape at a time). Caret defaults to the end of the text.
   */
  /** Open inline caption editing for a link (double-click). */
  beginLinkCaptionEdit(id: LinkId): void {
    if (!getLink(this._scene, id)) return;
    if (this.editingTextElement !== null) this.commitTextEdit();
    this.interaction.editingLinkCaption = id;
    this.notify();
  }

  /**
   * Commit the link caption. Empty / whitespace text removes the label;
   * otherwise the label text is set, preserving any existing position /
   * styling. One undo step. Clears caption-edit mode.
   */
  commitLinkCaptionEdit(text: string): void {
    const id = this.interaction.editingLinkCaption;
    this.interaction.editingLinkCaption = null;
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
          return next;
        });
        this._scene = r.scene;
        this._history.push(r.patch);
      }
    }
    this.notify();
  }

  /** Cancel link caption editing without changing the label. */
  cancelLinkCaptionEdit(): void {
    if (this.interaction.editingLinkCaption === null) return;
    this.interaction.editingLinkCaption = null;
    this.notify();
  }

  /**
   * World-space anchor point for a link's caption — the same shared geometry
   * the renderer places the pill at (`linkLabelAnchor` over the drawn
   * polyline), so the inline editor opens exactly over the label.
   */
  linkLabelWorld(id: LinkId): Vec2 | null {
    const edge = getLink(this._scene, id);
    if (!edge) return null;
    const path = getLinkCurvePoints(this._scene, edge);
    if (!path || path.length < 2) return null;
    return linkLabelAnchor(path, edge);
  }

  beginTextEdit(id: ElementId): void {
    this.textEdit.begin(id);
  }

  // --- Frame name inline editing (double-click the header) ---

  /**
   * Start editing a frame's header name. No-op unless `id` is a frame on
   * an unlocked layer. Commits any in-flight text edit first.
   */
  beginFrameNameEdit(id: ElementId): void {
    const shape = getElement(this._scene, id);
    if (shape === undefined || !isFrame(shape)) return;
    if (this.isLayerLocked(shape.layerId)) return;
    if (this.editingTextElement !== null) this.commitTextEdit();
    this._editingFrameName = id;
    this.notify();
  }

  /**
   * Commit the edited frame name. Empty / whitespace-only clears the
   * stored name (the renderer falls back to "Frame"). One history step;
   * no-op when the name is unchanged. Always clears the editing state.
   */
  commitFrameNameEdit(name: string): void {
    const id = this._editingFrameName;
    if (id === null) return;
    this._editingFrameName = null;
    const r = computeFrameNameCommit(this._scene, id, name);
    if (r) {
      this._scene = r.scene;
      this._history.push(r.patch);
    }
    this.notify();
  }

  /** Abandon the frame-name edit without changing the name. */
  cancelFrameNameEdit(): void {
    if (this._editingFrameName === null) return;
    this._editingFrameName = null;
    this.notify();
  }

  /**
   * Frame whose header strip (the label bar ABOVE the body) contains the
   * world point — top-most by z-order. Used to route a double-click on the
   * header to a name edit, since the header sits outside the frame's
   * hit-test bounds. Assumes unrotated frames (the common case).
   */
  private frameHeaderAt(p: Vec2): ElementId | null {
    return computeFrameHeaderAt(this._scene, p);
  }

  /**
   * Live edit transport from the hidden `<textarea>`: replace the
   * shape's text + selection as the user types / pastes / composes.
   * Mutates the scene WITHOUT a history entry — history is recorded
   * once on commit. No-op when not editing.
   */
  setEditingText(
    value: string,
    selStart: number,
    selEnd: number,
    dir: "forward" | "backward" = "forward",
  ): void {
    this.textEdit.setText(value, selStart, selEnd, dir);
  }

  /** Selection-only update (arrows / shift-select / click) — no text change. */
  setEditingSelection(
    selStart: number,
    selEnd: number,
    dir: "forward" | "backward" = "forward",
  ): void {
    this.textEdit.setSelection(selStart, selEnd, dir);
  }

  /**
   * Map a world-space point to a caret offset in the edited text. Used
   * to place / extend the caret from canvas clicks. Returns `null` when
   * not editing or the shape is gone.
   */
  caretIndexAtWorldPoint(worldPoint: Vec2): number | null {
    return this.textEdit.caretIndexAtWorldPoint(worldPoint);
  }

  /**
   * `true` when a point is inside the currently-edited text shape's
   * world bounds. Used by the pointer binding to decide between
   * repositioning the caret (inside) and committing (outside).
   */
  editedElementContainsPoint(worldPoint: Vec2): boolean {
    return this.textEdit.editedElementContainsPoint(worldPoint);
  }

  /** Place a collapsed caret at the clicked point and start a drag-select. */
  setTextCaretFromPoint(worldPoint: Vec2): void {
    this.textEdit.setCaretFromPoint(worldPoint);
  }

  /** Extend the selection from the drag anchor to the current point. */
  extendTextSelectionToPoint(worldPoint: Vec2): void {
    this.textEdit.extendSelectionToPoint(worldPoint);
  }

  /** End a canvas drag-select (clears the drag anchor). */
  endTextDragSelect(): void {
    this.textEdit.endDragSelect();
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
    return this.textEdit.overlay();
  }

  commitTextEdit(next?: string): void {
    this.textEdit.commit(next);
  }

  cancelTextEdit(): void {
    this.textEdit.cancel();
  }

  /**
   * Translate every selected shape by the given world-space delta.
   * Single undo step. No-op when selection is empty. Used by arrow-key
   * keyboard navigation; hosts pass `{ x: 1, y: 0 }` for fine nudge
   * and `{ x: 10, y: 0 }` for shift-arrow.
   */
  moveSelectionBy(delta: Vec2): void {
    if (this.readOnly) return;
    if (this._selection.size === 0 && this._selectedLinks.size === 0) return;
    // Locked / layer-locked elements don't move (they're still selectable).
    const targets = new Set(
      [...this.expandSelectionWithDescendants()].filter((id) => {
        const s = getElement(this._scene, id);
        return s ? this.isElementManipulable(s) : false;
      }),
    );
    const result =
      this._selection.size > 0
        ? computeMoveSelectionBy(this._scene, targets, delta, (lid) => this.isLayerLocked(lid))
        : null;
    // Selected links (translated whole, incl. free endpoints) + connectors
    // bound on both ends to nudged elements move by the same delta.
    const sceneAfterElements = result ? result.scene : this._scene;
    const linkResult = computeMovingLinkForNudge(
      sceneAfterElements,
      targets,
      this._selectedLinks,
      delta,
    );
    if (!result && linkResult.patches.length === 0) return;
    const tx = this._history.transaction();
    this._scene = linkResult.scene;
    if (result) for (const patch of result.patches) tx.add(patch);
    for (const patch of linkResult.patches) tx.add(patch);
    tx.commit();
    this.notify();
    this.announce(describeNudgePure(delta, result?.moved ?? 0));
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
  createElementAtCursor(): ElementId | null {
    const vp = this._scene.viewport;
    const world = this.screenToWorld({
      x: (vp.size.width || 200) / 2,
      y: (vp.size.height || 200) / 2,
    });
    const id = newElementIdAtCursor(++this.nextId);
    const shape = buildElementAtCursor(
      this._scene,
      this.activeTool.type,
      world,
      this._activeLayerId,
      id,
    );
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
    // first commit (see `TextEditController.markPendingCreate`). This way an abandoned
    // text never pollutes the undo stack.
    const r = addElement(this._scene, shape);
    this._scene = r.scene;
    this.textEdit.markPendingCreate(id);
    this._selection = Selection.single(id);
    this.maybeRevertToolAfterCreate();
    this.notify();
    this.announce(`Created text ${id}`);
    this.beginTextEdit(id);
    return id;
  }

  /** Current brush paint settings (line colour, fill, opacity, width). */
  private _brushSettings: BrushSettings = DEFAULT_BRUSH_SETTINGS;
  get brushSettings(): BrushSettings {
    return this._brushSettings;
  }
  /**
   * Update one or more brush paint settings (e.g. from the drawing panel). New
   * strokes pick them up on commit; the width also drives the pressure curve and
   * the eraser radius. Merges over the current settings.
   */
  setBrushSettings(patch: Partial<BrushSettings>): void {
    this._brushSettings = { ...this._brushSettings, ...patch };
    this.notify();
  }

  /**
   * Start a brush stroke. `pointerType` (a `PointerEvent.pointerType`) decides
   * the pressure source: a pen has a real pressure channel and is honoured
   * verbatim (the default, which also keeps programmatic callers exact); mouse
   * and touch have none, so pressure is simulated from pointer speed.
   */
  beginBrushStroke(world: Vec2, pressure = 0.5, pointerType = "pen"): void {
    this.brushStroke = beginBrushStrokePure(
      world,
      pressure,
      this._brushSettings.width,
      pointerType !== "pen",
    );
    this.notify();
  }
  extendBrushStroke(world: Vec2, pressure = 0.5): void {
    if (!this.brushStroke) return;
    // Zoom feeds the speed-based pressure simulation (screen-px speed).
    extendBrushStrokePure(this.brushStroke, world, pressure, this._scene.viewport.zoom || 1);
    this.notify();
  }
  commitBrushStroke(): ElementId | null {
    const result = commitBrushStrokePure(
      this._scene,
      this.brushStroke,
      this._activeLayerId,
      newBrushId(++this.nextId),
      brushStyleFromSettings(this._brushSettings),
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
  get pendingBrushStroke(): {
    readonly origin: Vec2;
    readonly points: readonly BrushPoint[];
    readonly pressures: readonly number[];
    readonly baseWidth: number;
    readonly lastRaw: BrushPoint & { readonly pressure: number };
  } | null {
    return this.brushStroke;
  }

  // --- Eraser tool ---

  /**
   * Start an eraser stroke at `world`, seeding it with the shape under it so a
   * plain click erases. With `restore` (Alt held at press) it seeds nothing —
   * the gesture is in un-mark mode, and there's nothing marked yet to rescue.
   */
  beginEraseStroke(world: Vec2, restore = false, strokeErase = false): void {
    const stroke = beginEraseStrokePure(world, strokeErase);
    if (!restore) {
      const hit = this.acceleratedElementAt(world);
      // In stroke-erase mode brushes are cut by the path, not object-deleted —
      // don't seed a brush into `pending`.
      if (hit && !(strokeErase && hit.type === "brush")) stroke.pending.add(hit.id);
    }
    this.eraseStroke = stroke;
    // The initial seed / cut changes the marked set → the first frame must fully
    // repaint so the dim / cut preview shows.
    this.eraseDirty = true;
    // Stroke mode: mark brush points under the press point (degenerate segment)
    // so a click still cuts.
    if (strokeErase) this.markStrokeEraseSegment(stroke, world, world);
    // Start a fading eraser trail (a fresh array so the render-overlay memo
    // rebuilds this frame — same reasoning as `beginLaserStroke`).
    this.interaction.eraserTrail = [beginLaserStrokePure(world, nowMs())];
    this.maybeAnimate();
    this.notify();
  }

  /**
   * Incrementally mark the brush points erased by the eraser segment `a → b`
   * (world). Iterates the current brushes and grows `stroke.erased` in place —
   * O(points) per move (each already-erased point is skipped), so a long drag
   * no longer costs O(points × path length) per frame. Radius is the on-screen
   * eraser ring converted to world units.
   */
  private markStrokeEraseSegment(stroke: EraseStrokeState, a: Vec2, b: Vec2): boolean {
    const zoom = this._scene.viewport.zoom || 1;
    const radius = this._brushSettings.width / zoom;
    let changed = false;
    for (const el of this._scene.elements.values()) {
      if (!isBrush(el)) continue;
      const existing = stroke.erased.get(el.id) ?? [];
      const merged = markErasedIntervals(el, existing, a, b, radius);
      // Grew the covered span (or first coverage of a single-point brush).
      if (
        merged.length > existing.length ||
        coveredLength(merged) > coveredLength(existing) + 1e-6
      ) {
        stroke.erased.set(el.id, merged);
        changed = true;
      }
    }
    return changed;
  }
  /**
   * Extend the eraser stroke to `world`, sweeping shapes along the segment.
   * `restore` (Alt held) un-marks swept shapes instead of marking them.
   */
  extendEraseStroke(world: Vec2, restore = false): void {
    const stroke = this.eraseStroke;
    if (!stroke) return;
    const changed = sampleErasePure(
      stroke.last,
      world,
      (p) => this.acceleratedElementAt(p),
      stroke.pending,
      restore,
      stroke.strokeMode,
    );
    // Incrementally cut brush points along the new segment (stroke mode only).
    const cut = stroke.strokeMode ? this.markStrokeEraseSegment(stroke, stroke.last, world) : false;
    // Only a frame that actually changed the marked / cut set needs the forced
    // full repaint (see `eraseDirty`); a move over already-covered area doesn't.
    if (changed || cut) this.eraseDirty = true;
    stroke.last = world;
    // Grow the fading trail alongside the sweep. Reassign the array reference
    // (like the laser) so the overlay memo repaints the trail on this move. If
    // the trail had faded to empty (a pause with the button held), start a fresh
    // one — otherwise resuming the drag would leave `eraserTrail` empty.
    const trail = this.interaction.eraserTrail;
    const active = trail[trail.length - 1];
    if (active) {
      extendLaserStrokePure(active, world, nowMs());
      this.interaction.eraserTrail = trail.slice();
    } else {
      this.interaction.eraserTrail = [beginLaserStrokePure(world, nowMs())];
    }
    this.maybeAnimate();
    // Always repaint: the cursor ring follows the pointer every move regardless
    // of whether anything was marked / cut. Cheap now — a frame that changes
    // nothing skips the full main pass (see `eraseDirty`) and only redraws the
    // overlay cursor / trail.
    this.notify();
  }
  /**
   * Commit the eraser stroke — delete every swept shape in ONE undo step (with
   * their attached links). No-op delete when nothing was swept. Returns the
   * count removed.
   */
  commitEraseStroke(): number {
    const stroke = this.eraseStroke;
    if (!stroke) return 0;
    this.eraseStroke = null;

    // Object-erase part: delete every swept (non-brush, in stroke mode) shape.
    const objectResult = computeEraseCommit(this._scene, stroke.pending);
    let scene = objectResult ? objectResult.scene : this._scene;
    const patches: Patch[] = objectResult ? [...objectResult.patches] : [];

    // Stroke-erase part (Shift): cut every brush with erased points (accumulated
    // incrementally during the drag) into fragments.
    const removedBrushIds: ElementId[] = [];
    if (stroke.strokeMode) {
      const strokeResult = computeEraseFromMasks(scene, stroke.erased, () =>
        newBrushId(++this.nextId),
      );
      if (strokeResult) {
        scene = strokeResult.scene;
        patches.push(...strokeResult.patches);
        removedBrushIds.push(...strokeResult.removedIds);
      }
    }

    if (patches.length === 0) {
      this.notify();
      return 0;
    }

    // Fold the object-deletes and brush cuts into ONE undo step.
    const tx = this._history.transaction();
    this._scene = scene;
    for (const patch of patches) tx.add(patch);
    tx.commit();
    // Drop any erased ids from the live selection so no stale handle lingers.
    let sel = this._selection;
    for (const id of stroke.pending) sel = Selection.remove(sel, id);
    for (const id of removedBrushIds) sel = Selection.remove(sel, id);
    this._selection = sel;
    this.notify();
    return stroke.pending.size + removedBrushIds.length;
  }
  /** Abort the eraser stroke without deleting anything. */
  cancelEraseStroke(): void {
    if (!this.eraseStroke) return;
    this.eraseStroke = null;
    this.notify();
  }

  // --- Laser pointer ---

  /** True only while the pointer is down in laser mode (a trail is being laid). */
  get laserDrawing(): boolean {
    return this.interaction.laserDrawing;
  }

  /** Start a laser trail at `world` (ephemeral — never enters the scene). */
  beginLaserStroke(world: Vec2): void {
    // Reassign the array (not just `.push`) so its identity changes: the
    // render-overlay memo keys on the `laserStrokes` reference, so an in-place
    // mutation would leave the signature unchanged and the memo would reuse a
    // stale options bag that omits the trail — the trail then wouldn't paint
    // until a later prune reallocated the array (~TTL later). A fresh reference
    // forces the memo to rebuild and the trail to render on this very frame.
    this.interaction.laserStrokes = [
      ...this.interaction.laserStrokes,
      beginLaserStrokePure(world, nowMs()),
    ];
    this.interaction.laserDrawing = true;
    this.maybeAnimate();
    this.notify();
  }
  /** Append a point to the active laser trail (no-op unless drawing). */
  extendLaserStroke(world: Vec2): void {
    if (!this.interaction.laserDrawing) return;
    const strokes = this.interaction.laserStrokes;
    const active = strokes[strokes.length - 1];
    if (!active) return;
    extendLaserStrokePure(active, world, nowMs());
    // Fresh array reference (same reasoning as `beginLaserStroke`) so the
    // overlay memo rebuilds and repaints the growing trail on THIS move,
    // instead of waiting for the animation loop to happen to reallocate it.
    this.interaction.laserStrokes = strokes.slice();
    this.maybeAnimate();
    this.notify();
  }
  /** End the active laser trail — it keeps fading via the animation tick. */
  endLaserStroke(): void {
    this.interaction.laserDrawing = false;
    // The stroke is already ephemeral and the tick prunes it; re-arm in case
    // the tick wasn't running.
    this.maybeAnimate();
  }
  /**
   * True while any laser trail OR eraser trail still has visible points (drives
   * the fade tick — so the trail keeps melting after the pointer stops).
   */
  hasActiveLaser(): boolean {
    return this.interaction.laserStrokes.length > 0 || this.interaction.eraserTrail.length > 0;
  }
  /** Live eraser drag trail (ephemeral, fading). Empty when none active. */
  get eraserTrail(): readonly LaserStroke[] {
    return this.interaction.eraserTrail;
  }
  /**
   * Drop expired laser/eraser trail points (called once per frame before paint).
   * Self-terminating: once both arrays empty the animation tick stops.
   */
  private pruneLaser(): void {
    const strokes = this.interaction.laserStrokes;
    if (strokes.length > 0) {
      const r = pruneLaserStrokes(strokes, nowMs());
      if (r.changed) this.interaction.laserStrokes = r.strokes;
    }
    const trail = this.interaction.eraserTrail;
    if (trail.length > 0) {
      // Prune at the eraser's own (shorter) TTL so points don't linger in the
      // array long after they've faded to invisible.
      const r = pruneLaserStrokes(trail, nowMs(), ERASER_TRAIL_TTL_MS);
      if (r.changed) this.interaction.eraserTrail = r.strokes;
    }
  }

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
    if (this.readOnly) return { kind: "noop" };
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
    if (this.readOnly) return;
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
  public expandSelectionWithDescendants(): ReadonlySet<ElementId> {
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
    // Abort the in-flight gesture AND roll `_scene` back to the pre-gesture
    // snapshot — Esc during any drag/move/resize/endpoint-rebind restores the
    // scene to exactly where it was (cancelling the history tx alone wouldn't).
    this.cancelGesture();
    this.actor.send({ type: "POINTER_CANCEL" });
    this.interaction.resetPreviews();
    // Abort a host-managed link-from-anchor gesture too — it lives outside
    // the machine, so POINTER_CANCEL above doesn't touch it. Without this a
    // gesture left mid-flight would keep its preview after Escape.
    this.interaction.linkDragFromAnchor = null;
    this.interaction.editingLinkCaption = null;
    this.interaction.pendingLinkDropMenu = null;
    // Abort an in-progress eraser stroke (nothing deleted) and stop laying a
    // laser trail — both live outside the machine. Existing laser and eraser
    // trails keep fading via the tick (not hard-cleared here).
    this.interaction.eraseStroke = null;
    this.interaction.laserDrawing = false;
    // Drop any pending flowchart-create preview (Esc / global cancel abandons it).
    this.flowchartSession = null;
    // Waypoint / segment / endpoint-rebind drags: gestureTx.cancel above
    // already reverted the live re-point; just drop the handle-drag state so
    // the dots stop tracking.
    this.linkHandles.reset();
    // Esc exits group-isolation if active. The selection that was
    // active inside the group is dropped (Esc reads as a full
    // "back out" — selecting the group is a separate gesture).
    if (this._enteredGroup !== null) {
      this._enteredGroup = null;
    }
    this._selection = Selection.EMPTY;
    this._selectedLinks = LinkSelection.EMPTY;
    this.notify();
    this.announce("Selection cleared");
  }

  /**
   * Duplicate the selected shapes 10 px down-right of the originals.
   * Links between selected shapes are NOT cloned. Single undo step.
   */
  duplicateSelected(): void {
    if (this.readOnly) return;
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

  /**
   * Clone the selection IN PLACE (zero offset), select the clones, and return
   * the clone of `anchorId` (or null). Unlike `duplicateSelected` this also
   * clones group descendants and frame members, remapping `parentId`/`frameId`
   * among the clones so a duplicated frame keeps its contents. Used by
   * `⌥`-drag duplicate — the caller then drags the clones, leaving the
   * originals. One undo step.
   */
  duplicateSelectedInPlace(anchorId: ElementId | null = null): ElementId | null {
    if (this.readOnly) return null;
    if (this._selection.size === 0) return null;
    // Expand: selection + group descendants (parentId) + frame members (frameId).
    const ids = new Set<ElementId>();
    const addWithDescendants = (id: ElementId): void => {
      if (ids.has(id)) return;
      ids.add(id);
      for (const s of this._scene.elements.values()) {
        if (s.parentId === id || s.frameId === id) addWithDescendants(s.id);
      }
    };
    for (const id of this._selection) addWithDescendants(id);
    // Pre-allocate new ids so cross-references (parentId/frameId) can be remapped.
    const idMap = new Map<ElementId, ElementId>();
    for (const id of ids) idMap.set(id, castElementId(this.uniqueId("shape")));
    const dup = computeDuplicateInPlace(this._scene, ids, idMap);
    const tx = this._history.transaction();
    this._scene = dup.scene;
    for (const patch of dup.patches) tx.add(patch);
    tx.commit();
    // Select the clones of the originally-selected ids.
    const selectedClones: ElementId[] = [];
    for (const id of this._selection) {
      const c = idMap.get(id);
      if (c !== undefined) selectedClones.push(c);
    }
    if (selectedClones.length > 0) this._selection = selectionFromNewIds(selectedClones);
    this.notify();
    return anchorId !== null ? (idMap.get(anchorId) ?? null) : null;
  }
  setSelection(ids: Iterable<ElementId>): void {
    const next = computeSetSelection(this._scene, ids, this._selection);
    if (!next) return;
    this._selection = next;
    if (this._selectedLinks.size > 0) this._selectedLinks = LinkSelection.EMPTY;
    this.notify();
  }
  /**
   * Programmatically select a single link by id (or clear the link
   * selection with `null`), clearing the element selection so the link
   * becomes the sole selection. Used by host navigation (search / jump-to)
   * to frame an edge with {@link zoomToSelection}. No-op when nothing
   * would change.
   */
  selectLink(id: LinkId | null): void {
    const nextLinks = id === null ? LinkSelection.EMPTY : LinkSelection.single(id);
    const linksChanged = !LinkSelection.equals(nextLinks, this._selectedLinks);
    const elementsChanged = this._selection.size > 0;
    if (!linksChanged && !elementsChanged) return;
    this._selection = Selection.EMPTY;
    this._selectedLinks = nextLinks;
    this.notify();
  }
  selectAll(): void {
    const next = computeSelectAll(this._scene, this._selection);
    const nextLinks = computeSelectAllLinks(this._scene);
    const linksChanged = !LinkSelection.equals(nextLinks, this._selectedLinks);
    // `computeSelectAll` returns null when the element set is unchanged;
    // still proceed if the link set changed (e.g. only links left to add).
    if (!next && !linksChanged) return;
    if (next) this._selection = next;
    this._selectedLinks = nextLinks;
    this.notify();
    const count = this._selection.size + this._selectedLinks.size;
    this.announce(`Selected ${count} objects`);
  }

  /**
   * Internal clipboard. Stored as deep-cloned snapshots so subsequent
   * mutations don't affect the buffer. Survives across editor calls
   * within the same session; cross-tab paste uses host-level
   * `navigator.clipboard` (out of scope for the editor).
   */
  private clipboard: Element[] = [];

  copySelected(): void {
    const out = copySelectedPure(this._scene, this._selection);
    if (out.length === 0) return;
    this.clipboard = [...out];
    this.announce(`Copied ${out.length} shapes`);
  }

  cutSelected(): void {
    if (this.readOnly) return;
    this.copySelected();
    this.deleteSelected();
  }

  /**
   * Paste clipboard contents into the scene. The cluster lands so that
   * its centroid sits at `targetWorld` (defaults to the last tracked
   * cursor position; when even that is unavailable, falls back to a
   * +10 px nudge so duplicates stay visible). Relative offsets
   * between clipboard items are preserved.
   *
   * New shapes get fresh ids and end up selected. Single undo step.
   */
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
  /**
   * Capture the visual style of the first selected element into the style
   * buffer, for a later {@link pasteSelectionStyle}. No-op / clears nothing
   * when the selection is empty.
   */
  copySelectionStyle(): void {
    for (const id of this._selection) {
      const el = getElement(this._scene, id);
      if (el !== undefined) {
        this.styleClipboard = { ...el.style };
        return;
      }
    }
  }

  /** Apply the copied style (if any) to every selected element. One undo step. */
  pasteSelectionStyle(): void {
    if (this.styleClipboard === null) return;
    this.updateStyle(this._selection, this.styleClipboard);
  }

  /** Whether a style has been copied and can be pasted. */
  get hasStyleClipboard(): boolean {
    return this.styleClipboard !== null;
  }

  updateStyle(ids: Iterable<ElementId>, partial: Partial<TextStyle>): void {
    if (this.readOnly) return;
    const result = computeUpdateStyle(this._scene, ids, partial);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /**
   * Re-base the width of committed brush strokes (`style.strokeWidth` has no
   * effect on brushes — their widths are baked per point). Scales every baked
   * point width proportionally and records the new `baseWidth`, keeping the
   * stroke's pressure profile. One undo step. Read-only editors ignore it.
   */
  setBrushWidth(ids: Iterable<ElementId>, width: number): void {
    if (this.readOnly) return;
    const result = computeSetBrushWidth(this._scene, ids, width);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /**
   * Apply a partial text style (bold / italic / colour / decoration) to the
   * character range `[from, to)` of a single text element, producing styled
   * runs (rich text). One undo step. No-op when the id isn't a text shape or
   * the range is empty. Read-only editors ignore it. Use this — rather than
   * `updateStyle` — to style only PART of a text block (e.g. the current
   * inline-edit selection).
   */
  applyTextStyleToRange(
    id: ElementId,
    from: number,
    to: number,
    partial: Partial<TextStyle>,
  ): void {
    if (this.readOnly) return;
    const result = computeApplyTextRunStyle(this._scene, id, from, to, partial);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  // --- F8: Eyedropper ---------------------------------------------------

  /**
   * The fill (or stroke, per `role`) colour of the top-most shape under the
   * world point, or `null` on empty canvas. Pure read — no mutation.
   */
  pickColorAt(worldPoint: Vec2, role: "fill" | "stroke" = "fill"): Color | null {
    return pickColorAt(this._scene, worldPoint, role);
  }

  /** One-shot callback armed by {@link beginEyedropperPick}; consumes the next canvas click. */
  private pendingEyedropperPick: ((color: Color) => void) | null = null;

  /** `true` while a colour-picker pipette is armed and waiting for a canvas click. */
  get isEyedropperArmed(): boolean {
    return this.pendingEyedropperPick !== null;
  }

  /**
   * Arm the eyedropper for a one-shot canvas pick that routes the sampled colour
   * to `onPick` (e.g. a colour-picker swatch) instead of the selection fill. Does
   * NOT change the tool mode — the next canvas press is intercepted by
   * {@link applyEyedropperAt}. Cancelled by a mode switch or an empty-canvas click.
   */
  beginEyedropperPick(onPick: (color: Color) => void): void {
    this.pendingEyedropperPick = onPick;
    this.refreshCursor();
    this.notify();
  }

  /**
   * Sample the colour under `worldPoint`. When a pipette pick is armed (see
   * {@link beginEyedropperPick}), route the colour to that callback and disarm.
   * Otherwise apply it as the current selection's fill (programmatic path).
   * Returns the sampled colour, or `null` on empty canvas. Read-only editors
   * sample but don't mutate.
   */
  applyEyedropperAt(worldPoint: Vec2): Color | null {
    const color = pickColorAt(this._scene, worldPoint, "fill");
    const pick = this.pendingEyedropperPick;
    if (pick !== null) {
      this.pendingEyedropperPick = null;
      if (color !== null) pick(color);
      this.refreshCursor();
      this.notify();
      return color;
    }
    if (color === null) return null;
    if (!this.readOnly && this._selection.size > 0) {
      this.updateStyle(this._selection, { fill: color });
    }
    return color;
  }

  // --- F9: Convert element type ----------------------------------------

  /**
   * Convert every convertible selected shape (rectangle / ellipse / diamond)
   * to `target`, preserving position, size and style. One undo step; no-op
   * when nothing applies. See {@link ConvertTarget}.
   */
  convertSelection(target: ConvertTarget): void {
    if (this.readOnly) return;
    const result = computeConvertType(this._scene, this._selection, target);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  // --- F11: Spawn connected node ---------------------------------------

  /**
   * Flowchart auto-generate: clone the single selected node offset in
   * `direction` and connect the two with a fresh link. Selects the new node.
   * No-op unless exactly one element is selected. One undo step.
   */
  spawnConnectedNode(direction: SpawnDirection): void {
    if (this.readOnly) return;
    const ids = [...this._selection];
    const sourceId = ids.length === 1 ? ids[0] : undefined;
    if (sourceId === undefined) return;
    const result = computeSpawnConnectedNode(
      this._scene,
      sourceId,
      direction,
      newElementId(++this.nextId),
      newLinkId(++this.nextId),
    );
    if (!result) return;
    this._scene = result.scene;
    this._history.push({ kind: "batch", patches: [...result.patches] });
    this.setSelection([result.newElementId]);
    this.notify();
  }

  // --- Flowchart CREATE session (Cmd/Ctrl+Arrow, Excalidraw-style) ------

  /**
   * Pending flowchart-create session, or `null` when idle. Holds the ORIGINAL
   * source id + direction, the current sibling `count`, and the pending
   * `elements` + `links` (a PREVIEW — not yet in the scene / history). Grown by
   * {@link growFlowchart}, committed by {@link commitFlowchart}, discarded by
   * {@link cancelFlowchart}.
   */
  private flowchartSession: {
    sourceId: ElementId;
    direction: SpawnDirection;
    count: number;
    elements: Element[];
    links: Link[];
  } | null = null;

  /**
   * Grow the flowchart-create preview one step in `direction`. Starts a session
   * (count = 1) when idle or when the direction changes; otherwise bumps the
   * sibling count up to {@link FLOWCHART_MAX_SIBLINGS}. Recomputes the pending
   * nodes/links from the ORIGINAL source each call. PREVIEW ONLY — never
   * touches the scene or history until {@link commitFlowchart}. No-op in
   * read-only mode or unless exactly one element is selected.
   */
  growFlowchart(direction: SpawnDirection): void {
    if (this._readOnly) return;
    if (this._selection.size !== 1) return;
    const ids = [...this._selection];
    const sourceId = ids[0];
    if (sourceId === undefined || getElement(this._scene, sourceId) === undefined) return;
    const session = this.flowchartSession;
    const count =
      session?.direction === direction && session.sourceId === sourceId
        ? Math.min(session.count + 1, FLOWCHART_MAX_SIBLINGS)
        : 1;
    const { elements, links } = computeSpawnConnectedNodes(
      this._scene,
      sourceId,
      direction,
      count,
      () => newElementId(++this.nextId),
      () => newLinkId(++this.nextId),
    );
    this.flowchartSession = { sourceId, direction, count, elements, links };
    this.notify();
  }

  /**
   * Commit the pending flowchart-create preview: add every pending node + link
   * to the scene as ONE undo step, select the first new node, clear the
   * session. Returns the first new node's id, or `null` when no session is
   * active.
   */
  commitFlowchart(): ElementId | null {
    const session = this.flowchartSession;
    if (session === null) return null;
    let s = this._scene;
    const patches: Patch[] = [];
    for (const el of session.elements) {
      const r = addElement(s, el);
      s = r.scene;
      patches.push(r.patch);
    }
    for (const link of session.links) {
      const r = addLink(s, link);
      s = r.scene;
      patches.push(r.patch);
    }
    this.flowchartSession = null;
    const first = session.elements[0]?.id ?? null;
    if (patches.length === 0) {
      this.notify();
      return first;
    }
    this._scene = s;
    this._history.push({ kind: "batch", patches });
    if (first !== null) this.setSelection([first]);
    this.notify();
    return first;
  }

  /** Discard the pending flowchart-create preview without committing. */
  cancelFlowchart(): void {
    if (this.flowchartSession === null) return;
    this.flowchartSession = null;
    this.notify();
  }

  /**
   * The pending flowchart-create preview (nodes + links), or `null` when no
   * session is active. Read by the render snapshot to paint the preview on the
   * overlay. Reference-stable between renders (only changes on grow / commit /
   * cancel) so the overlay memo doesn't thrash.
   */
  get flowchartPreview(): {
    readonly elements: readonly Element[];
    readonly links: readonly Link[];
  } | null {
    const session = this.flowchartSession;
    if (session === null) return null;
    return { elements: session.elements, links: session.links };
  }

  /**
   * Move the selection to an adjacent node. With exactly one element selected,
   * prefers a graph neighbour (linked node) best aligned with `direction`;
   * falls back to the spatial {@link selectClosest} when no neighbour lies that
   * way. No-op unless exactly one element is selected.
   */
  navigateFlowchart(direction: "left" | "right" | "up" | "down"): void {
    if (this._selection.size !== 1) return;
    const ids = [...this._selection];
    const sourceId = ids[0];
    if (sourceId === undefined) return;
    // Graph neighbours: every element linked to the source by any edge.
    const neighbours = new Set<ElementId>();
    for (const link of this._scene.links.values()) {
      const a = endpointElementId(link.from);
      const b = endpointElementId(link.to);
      if (a === sourceId && b !== undefined && b !== sourceId) neighbours.add(b);
      else if (b === sourceId && a !== undefined && a !== sourceId) neighbours.add(a);
    }
    if (neighbours.size > 0) {
      const ref = this.combinedSelectionBounds();
      const refCenter = ref
        ? { x: ref.x + ref.width / 2, y: ref.y + ref.height / 2 }
        : { x: 0, y: 0 };
      const best = findClosestInDirection(
        this._scene,
        this._selection,
        direction,
        refCenter,
        (el) => this.isElementInteractable(el) && neighbours.has(el.id),
      );
      if (best !== null) {
        this.setSelection([best]);
        return;
      }
    }
    // No graph neighbour that way — fall back to spatial nearest.
    this.selectClosest(direction);
  }

  // --- F10: Image crop --------------------------------------------------

  /**
   * Live image-crop session, or `null` when not cropping. Excalidraw-style:
   * the crop frame IS the element's visible box, and the user drags edge /
   * corner handles inward (hides pixels) or the image body (pans the source).
   *
   * - `id` — the image being cropped.
   * - `crop` — pending normalised source rect.
   * - `position` / `width` / `height` — the pending element box (world position
   *   + local size); a handle drag moves them, a body pan leaves them fixed.
   * - `drag` — the active gesture, or `null` when only hovering.
   * - `dragStartWorld` — pointer world position at drag start (body pan basis).
   *
   * Seeded on {@link beginImageCrop}; committed by {@link commitImageCrop} (one
   * undo step), abandoned by {@link cancelImageCrop}.
   */
  cropSession: {
    id: ElementId;
    crop: ImageCrop;
    position: Vec2;
    width: number;
    height: number;
    drag: { kind: "handle"; handle: CropHandle } | { kind: "body" } | null;
    dragStartWorld: Vec2 | null;
  } | null = null;

  /** The image-crop session (read-only accessor for UI / overlay). */
  get imageCropSession(): {
    readonly id: ElementId;
    readonly crop: ImageCrop;
    readonly position: Vec2;
    readonly width: number;
    readonly height: number;
  } | null {
    const s = this.cropSession;
    if (s === null) return null;
    return { id: s.id, crop: s.crop, position: s.position, width: s.width, height: s.height };
  }

  /**
   * Enter crop mode for the image `id`, seeding the pending crop / box from its
   * current state (or the full image). No-op for non-image shapes or in
   * read-only. Typically triggered by a double-click on an image.
   */
  beginImageCrop(id: ElementId): void {
    if (this.readOnly) return;
    const el = getElement(this._scene, id);
    if (el === undefined || !isImage(el)) return;
    this.cancelInteraction();
    this._selection = Selection.single(id);
    this.cropSession = {
      id,
      crop: el.crop ?? FULL_CROP,
      position: el.position,
      width: el.width,
      height: el.height,
      drag: null,
      dragStartWorld: null,
    };
    this.setActiveTool("crop");
    this.refreshCursor();
    this.notify();
  }

  /**
   * Hit-test `worldPoint` against the pending crop chrome: a crop handle when
   * within {@link CROP_HANDLE_HIT_RADIUS} (screen px, zoom-compensated) of one,
   * `"body"` when inside the window, else `null`. Returns `null` when not
   * cropping.
   */
  cropHandleAtWorld(worldPoint: Vec2): CropHandle | "body" | null {
    const session = this.cropSession;
    if (session === null) return null;
    const el = getElement(this._scene, session.id);
    if (el === undefined) return null;
    const pending = this.pendingCropElement(el);
    const points = cropHandleWorldPoints(pending);
    const zoom = this._scene.viewport.zoom || 1;
    const radius = CROP_HANDLE_HIT_RADIUS / zoom;
    for (const handle of CROP_HANDLES) {
      const p = points[handle];
      if (Math.hypot(worldPoint.x - p.x, worldPoint.y - p.y) <= radius) return handle;
    }
    const local = worldToLocal(pending, worldPoint);
    if (local.x >= 0 && local.x <= session.width && local.y >= 0 && local.y <= session.height) {
      return "body";
    }
    return null;
  }

  /** Begin dragging crop handle `handle` from `worldPoint`. */
  beginImageCropHandle(handle: CropHandle, worldPoint: Vec2): void {
    if (this.cropSession === null) return;
    this.cropSession = {
      ...this.cropSession,
      drag: { kind: "handle", handle },
      dragStartWorld: worldPoint,
    };
  }

  /** Begin panning the image body under the fixed window from `worldPoint`. */
  beginImageCropBody(worldPoint: Vec2): void {
    if (this.cropSession === null) return;
    this.cropSession = { ...this.cropSession, drag: { kind: "body" }, dragStartWorld: worldPoint };
  }

  /**
   * Update the active crop drag to `worldPoint` — resize the window (handle) or
   * pan the source (body). Geometry is recomputed from the ORIGINAL element so
   * it stays stable across many moves. No-op when no drag is active.
   */
  updateImageCropDrag(worldPoint: Vec2): void {
    const session = this.cropSession;
    if (session?.drag == null || session.dragStartWorld === null) return;
    const el = getElement(this._scene, session.id);
    if (el === undefined) return;
    const baseCrop = (el as { readonly crop?: ImageCrop }).crop ?? FULL_CROP;
    if (session.drag.kind === "handle") {
      const r = computeCropHandleDrag(el, baseCrop, session.drag.handle, worldPoint);
      this.cropSession = {
        ...session,
        crop: r.crop,
        position: r.position,
        width: r.width,
        height: r.height,
      };
    } else {
      const r = computeCropBodyPan(el, baseCrop, session.dragStartWorld, worldPoint);
      this.cropSession = { ...session, crop: r.crop };
    }
    this.notify();
  }

  /** Finish the current crop drag (keeps the pending crop / box). */
  endImageCropDrag(): void {
    if (this.cropSession === null) return;
    this.cropSession = { ...this.cropSession, drag: null, dragStartWorld: null };
  }

  /** Apply the pending crop + box and leave crop mode. One undo step. */
  commitImageCrop(): void {
    const session = this.cropSession;
    if (session === null) return;
    const result = computeCommitImageCrop(this._scene, session.id, {
      crop: session.crop,
      position: session.position,
      width: session.width,
      height: session.height,
    });
    this.cropSession = null;
    if (result) {
      this._scene = result.scene;
      this._history.push(result.patch);
    }
    this.setActiveTool("select");
    this.refreshCursor();
    this.notify();
  }

  /** Abandon the crop session without changing the image. */
  cancelImageCrop(): void {
    if (this.cropSession === null) return;
    this.cropSession = null;
    this.setActiveTool("select");
    this.refreshCursor();
    this.notify();
  }

  /**
   * Synthetic element carrying the PENDING crop box (position / size) over the
   * original element's rotation / scale — the frame the user currently sees.
   * Used to project the crop frame and handles.
   */
  private pendingCropElement(el: Element): Element {
    const session = this.cropSession;
    if (session === null) return el;
    return {
      ...el,
      position: session.position,
      width: session.width,
      height: session.height,
    } as Element;
  }

  /**
   * World-space corners (clockwise) of the pending crop frame, or `null` when
   * not cropping. The frame is the pending element box mapped through its
   * local→world transform (so rotation / scale are honoured).
   */
  private cropFrameCorners(): readonly Vec2[] | null {
    const session = this.cropSession;
    if (session === null) return null;
    const el = getElement(this._scene, session.id);
    if (el === undefined) return null;
    const pending = this.pendingCropElement(el);
    const b = getElementLocalBounds(pending);
    return [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ].map((p) => localToWorld(pending, p));
  }

  /**
   * Ghost-image overlay descriptor for the crop session: the ORIGINAL element
   * (its transform + live bitmap handle) and the virtual full-image LOCAL rect
   * the whole bitmap occupies. `null` when not cropping. The overlay paints the
   * full bitmap faintly over this rect so hidden parts stay visible.
   */
  private cropGhost(): { readonly element: Element; readonly fullRect: Bounds } | null {
    const session = this.cropSession;
    if (session === null) return null;
    const el = getElement(this._scene, session.id);
    if (el === undefined) return null;
    const baseCrop = (el as { readonly crop?: ImageCrop }).crop ?? FULL_CROP;
    return { element: el, fullRect: cropFullImageLocalRect(el, baseCrop) };
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
    if (this.readOnly) return;
    const result = computeUpdateTextProps(this._scene, ids, partial);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /**
   * Step the font size of every selected text shape up or down by one gentle
   * multiplicative increment (each shape relative to its own size). One
   * undoable step; no-op when no text is selected.
   */
  adjustSelectionFontSize(direction: "increase" | "decrease"): void {
    if (this.readOnly) return;
    const result = computeAdjustFontSize(this._scene, this._selection, direction);
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
    if (this.readOnly) return;
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

  bringToFront(id?: ElementId): void {
    if (this.readOnly) return;
    const result = computeBringToFront(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }
  sendToBack(id?: ElementId): void {
    if (this.readOnly) return;
    const result = computeSendToBack(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /** Move the target shape one step toward the top of its layer. */
  bringForward(id?: ElementId): void {
    if (this.readOnly) return;
    const result = computeBringForward(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /** Move the target shape one step toward the bottom of its layer. */
  sendBackward(id?: ElementId): void {
    if (this.readOnly) return;
    const result = computeSendBackward(this._scene, id, this._selection);
    if (!result) return;
    this._scene = result.scene;
    this._history.push(result.patch);
    this.notify();
  }

  /**
   * Mirror the current selection about its bounding-box centre on the given
   * axis — `horizontal` flips left↔right, `vertical` flips top↔bottom. A single
   * element flips about its own centre. One undoable step.
   */
  flipSelection(axis: FlipAxis): void {
    this.commitArrange(computeFlipPatches(this._scene, this._selection, axis));
  }

  /**
   * Align the selection to the given edge / centre line of its bounding box
   * (e.g. `left` flushes every shape's left edge; `h-center` lines up
   * horizontal centres). Needs two or more elements. One undoable step.
   */
  alignSelection(edge: AlignEdge): void {
    this.commitArrange(computeAlignPatches(this._scene, this._selection, edge));
  }

  /**
   * Evenly space the selection along the given axis so the gaps between
   * adjacent shapes are equal; the outermost shapes stay put. Needs three or
   * more elements. One undoable step.
   */
  distributeSelection(axis: DistributeAxis): void {
    this.commitArrange(computeDistributePatches(this._scene, this._selection, axis));
  }

  /**
   * Rotate the whole selection by `delta` radians about its bounding-box centre
   * (a single shape turns about its own centre). One undoable step. The live
   * rotate gesture drives the same maths from a press-time snapshot.
   */
  rotateSelection(delta: number): void {
    const elements: Element[] = [];
    const origin = new Map<ElementId, { position: Vec2; rotation: number }>();
    for (const id of this._selection) {
      const el = getElement(this._scene, id);
      if (el === undefined) continue;
      elements.push(el);
      origin.set(id, { position: el.position, rotation: el.rotation });
    }
    if (elements.length === 0) return;
    const pivot = selectionCenter(elements);
    this.commitArrange(computeRotatePatches(this._scene, origin, pivot, delta));
  }

  /** Apply a batch of arrange patches as a single undoable step. */
  private commitArrange(patches: readonly Patch[]): void {
    if (this.readOnly) return;
    if (patches.length === 0) return;
    const tx = this._history.transaction();
    for (const patch of patches) {
      this._scene = apply(this._scene, patch);
      tx.add(patch);
    }
    tx.commit();
    this.notify();
  }
  compactLayerZOrder(layerId?: LayerId, options: { recordHistory?: boolean } = {}): void {
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
    if (this.readOnly) return;
    if (this._scene.elements.size === 0 && this._scene.links.size === 0) return;
    this._scene = {
      ...this._scene,
      elements: new Map(),
      links: new Map(),
    };
    this._selection = Selection.EMPTY;
    this._selectedLinks = LinkSelection.EMPTY;
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
    if (this.readOnly) return;
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
  /** Fit the camera to the current selection (standard `⌥2`). No-op when empty. */
  zoomToSelection(padding = 80): void {
    const bounds = this.combinedSelectionBounds();
    if (!bounds) return;
    const next = computeZoomToBounds(this._scene, bounds, padding);
    if (!next) return;
    this._scene = next;
    this.notify();
  }

  /**
   * Center the camera on the current selection for a reveal / jump-to (search
   * navigation). Unlike {@link zoomToSelection}, it does NOT fill the screen —
   * a small match keeps its size and is merely centered; the zoom only drops to
   * fit an oversized match. No-op when the selection is empty.
   */
  revealSelection(padding = 80): void {
    const bounds = this.combinedSelectionBounds();
    if (!bounds) return;
    const next = computeRevealBounds(this._scene, bounds, padding);
    if (!next) return;
    this._scene = next;
    this.notify();
  }

  /**
   * Select the nearest interactable top-level element in `direction` from the
   * current selection's centre (or the viewport centre when nothing is
   * selected). standard `⌘`+arrows. Candidates must lie within a 45° cone of the
   * direction; the closest by along+lateral distance wins. No-op when nothing
   * qualifies.
   */
  selectClosest(direction: "left" | "right" | "up" | "down"): void {
    const ref = this.combinedSelectionBounds();
    const vp = this._scene.viewport;
    const refCenter = ref
      ? { x: ref.x + ref.width / 2, y: ref.y + ref.height / 2 }
      : {
          x: vp.pan.x + vp.size.width / 2 / vp.zoom,
          y: vp.pan.y + vp.size.height / 2 / vp.zoom,
        };
    const best = findClosestInDirection(this._scene, this._selection, direction, refCenter, (s) =>
      this.isElementInteractable(s),
    );
    if (best === null) return;
    this.setSelection([best]);
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
  setGrid(patch: { enabled?: boolean; style?: GridStyle; snap?: boolean }): void {
    const next = computeSetGrid(this._scene, patch);
    if (!next) return;
    this._scene = next;
    this.notify();
  }

  /** Whether snap-to-grid is currently enabled (default on). */
  get snapToGridEnabled(): boolean {
    return isSnapToGridEnabled(this._scene.viewport);
  }

  /** Toggle snap-to-grid on/off. Persists in the viewport. */
  setSnapToGrid(enabled: boolean): void {
    this.setGrid({ snap: enabled });
  }

  /**
   * Host hook: while held, the next move/resize/create gesture ignores
   * snap-to-grid (Cmd/Ctrl modifier). The app wires keydown/keyup
   * of the modifier to this. Idempotent; never touches history.
   */
  setSnapSuppressed(suppressed: boolean): void {
    this.interaction.snapSuppressed = suppressed;
  }

  /**
   * Host hook: mirror the Alt / Shift modifier state so an in-flight resize or
   * move reacts to it — `alt` resizes about the centre, `shift` locks the
   * resize aspect ratio (or constrains a move to one axis). The app wires
   * keydown/keyup of the modifiers to this. Idempotent; never touches history.
   */
  setTransformModifiers(mods: { readonly alt: boolean; readonly shift: boolean }): void {
    this.interaction.transformAltKey = mods.alt;
    this.interaction.transformShiftKey = mods.shift;
  }

  /**
   * True when a gesture should snap. Snapping is coupled to grid display:
   * it is active only while the grid is enabled (`gridEnabled`) — snapping to
   * a hidden grid is confusing. `snapToGrid` is an extra programmatic opt-out;
   * the suppress modifier (Cmd/Ctrl) bypasses snapping for the current gesture.
   */
  private snapActive(): boolean {
    const viewport = this._scene.viewport;
    return (
      !this.interaction.snapSuppressed && viewport.gridEnabled && isSnapToGridEnabled(viewport)
    );
  }

  /** World-unit spacing the current gesture snaps to. */
  private snapSpacing(): number {
    return resolveSnapSpacing();
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
    animScene.rehydrateAnimatedImages(this);
    // Rebuild live handles for static images from Scene.files — their
    // serialised handle is gone and `src` is a dead `blob:` URL after a
    // reload. Async; repaints itself when the decode lands.
    void animScene.rehydrateStaticImages(this);
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
    this.disposed = true;
    this.cancelLongPress();
    this.unbind();
    this.actor.stop();
    this.listeners.clear();
    this.cursorListeners.clear();
    this.longPressListeners.clear();
    this.announceListeners.clear();
    this.animation.detach();
    this.animationContentOff?.();
    if (this.renderRafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
  }

  // --- Internal ---

  private bindPointerEvents(): () => void {
    return bindPointerEventsExternal(this);
  }

  /**
   * Open a pan gesture: capture the pointer so subsequent move / up
   * events arrive even outside the host bounds, cancel anything the
   * machine might have started this tick, and switch the cursor.
   */
  public beginPanGesture(pointerId: number, button: number, point: Vec2): void {
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
    this.refreshCursor(); // → "grabbing" while panGesture is set
  }

  /**
   * End an in-progress pan gesture. Restores the cursor unless Space
   * is still held (then we drop back to "grab" so the user knows
   * another drag is armed). For right-click that didn't move past
   * the slop threshold, fires the long-press callback so the context
   * menu opens at the click position — that's the "right-click =
   * menu, right-drag = pan" decision rule.
   */
  public endPanGesture(): void {
    const gesture = this.panGesture;
    this.panGesture = null;
    if (gesture && (gesture.button === 2 || gesture.button === 1) && !gesture.moved) {
      // Right-click without a drag → trigger the context-menu listeners.
      // Same payload as touch long-press so existing UI (e.g.
      // `@react-ui/ContextMenu`) works without changes.
      const worldPoint = this.screenToWorld(gesture.startPoint);
      for (const fn of this.longPressListeners) {
        fn({ screenPoint: gesture.startPoint, worldPoint });
      }
    } else {
      // Either it was a real drag, or Space + left drag. In both cases the
      // native context menu stays suppressed until the upcoming
      // `contextmenu` event lands (Chrome fires it after pointerup on the
      // right button).
    }
    // Pan over — recompute (→ "grab" if Space/hand still armed, else the
    // idle hover cursor).
    this.refreshCursor();
  }

  public isDrawingPhase(ctx: InteractionContext): boolean {
    return (
      ctx.mode === "draw-rect" ||
      ctx.mode === "draw-ellipse" ||
      ctx.mode === "draw-frame" ||
      ctx.mode === "draw-edge"
    );
  }

  // --- Long-press ---

  public startLongPress(screenPoint: Vec2): void {
    this.longPress.start(screenPoint);
  }
  public cancelLongPress(): void {
    this.longPress.cancel();
  }

  // --- Pinch gesture ---
  public beginPinch(): void {
    this.pinch.begin([...this.activePointers.values()]);
  }
  public applyPinch(): void {
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

  // Editor passes a narrow context bundle that closes over its
  // private state + accel helpers (acceleratedElementAt,
  // isElementInteractable, …).
  /**
   * Attach target under `worldPoint` for an endpoint-rebind drop: the topmost
   * interactable ELEMENT (group-promoted), ignoring link bodies and the dragged
   * link's own endpoint handle. Used instead of {@link hitTest} when finishing
   * an endpoint drag — `hitTest` would return the (now live, cursor-tracking)
   * endpoint handle and shadow the element beneath it, blocking re-binding.
   * `undefined` → dropped on empty space (the end stays a free point).
   */
  public linkAttachTargetAt(worldPoint: Vec2): PressTarget | undefined {
    const shape = this.acceleratedElementAt(worldPoint);
    if (shape && this.isElementInteractable(shape)) {
      const target = this.promoteToGroupRoot(shape);
      return { kind: "element", id: target.id, bounds: getElementWorldBounds(target) };
    }
    return undefined;
  }

  public hitTest(worldPoint: Vec2): PressTarget {
    return pickPressTarget(worldPoint, {
      scene: this._scene,
      selection: this._selection,
      // Selection chrome (resize / rotate / endpoint handles) is pressable
      // only under the select tool — a creation tool's press on a selected
      // shape must start the new element / link instead.
      selectionChromeActive: this.activeTool.type === "select",
      selectedLink: this.selectedLink,
      selectedLinkCount: this._selectedLinks.size,
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

  /**
   * Recompute the canvas cursor from the current interaction state and apply
   * it to the host element. Single chokepoint — called from pointer-move
   * (hover), gesture begin/end, and mode changes so the cursor never drifts
   * out of sync. `worldPoint` defaults to the last known pointer position.
   */
  refreshCursor(worldPoint?: Vec2): void {
    const next = computeCursor(this, worldPoint ?? this.lastPointerWorld);
    if (this.host.style.cursor !== next) this.host.style.cursor = next;
  }

  /**
   * Register (or clear, with `null`) a custom cursor image for a state role.
   * The image is shown wherever `computeCursor` resolves that role; pass a
   * `CursorSpec` object for a DPR-aware image (`image-set(1x, 2x)`) with a
   * hotspot + keyword fallback, or a raw CSS cursor string. Host-only view
   * state — not persisted.
   */
  setCursorOverride(role: CursorRole, spec: CursorSpec | null): void {
    if (spec === null) this.cursorOverrides.delete(role);
    else this.cursorOverrides.set(role, spec);
    this.refreshCursor();
  }

  /**
   * Read-only lookup of a host-registered cursor override. Used by the cursor
   * module to resolve a role without exposing the mutable override map (mutate
   * only via {@link setCursorOverride}, so `refreshCursor` stays in sync).
   */
  getCursorOverride(role: CursorRole): CursorSpec | undefined {
    return this.cursorOverrides.get(role);
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
    if (isElementHidden(this._scene, shape)) return false;
    // NOTE: a `locked` element IS interactable for SELECTION (so the user can
    // click it to unlock) — movement / resize are blocked separately via
    // `isElementManipulable`. Click-through past a locked shape is therefore
    // disabled, matching standard.
    return true;
  }

  /**
   * Can this shape be moved / resized? False when the shape (or an ancestor)
   * is `locked`, its layer is locked, or it's hidden. Distinct from
   * `isElementInteractable`, which still allows selecting a locked shape so it
   * can be unlocked.
   */
  public isElementManipulable(shape: Element): boolean {
    if (this.isLayerLocked(shape.layerId)) return false;
    if (isElementLocked(this._scene, shape)) return false;
    if (isElementHidden(this._scene, shape)) return false;
    return true;
  }

  /**
   * Toggle the `locked` flag on the selection (standard `⌘⇧L`). If any selected
   * element is currently unlocked, lock all; otherwise unlock all. One undo
   * step. A locked element stays selectable (click → select → unlock) but
   * can't be moved or resized.
   */
  toggleLockSelection(): void {
    if (this.readOnly) return;
    if (this._selection.size === 0) return;
    const ids = [...this._selection];
    const anyUnlocked = ids.some((id) => getElement(this._scene, id)?.locked !== true);
    const tx = this._history.transaction();
    for (const id of ids) {
      const r = updateElement(this._scene, id, (s) => {
        const copy: typeof s = { ...s };
        if (anyUnlocked) (copy as { locked?: boolean }).locked = true;
        else delete (copy as { locked?: boolean }).locked;
        return copy;
      });
      this._scene = r.scene;
      tx.add(r.patch);
    }
    tx.commit();
    this.notify();
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
   * with a group ancestor enters that group.
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
  public computeHiddenElements(): ReadonlySet<ElementId> | undefined {
    return computeHiddenElementsPure(this._scene);
  }

  /**
   * Live stroke-erase preview: while a Shift-held eraser gesture drags, the
   * fragments each touched brush WOULD become, plus the set of touched
   * originals to hide in the main pass. `null` outside a stroke-erase gesture
   * or when the path touches no brush. Recomputed each frame from the
   * path-so-far — never mutates the scene or history.
   */
  private computeStrokeErasePreview(): {
    readonly elements: readonly Element[];
    readonly hidden: ReadonlySet<ElementId>;
  } | null {
    const stroke = this.eraseStroke;
    if (!stroke || !stroke.strokeMode || stroke.erased.size === 0) return null;
    const preview = computeStrokeErasePreviewFromMasks(this._scene, stroke.erased);
    if (!preview) return null;
    return { elements: preview.fragments, hidden: preview.hidden };
  }

  public computeDimElements(enteredGroupId: ElementId): ReadonlySet<ElementId> {
    return computeDimElementsHelper(this._scene, this._selection, enteredGroupId);
  }

  /**
   * Dim set fed to the renderer: group-isolation dim UNION the eraser's
   * pending-delete set (shapes swept by the current eraser stroke are shown
   * dimmed so the user sees what release will delete). `undefined` when neither
   * is active, keeping the fast tile-cache render path.
   */
  private computeDimSet(): ReadonlySet<ElementId> | undefined {
    const group = this._enteredGroup ? this.computeDimElements(this._enteredGroup) : undefined;
    const erase = this.interaction.eraseStroke?.pending;
    if (!erase || erase.size === 0) return group;
    const merged = new Set<ElementId>(group);
    for (const id of erase) merged.add(id);
    return merged;
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

  /**
   * Enter the single selected container — select its contents (standard `⌘⇧↓`).
   * Members are children via `parentId` (group / template container) or via
   * `frameId` (frame). For a group we also set `enteredGroup` so subsequent
   * clicks land on children. No-op unless exactly one container with members
   * is selected.
   */
  enterContainer(): void {
    if (this._selection.size !== 1) return;
    const id = req([...this._selection][0]);
    const el = getElement(this._scene, id);
    if (!el) return;
    const isFrameEl = isFrame(el);
    const members: ElementId[] = [];
    for (const s of this._scene.elements.values()) {
      if (s.parentId === id || (isFrameEl && s.frameId === id)) members.push(s.id);
    }
    if (members.length === 0) return;
    if (isGroup(el)) this._enteredGroup = id;
    this.setSelection(members);
  }

  /**
   * Exit to the container of the current selection — select the parent group /
   * template container (`parentId`) or frame (`frameId`) when every selected
   * element shares one (standard `⌘⇧↑`). Clears `enteredGroup`. No-op when there
   * is no single common container.
   */
  exitContainer(): void {
    if (this._selection.size === 0) return;
    let parent: ElementId | undefined;
    let common = true;
    for (const sid of this._selection) {
      const s = getElement(this._scene, sid);
      const p = s?.parentId ?? s?.frameId;
      if (p === undefined) {
        common = false;
        break;
      }
      if (parent === undefined) parent = p;
      else if (parent !== p) {
        common = false;
        break;
      }
    }
    this._enteredGroup = null;
    if (common && parent !== undefined) this.setSelection([parent]);
    else this.notify();
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
  public acceleratedElementAt(worldPoint: Vec2): Element | undefined {
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
  public ensureSpatialIndex(): SpatialGrid {
    const cached = this.spatialIndexCache;
    if (cached?.scene === this._scene) return cached.index;
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
  public routeIsolationClick(clickEffect: InteractionEmit | null, worldPoint: Vec2): boolean {
    const now = performance.now();
    const isDouble =
      now - this.interaction.lastClickAt < DOUBLE_CLICK_MS &&
      this.interaction.lastClickWorldPoint !== null &&
      vec2.distance(this.interaction.lastClickWorldPoint, worldPoint) <= DOUBLE_CLICK_TOLERANCE_PX;
    this.interaction.lastClickAt = now;
    this.interaction.lastClickWorldPoint = worldPoint;

    // Double-click the frame HEADER (label strip above the body) → rename.
    // Checked before the clickEffect gate because the header sits outside
    // the frame's hit-test bounds, so the click produces SELECT_CLEAR (or
    // no effect), not a frame select.
    if (isDouble) {
      const headerFrame = this.frameHeaderAt(worldPoint);
      if (headerFrame !== null) {
        this.beginFrameNameEdit(headerFrame);
        return true;
      }
    }

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
      this._selectedLinks = LinkSelection.single(clickEffect.id);
      this._selection = Selection.EMPTY;
      this.beginLinkCaptionEdit(clickEffect.id);
      return true;
    }
    if (
      isDouble &&
      (clickEffect.type === "SELECT_REPLACE" || clickEffect.type === "SELECT_TOGGLE")
    ) {
      const raw = this.acceleratedElementAt(worldPoint);
      if (raw !== undefined && isText(raw)) {
        this.beginTextEdit(raw.id);
        return true;
      }
      if (raw !== undefined && isFrame(raw)) {
        this.beginFrameNameEdit(raw.id);
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
          if (this._selectedLinks.size > 0) this._selectedLinks = LinkSelection.EMPTY;
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

  public applyEmit(emit: InteractionEmit): void {
    // Read-only gate: in view mode every scene-mutating emit is dropped
    // (create / move / resize / rotate / annotation / edge edits + their
    // live previews). Selection + lasso emits fall through so a viewer can
    // still click / marquee-select and pan / zoom the document.
    if (this._readOnly && READ_ONLY_BLOCKED_EMITS.has(emit.type)) return;
    switch (emit.type) {
      case "SELECT_REPLACE":
        // Plain element click replaces the whole selection (elements + links).
        this._selection = Selection.single(emit.id);
        this._selectedLinks = LinkSelection.EMPTY;
        this.notify();
        return;
      case "SELECT_TOGGLE":
        // Shift/meta element click toggles the element; selected links stay.
        this._selection = Selection.toggle(this._selection, emit.id);
        this.notify();
        return;
      case "SELECT_CLEAR":
        this._selection = Selection.EMPTY;
        this._selectedLinks = LinkSelection.EMPTY;
        this.notify();
        return;
      case "SELECT_EDGE_REPLACE":
        // Plain link click replaces the whole selection with this one link.
        this._selectedLinks = LinkSelection.single(emit.id);
        this._selection = Selection.EMPTY;
        this.notify();
        return;
      case "SELECT_EDGE_TOGGLE":
        // Shift/meta link click toggles the link; selected elements stay.
        this._selectedLinks = LinkSelection.toggle(this._selectedLinks, emit.id);
        this.notify();
        return;
      case "SELECT_EDGE_CLEAR":
        if (this._selectedLinks.size > 0) {
          this._selectedLinks = LinkSelection.EMPTY;
          this.notify();
        }
        return;
      case "UPDATE_EDGE_ENDPOINT_PREVIEW":
        this.applyLinkEndpointMove(emit.linkId, emit.side, emit.toPoint);
        return;
      case "UPDATE_EDGE_ENDPOINT":
        this.applyLinkEndpointUpdate(emit);
        return;
      case "LASSO_PROGRESS":
        // Capture the pre-lasso selection on the first progress emit
        // of a gesture; subsequent emits use it as the additive base.
        this.interaction.lassoBaseSelection ??= this._selection;
        this.interaction.lassoBaseLinks ??= this._selectedLinks;
        this.lassoPreview = emit.bounds;
        this.applyLassoLiveSelection(emit.bounds, emit.mode);
        this.notify();
        return;
      case "LASSO_CLEAR":
        if (
          this.lassoPreview !== null ||
          this.interaction.lassoBaseSelection !== null ||
          this.interaction.lassoBaseLinks !== null
        ) {
          this.lassoPreview = null;
          this.interaction.lassoBaseSelection = null;
          this.interaction.lassoBaseLinks = null;
          this.notify();
        }
        return;
      case "SELECT_BY_BOUNDS":
        // Final commit — uses the same logic as the live preview so
        // the visible selection matches what lands. Reset the base
        // snapshot so the next gesture re-captures it.
        this.interaction.lassoBaseSelection = null;
        this.interaction.lassoBaseLinks = null;
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
      case "ROTATE":
        this.applyRotate(emit.deltaAngle);
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

  private applyMove(id: ElementId, delta: Vec2, originalBounds: Bounds): void {
    // Locked / layer-locked elements are selectable but don't move.
    const el = getElement(this._scene, id);
    if (el && !this.isElementManipulable(el)) return;
    // Shift constrains the drag to one axis before snapping.
    const moved = this.interaction.transformShiftKey ? constrainDeltaToAxis(delta) : delta;
    const d = this.snapActive() ? snapMoveDelta(originalBounds, moved, this.snapSpacing()) : moved;
    const patch = computeElementMovePatch(this._scene, id, d, originalBounds);
    if (!patch) return;
    this._scene = apply(this._scene, patch);
    this.recordGesturePatch(patch);
    this.notify();
  }

  private applyGroupMove(delta: Vec2): void {
    if (!this.groupMoveOrigin) return;
    // Shift constrains the drag to one axis before snapping.
    const moved = this.interaction.transformShiftKey ? constrainDeltaToAxis(delta) : delta;
    const d = this.snapActive()
      ? snapGroupDelta(this.groupMoveOrigin, moved, this.snapSpacing())
      : moved;
    const patches = computeGroupMovePatches(this._scene, this.groupMoveOrigin, d);
    for (const patch of patches) {
      this._scene = apply(this._scene, patch);
      this.recordGesturePatch(patch);
    }
    // Selected links + connectors bound on both ends to moved elements
    // translate with the drag (standard parity) — shifted by the
    // same delta from the press-time snapshot.
    if (this.groupLinkMoveOrigin) {
      const linkPatches = computeMovingLinkPatches(this._scene, this.groupLinkMoveOrigin, d);
      for (const patch of linkPatches) {
        this._scene = apply(this._scene, patch);
        this.recordGesturePatch(patch);
      }
    }
    this.notify();
  }

  public computeViewportWorld(): Bounds | null {
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
  public computeDirtyWorld(): Bounds | null {
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
      this.lassoPreview !== null ||
      // Eraser sweep: marking / un-marking / cutting changes what's shown
      // WITHOUT mutating the scene, so the scene-diff dirty rect is empty and
      // the change would never repaint. Force a full repaint — but ONLY on the
      // frames that actually changed the marked / cut set (`eraseDirty`), so a
      // slowly-moving or stopped cursor doesn't re-render the whole scene every
      // frame (which froze big scenes).
      (this.interaction.eraseStroke !== null && this.eraseDirty)
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
    // Eraser just STOPPED (the active-stroke guard above already returned, so
    // `eraseStroke` is null here): on an Esc-cancel the marked shapes un-dim
    // without a scene change — commit changes the scene and is caught by the
    // diff — so force a full repaint that frame or the dim would linger.
    if (this.lastRenderedEraseActive) return null;
    // Diff the two scenes for the dirty rect + tile-cache invalidation. The
    // state-coupled guards above stay here; the pure scene diff lives in
    // `computeSceneDirtyRect`.
    const { world, tileDirty } = computeSceneDirtyRect(prev, next);
    if (this.tileComposeFn !== null) {
      for (const [id, entry] of tileDirty) this.tileDirtyElements.set(id, entry);
    }
    return world;
  }

  public combinedSelectionBounds(): Bounds | null {
    let acc = combinedSelectionBoundsPure(this._scene, this._selection);
    // Selected links join the selection box (standard parity) — union in
    // each link's drawn-path AABB so the rectangle frames connectors too.
    for (const id of this._selectedLinks) {
      const edge = getLink(this._scene, id);
      if (!edge) continue;
      const path = getLinkPath(this._scene, edge);
      if (!path || path.length === 0) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of path) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const b: Bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      acc = acc ? B.union(acc, b) : b;
    }
    return acc;
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
  public selectionIsAspectLocked(): boolean {
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
      const el = getElement(this._scene, id);
      if (el === undefined || !isImage(el)) return false;
    }
    return true;
  }

  /**
   * Per-frame rotate during a grip drag: turn the press-time snapshot by
   * `deltaAngle` about its pivot. Shift snaps the swept angle to
   * {@link ROTATE_SNAP_RADIANS} steps. Recorded as gesture patches (one undo
   * step on commit).
   */
  private applyRotate(deltaAngle: number): void {
    const gesture = this.rotateGestureOrigin;
    if (!gesture) return;
    const d = this.interaction.transformShiftKey
      ? Math.round(deltaAngle / ROTATE_SNAP_RADIANS) * ROTATE_SNAP_RADIANS
      : deltaAngle;
    const patches = computeRotatePatches(this._scene, gesture.origin, gesture.pivot, d);
    for (const patch of patches) {
      this._scene = apply(this._scene, patch);
      this.recordGesturePatch(patch);
    }
    this.notify();
  }

  private applyGroupResize(handle: HandleId, delta: Vec2, originalBounds: Bounds): void {
    if (!this.groupResizeOrigin) return;
    const d = this.snapActive()
      ? snapResizeDelta(originalBounds, handle, delta, this.snapSpacing())
      : delta;
    const result = computeGroupResizePatches(
      this._scene,
      this.groupResizeOrigin,
      handle,
      d,
      originalBounds,
      // Aspect-locked when the selection type demands it (images / groups) or
      // the user holds Shift for this gesture.
      this.selectionIsAspectLocked() || this.interaction.transformShiftKey,
      this.interaction.transformAltKey,
    );
    this._scene = result.scene;
    for (const patch of result.patches) this.recordGesturePatch(patch);
    this.notify();
  }

  private applyResize(id: ElementId, handle: HandleId, delta: Vec2, originalBounds: Bounds): void {
    const shape = getElement(this._scene, id);
    // Rotated shape: the axis-aligned world resize below would corrupt it
    // (handles live on the tilted box). Resize in the shape's own frame,
    // keeping the opposite corner fixed in world. Snapshot the pristine pose
    // on the first tick so the closed-form never compounds. Grid-snap is
    // skipped — snapping a tilted box to the world grid is ill-defined.
    if (shape !== undefined && !isText(shape) && shape.rotation !== 0) {
      if (this.interaction.resizeOriginElement?.id !== id)
        this.interaction.resizeOriginElement = shape;
      const result = computeRotatedElementResize(
        this._scene,
        this.interaction.resizeOriginElement,
        handle,
        delta,
        this.interaction.transformShiftKey,
        this.interaction.transformAltKey,
      );
      if (!result) return;
      this._scene = result.scene;
      this.recordGesturePatch(result.patch);
      this.notify();
      return;
    }
    const d = this.snapActive()
      ? snapResizeDelta(originalBounds, handle, delta, this.snapSpacing())
      : delta;
    // Text: aspect-locked font scaling. Snapshot the pristine shape on
    // the gesture's first tick so the scale base never compounds.
    if (shape !== undefined && isText(shape)) {
      if (this.interaction.resizeOriginElement?.id !== id) {
        this.interaction.resizeOriginElement = shape;
      }
      // The snapshot was taken from a text shape above; fall back to the
      // live shape if a stale non-text snapshot ever leaks through.
      const origin = this.interaction.resizeOriginElement;
      const textOrigin = isText(origin) ? origin : shape;
      const result = computeTextResize(
        this._scene,
        textOrigin,
        handle,
        d,
        originalBounds,
        this.interaction.transformAltKey,
      );
      if (!result) return;
      this._scene = result.scene;
      this.recordGesturePatch(result.patch);
      this.notify();
      return;
    }
    const result = computeElementResize(
      this._scene,
      id,
      handle,
      d,
      originalBounds,
      (s, raw, h) => this.clampContainerToChildren(s, raw, h),
      this.interaction.transformShiftKey,
      this.interaction.transformAltKey,
    );
    if (!result) return;
    this._scene = result.scene;
    this.recordGesturePatch(result.patch);
    this.notify();
  }

  /**
   * Snap freshly-drawn bounds onto the grid when snapping is active.
   * Shared by the live rubber-band preview and the final CREATE so the
   * preview shows exactly where the shape will land (parity with how
   * move / resize snap live during the gesture).
   */
  snapCreateBoundsIfActive(bounds: Bounds): Bounds {
    return this.snapActive() ? snapCreateBounds(bounds, this.snapSpacing()) : bounds;
  }

  private applyCreate(kind: "rect" | "ellipse" | "frame", bounds: Bounds): void {
    const id = newElementId(++this.nextId);
    const b = this.snapCreateBoundsIfActive(bounds);
    const result = computeCreateElement(this._scene, kind, b, id, this._activeLayerId, () =>
      this.nextFrameName(),
    );
    this._scene = result.scene;
    this._selection = Selection.single(id);
    // CREATE is a single-shot operation, not part of a multi-tick gesture.
    this._history.push(result.patch);
    // Frame-specific: scoop up every shape whose centre lies inside
    // the new frame's bounds and tag them with `frameId`.
    if (kind === "frame") {
      this.assignFrameMembers(id, b);
    }
    this.maybeRevertToolAfterCreate();
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
    this._scene = assignFrameMembersHelper(this._scene, this._history, frameId, frameBounds);
  }

  /**
   * Re-evaluate frame membership at the end of a move / resize gesture —
   * elements dropped inside a frame join it, those dragged out are
   * released (standard "membership on drop"). Runs inside the gesture
   * transaction (called from pointer-up before `commitGesture`) so the
   * frameId changes undo together with the drag. No-op when nothing
   * changed.
   */
  public reconcileFrameMembership(): void {
    this._scene = reconcileFrameMembershipHelper(this._scene, this._history);
  }

  // Endpoint snapping stays here because it needs the snap engine.
  private applyCreateLink(emit: Extract<InteractionEmit, { type: "CREATE_EDGE" }>): void {
    const from = this.snapLinkEndpoint(emit.fromElement, emit.fromPoint);
    const to = this.snapLinkEndpoint(emit.toElement, emit.toPoint);
    const id = newLinkId(++this.nextId);
    const result = computeCreateLink(this._scene, from, to, id, this._activeLayerId);
    this._scene = result.scene;
    this._history.push(result.patch);
    this.edgePreview = null;
    this.maybeRevertToolAfterCreate();
    // Dropped on empty canvas (free `point` end) → offer a shape-picker at
    // the drop point (standard). The free-ended link stays; picking re-points
    // it, dismissing keeps it. Only the `to` end is user-dragged here.
    if (to.kind === "point") {
      this.interaction.pendingLinkDropMenu = { linkId: id, side: "to", world: to.position };
    }
    this.notify();
  }

  /** Pending shape-picker after a link was dropped on empty canvas. */
  get linkDropMenu(): { linkId: LinkId; side: "from" | "to"; world: Vec2 } | null {
    return this.interaction.pendingLinkDropMenu;
  }

  /**
   * Resolve a pending link-drop shape-picker by creating an element from
   * `factory` centred at the drop point and re-pointing the dropped link
   * end to float against it. Element + re-point land in one undo step; the
   * new element becomes the selection. No-op when no menu is pending.
   */
  placeShapeAtLinkDrop(
    factory: (ctx: {
      id: ElementId;
      layerId: LayerId;
      position: Vec2;
      order: FractionalIndex;
    }) => Element,
  ): void {
    const pending = this.interaction.pendingLinkDropMenu;
    if (!pending) return;
    const link = getLink(this._scene, pending.linkId);
    if (!link) {
      this.interaction.pendingLinkDropMenu = null;
      this.notify();
      return;
    }
    const newId = newElementId(++this.nextId);
    const r = computeShapeAtLinkDrop(this._scene, this._activeLayerId, pending, newId, factory);
    const tx = this._history.transaction();
    this._scene = r.scene;
    tx.add(r.addPatch);
    tx.add(r.linkPatch);
    tx.commit();

    this.interaction.pendingLinkDropMenu = null;
    this._selection = Selection.single(newId);
    this._selectedLinks = LinkSelection.EMPTY;
    this.notify();
  }

  /** Dismiss the link-drop shape-picker, leaving the free-ended link. */
  dismissLinkDropMenu(): void {
    if (!this.interaction.pendingLinkDropMenu) return;
    this.interaction.pendingLinkDropMenu = null;
    this.notify();
  }

  /**
   * standard "click a link-start dot" gesture: spawn a new element in that
   * dot's outward direction and link the source to it. The clone copies
   * the source's type / style / size but NOT its text (a fresh blank of
   * the same kind). Direction is source → new; the new element becomes the
   * selection. Element + link land in one undo step.
   */
  public createLinkedElementFromAnchor(fromElement: ElementId, anchorName: string): void {
    const newId = newElementId(++this.nextId);
    const linkId = newLinkId(++this.nextId);
    const r = computeLinkedElementFromAnchor(
      this._scene,
      this._activeLayerId,
      fromElement,
      anchorName,
      newId,
      linkId,
    );
    if (!r) return;
    const tx = this._history.transaction();
    this._scene = r.scene;
    tx.add(r.addPatch);
    tx.add(r.linkPatch);
    tx.commit();

    this._selection = Selection.single(newId);
    if (this._selectedLinks.size > 0) this._selectedLinks = LinkSelection.EMPTY;
    this.notify();
  }

  /**
   * Ghost geometry for what clicking a start dot would create (standard hover
   * preview): the would-be new element's world bounds + the connector path
   * from the dot to it. Pure — no mutation. Mirrors the placement in
   * `createLinkedElementFromAnchor`.
   */
  previewClickCreate(
    fromElement: ElementId,
    anchorName: string,
  ): {
    bounds: Bounds;
    path: readonly Vec2[];
    element: Element;
    ghostScene: Scene;
    ghostLinkId: LinkId;
  } | null {
    return previewClickCreatePure(this._scene, this._activeLayerId, fromElement, anchorName);
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
    return snapLinkEndpointPure(
      this._scene,
      this.snapEngine,
      this.snapThreshold,
      pressTargetElement,
      worldPoint,
    );
  }

  // The wrappers here own the side effects (`_selectedLink`
  // clearing, notify).
  private applySelectByBounds(bounds: Bounds, mode: "replace" | "add"): void {
    const next = selectByBoundsPure(
      this._scene,
      this._selection,
      (id) => this.isLayerLocked(id),
      bounds,
      mode,
    );
    const nextLinks = selectLinksByBoundsLivePure(
      this._scene,
      mode === "add" ? this._selectedLinks : LinkSelection.EMPTY,
      (id) => this.isLayerLocked(id),
      bounds,
      mode,
    );
    const linksChanged = !LinkSelection.equals(nextLinks, this._selectedLinks);
    this._selectedLinks = nextLinks;
    if (Selection.equals(next, this._selection) && !linksChanged) {
      this.notify();
      return;
    }
    this._selection = next;
    this.notify();
  }

  private applyLassoLiveSelection(bounds: Bounds, mode: "replace" | "add"): void {
    const base = this.interaction.lassoBaseSelection ?? Selection.EMPTY;
    const next = selectByBoundsLivePure(
      this._scene,
      base,
      (id) => this.isLayerLocked(id),
      bounds,
      mode,
    );
    const linkBase = this.interaction.lassoBaseLinks ?? LinkSelection.EMPTY;
    const nextLinks = selectLinksByBoundsLivePure(
      this._scene,
      linkBase,
      (id) => this.isLayerLocked(id),
      bounds,
      mode,
    );
    const linksChanged = !LinkSelection.equals(nextLinks, this._selectedLinks);
    if (Selection.equals(next, this._selection) && !linksChanged) return;
    this._selectedLinks = nextLinks;
    this._selection = next;
  }

  // The wrapper here owns the side effects (history push,
  // drag-state clearing, notify).
  /**
   * Live endpoint-rebind move: re-point the dragged end to the cursor in the
   * scene (a free `point` endpoint), recorded in the gesture transaction so the
   * WHOLE link redraws under the cursor with full fidelity — real style,
   * arrowhead, curved bow, and (via `rerouteElbows` in `render`) a live elbow
   * re-route. One undo step on commit; Escape cancels the transaction and the
   * link snaps back to where it was. The handle dot follows via `linkEndpointDrag`.
   */
  private applyLinkEndpointMove(linkId: LinkId, side: "from" | "to", toPoint: Vec2): void {
    this.linkHandles.applyEndpointMove(linkId, side, toPoint);
  }

  private applyLinkEndpointUpdate(
    emit: Extract<InteractionEmit, { type: "UPDATE_EDGE_ENDPOINT" }>,
  ): void {
    this.linkHandles.applyEndpointUpdate(emit);
  }

  /** True while a waypoint of the selected link is being dragged. */
  get isDraggingWaypoint(): boolean {
    return this.linkHandles.isDraggingWaypoint;
  }

  /**
   * Begin a host-managed waypoint drag. `insert` splices a new waypoint at
   * `index` on the first move (segment-midpoint "add" handle); otherwise an
   * existing waypoint at `index` is moved. Live-mutated through the gesture
   * transaction so the whole drag is one undo step.
   */
  beginWaypointDrag(linkId: LinkId, index: number, insert: boolean): void {
    this.linkHandles.beginWaypointDrag(linkId, index, insert);
  }

  /** Caption (label pill) drag along the selected link's path. */
  get isDraggingLabel(): boolean {
    return this.linkHandles.isDraggingLabel;
  }
  beginLabelDrag(linkId: LinkId): void {
    this.linkHandles.beginLabelDrag(linkId);
  }
  updateLabelDrag(world: Vec2): void {
    this.linkHandles.updateLabelDrag(world);
  }
  endLabelDrag(): void {
    this.linkHandles.endLabelDrag();
  }

  /** Live update of the dragged waypoint to `world`. */
  updateWaypointDrag(world: Vec2): void {
    this.linkHandles.updateWaypointDrag(world);
  }

  /**
   * Finish the waypoint drag. If the dragged waypoint landed within
   * `WAYPOINT_COLLAPSE_RADIUS` of an adjacent path point, it is removed
   * (drag-onto-the-line to delete). A no-move insert adds nothing.
   */
  endWaypointDrag(): void {
    this.linkHandles.endWaypointDrag();
  }

  /** True while an elbow segment is being dragged. */
  get isDraggingSegment(): boolean {
    return this.linkHandles.isDraggingSegment;
  }

  /**
   * Begin a host-managed elbow segment drag. `axis` is the segment's
   * orientation; `at` is its centre along its own axis (used to re-identify it
   * across re-routes).
   */
  beginSegmentDrag(linkId: LinkId, axis: "h" | "v", at: number): void {
    this.linkHandles.beginSegmentDrag(linkId, axis, at);
  }

  /**
   * Move the dragged elbow segment perpendicular to its axis: pin its
   * perpendicular coordinate to the cursor. The reroute pass re-flows the
   * rest around the pin (one undo step via the gesture transaction).
   */
  updateSegmentDrag(world: Vec2): void {
    this.linkHandles.updateSegmentDrag(world);
  }

  /** Finish the elbow segment drag (commit the gesture as one undo step). */
  endSegmentDrag(): void {
    this.linkHandles.endSegmentDrag();
  }

  /**
   * Double-click detector for link edit handles (waypoint / segment).
   * Returns true when this press follows the previous handle press within
   * the double-click window + tolerance. Updates state every call. Kept
   * separate from the up-side double-click path (handles return early in
   * `onDown`, so that path never sees them).
   */
  isHandleDoubleClick(world: Vec2): boolean {
    return this.linkHandles.isHandleDoubleClick(world);
  }

  /**
   * Delete a free bend point (waypoint) from a straight / bezier link by
   * index — double-click a waypoint handle to remove it. One undo step.
   */
  deleteWaypoint(linkId: LinkId, index: number): void {
    this.linkHandles.deleteWaypoint(linkId, index);
  }

  /**
   * Remove the pinned (fixed) elbow segment that matches the given
   * geometry — double-click a segment handle to return it to the auto
   * route. Matches by axis + nearest pinned perpendicular `pos` (exact for
   * a pinned segment), `at` as tiebreak. The reroute pass re-flows on the
   * next render (fixedSegments is part of the elbow signature). One undo
   * step.
   */
  resetSegmentPin(linkId: LinkId, axis: "h" | "v", pos: number, at: number): void {
    this.linkHandles.resetSegmentPin(linkId, axis, pos, at);
  }

  /** Whether the selected link has obstacle-avoidance routing enabled. */
  get selectedLinkAvoidsObstacles(): boolean {
    const id = this.selectedLink;
    if (id === null) return false;
    return getLink(this._scene, id)?.avoidObstacles === true;
  }

  /**
   * Toggle persistent "route around shapes" on the selected link (standard
   * model). Enabling sets `avoidObstacles` and forces `orthogonal` routing —
   * the elbow router then keeps the path clear of EVERY scene shape and
   * re-routes whenever an obstacle moves into the way (see
   * `routeElbowLink` / `elbowSignature`). Disabling drops the flag; the
   * routing type is left as-is. One undo step; the routed path itself is
   * derived (recomputed by `rerouteElbows`). No-op when no link is selected.
   */
  setSelectedLinkAvoidObstacles(enabled: boolean): void {
    if (this.readOnly) return;
    const id = this.selectedLink;
    if (id === null) return;
    const edge = getLink(this._scene, id);
    if (!edge || edge.avoidObstacles === enabled) return;
    const r = updateLink(this._scene, id, (e) => ({
      ...e,
      avoidObstacles: enabled,
      ...(enabled ? { routing: "orthogonal" as const } : {}),
    }));
    this._scene = r.scene;
    this._history.push(r.patch);
    // Force the next reroute to recompute with the new mode.
    this.elbowRoutes.delete(id);
    this.notify();
  }

  public updateHoveredLinkTarget(worldPoint: Vec2): void {
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

    const refMeta = anchor?.metadata?.ref;
    const ref = isAnchorRef(refMeta) ? refMeta : undefined;
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

    // Mode mirrors snapLinkEndpoint: a named-anchor OR edge (outline) hit →
    // *fixed* point (show the dot, no float halo); only the body interior with
    // no edge/dot snap → floating (attach to the whole element).
    const mode: "point" | "element" = activeName !== null || outlinePoint ? "point" : "element";
    this.hoveredLinkTarget = { elementId: shape.id, activeAnchor: activeName, outlinePoint, mode };
    this.notify();
  }

  public applyLinkPreview(fromElement: ElementId | null, fromPoint: Vec2, toPoint: Vec2): void {
    const ep = computeLinkPreviewEndpoints(this._scene, fromElement, fromPoint, toPoint);
    // Match the preview to the connector that will be committed: when new
    // links default to elbow, draw the orthogonal route, not a straight line.
    if (DEFAULT_LINK_ROUTING === "orthogonal") {
      const hit = this.hitTest(ep.to);
      const toElement = hit.kind === "element" ? hit.id : null;
      const points = routeElbowPreview(this._scene, fromElement, ep.from, toElement, ep.to);
      this.edgePreview = { ...ep, points };
    } else {
      this.edgePreview = ep;
    }
    this.notify();
  }

  // Gesture lifecycle — recordGesturePatch / commitGesture /
  // cancelGesture / finalizeOpenGestureTx / maybeRevertModeAfterCreate.
  private recordGesturePatch(patch: Patch): void {
    // Snapshot the pre-gesture scene the moment the transaction opens, so a
    // later cancel/Escape can restore it (the history tx only records undo data,
    // it doesn't roll `_scene` back). Callers apply the patch to `_scene` BEFORE
    // recording, so reconstruct the pre-state by inverting this first patch.
    if (this.gestureTx === null) this.gestureStartScene = apply(this._scene, invert(patch));
    this.gestures.record(patch);
  }
  public commitGesture(): void {
    this.interaction.resizeOriginElement = null;
    this.rotateGestureOrigin = null;
    this.gestures.commit();
    this.gestureStartScene = null;
  }
  private finalizeOpenGestureTx(): void {
    this.gestures.finalize();
  }

  /**
   * End-of-drag container hookup. Runs after the state machine has
   * received POINTER_UP but before the gesture transaction commits,
   * so reparent + auto-grow land in one undo step with the drag itself.
   *
   * Rules:
   * - If the shape was dropped over a container and is not yet its child →
   *   set `parentId`. If the shape extends past the dropZone, the zone is
   *   grown (and the container's size with it).
   * - If the shape was someone's child but its final world bounds no longer
   *   intersect the parent's drop-zone → clear `parentId` (drag-out).
   * - Cycles (a container inside its own descendant) are prevented by the
   *   `containerHover` pipeline above — the exclude set rules them out.
   */
  // Editor exposes a small `ContainerOpsRef` bridge so the pure
  // helper can mutate scene + push patches into the running gesture
  // transaction.
  public applyContainerDrop(worldPoint: Vec2): void {
    applyContainerDropPure(this.containerOpsRef, worldPoint);
  }

  // Public-private hybrid — also called from AutoLayoutScheduler.
  private maybeGrowContainer(containerId: ElementId, childId: ElementId): void {
    maybeGrowContainerPure(this.containerOpsRef, containerId, childId);
  }

  private clampContainerToChildren(shape: Element, raw: Bounds, handle: HandleId): Bounds {
    return clampContainerToChildrenPure(this._scene, shape, raw, handle);
  }

  /**
   * Return the running gesture tx, or open a new one if the drag finished
   * with an empty transaction (a move-by-zero-pixels gesture can still
   * carry a container reparent).
   */
  private beginOrAttachGesture(): TransactionHandle {
    this.gestureTx ??= this._history.transaction();
    return this.gestureTx;
  }

  public cancelGesture(): void {
    this.interaction.resizeOriginElement = null;
    this.interaction.rotateGestureOrigin = null;
    this.gestures.cancel();
    // Roll the scene back to the pre-gesture snapshot — cancelling the history
    // transaction alone leaves the live drag mutations in `_scene`.
    if (this.gestureStartScene !== null) {
      this._scene = this.gestureStartScene;
      this.gestureStartScene = null;
    }
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

  public notify(): void {
    this.scheduleRender();
    fanOutEvents(this.eventCache, this.events, this.observableSnapshot());
    for (const fn of this.listeners) fn();
    this.autoCompactScheduler.schedule();
    this.autoLayoutScheduler.schedule();
    // A pan / zoom / scene edit may have scrolled an animated shape into
    // view — re-arm the (viewport-culled) animation tick.
    this.maybeAnimate();
  }

  /**
   * Pending `requestAnimationFrame` id for the next render, or null
   * when no render is scheduled. Used to coalesce bursts of `notify()`
   * calls (drag-pan, drag shape, multi-key, scripted batch mutations)
   * into a single render per frame.
   */
  private renderRafId: number | null = null;
  /**
   * Set by {@link dispose}. Render scheduling bails out when set:
   * async completions (image decode, font load, wasm init) can resolve
   * after the host tears the editor down (e.g. a runtime backend
   * switch) and must not paint onto disposed render targets.
   */
  private disposed = false;
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
    if (this.disposed) return; // async completions (image decode, font load) may outlive the editor
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
    if (this.disposed) return;
    if (this.renderRafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    this.render();
  }

  /**
   * Typed event surface — subscribe to a specific slice (`mode`,
   * `selection`, `scene`, `history`, `viewport`) or the umbrella
   * `change`. For callers that only care about one dimension;
   * `subscribe()` fires in lock-step with these.
   */
  on<K extends keyof EditorEvents>(event: K, fn: EditorEvents[K]): () => void {
    // Cast through `never`: TS can't prove that EditorEvents[K]
    // satisfies the emitter's `extends AnyListener ? T : never`
    // conditional through a generic body. Every entry of
    // EditorEvents is a function by construction so this is safe.
    return this.events.on(event, fn as never);
  }

  off<K extends keyof EditorEvents>(event: K, fn: EditorEvents[K]): void {
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
   * Derived elbow-route cache, keyed by link — the source of truth for
   * A*-routed corners, living OUTSIDE the immutable `Scene`. Each entry holds
   * the routed interior `points` (between from/to) plus the `sig` of the
   * inputs it was computed from (endpoint refs + bound-shape bounds +
   * fixedSegments), so an unchanged link short-circuits the reroute.
   *
   * `rerouteElbows` still MIRRORS `points` onto `Link.routedPoints` in
   * `_scene` because three readers still consume the baked field: the render
   * path (`getLinkPath` in `renderer-core`), the headless `getLinkPath`, and
   * serialization (`schema.ts`). The mirror is compat-only derived state — no
   * history push / notify.
   *
   * TODO(fable R7a): drop the `_scene` mirror once (a) the render path reads
   * routes from this cache via the `RenderSnapshot`, and (b) headless
   * `getLinkPath` / serialization stop depending on baked `routedPoints`.
   * That eviction changes headless geometry, serialized output, and
   * collab-synced fields, so it spans the scene / serialization / renderer /
   * headless goldens and must land as its own cross-package change — out of
   * scope for this state-only pass.
   */
  private readonly elbowRoutes = new Map<LinkId, { sig: string; points: readonly Vec2[] }>();

  /**
   * Choke-point reroute (standard model): recompute the route for every
   * orthogonal link whose inputs changed since the last pass, store it in the
   * derived {@link elbowRoutes} cache, and mirror it onto `_scene`. Runs once
   * per frame before paint — derived state, so no history push / notify (would
   * loop). Cheap when nothing moved (signature short-circuit).
   */
  private rerouteElbows(): void {
    let next = this._scene;
    for (const [id, edge] of this._scene.links) {
      if ((edge.routing ?? "straight") !== "orthogonal") continue;
      const sig = elbowSignature(this._scene, edge);
      if (this.elbowRoutes.get(id)?.sig === sig) continue;
      const points = routeElbowLink(next, edge);
      this.elbowRoutes.set(id, { sig, points });
      // Compat mirror onto the scene (see `elbowRoutes` doc).
      next = updateLink(next, id, (e) => ({ ...e, routedPoints: points })).scene;
    }
    this._scene = next;
  }

  /**
   * Collect everything {@link renderEditor} paints from into a flat
   * {@link RenderSnapshot}. Resolves the derived viewport / dirty-rect / dim /
   * hide inputs and the shared spatial index up front (same order the
   * orchestrator used to call them in), so the paint pass stays side-effect
   * free and the orchestrator stays decoupled from this class.
   *
   * `computeDirtyWorld` is order-sensitive (it diffs against
   * `lastRenderedScene` and populates `tileDirtyElements`); it runs here and
   * the `lastRendered*` bookkeeping is applied in `render()` after the paint.
   */
  private buildRenderSnapshot(): RenderSnapshot {
    // Stroke-erase live preview: the touched originals are hidden in the main
    // pass and their would-be fragments drawn on the overlay.
    const strokeErasePreview = this.computeStrokeErasePreview();
    const baseHidden = this.computeHiddenElements();
    const hideElements =
      strokeErasePreview === null
        ? baseHidden
        : new Set<ElementId>([...(baseHidden ?? []), ...strokeErasePreview.hidden]);
    return {
      mainTarget: this.mainTarget,
      overlayTarget: this.overlayTarget,
      backgroundTarget: this.backgroundTarget,
      scene: this._scene,
      selection: this._selection,
      selectedLinks: this._selectedLinks,
      selectedLink: this.selectedLink,
      selectedAnnotation: this._selectedAnnotation,
      enteredGroup: this._enteredGroup,
      gridEnabled: this.gridEnabled,
      viewportWorld: this.computeViewportWorld(),
      dirtyWorld: this.computeDirtyWorld(),
      dimElements: this.computeDimSet(),
      eraseActive: (this.interaction.eraseStroke?.pending.size ?? 0) > 0,
      hideElements,
      strokeErasePreview,
      sharedIndex:
        this._scene.elements.size >= LARGE_SCENE_HIT_THRESHOLD ? this.ensureSpatialIndex() : null,
      boundsCache: this.boundsCache,
      // Per-instance playback clock threaded through the render context (see
      // RenderSnapshot.animationClock). Feeds the renderer our per-shape
      // playback state so paused / reduced-motion GIFs freeze and resumed ones
      // continue from the right frame — without mutating the process-global
      // clock each frame, so two editors on one page don't interfere.
      // A non-string / missing id maps to an untracked key, for which
      // `clock` falls back to the wall clock.
      animationClock: (shape: { readonly id?: unknown }) =>
        this.gifPlayback.clock(castElementId(typeof shape.id === "string" ? shape.id : "")),
      tileComposeFn: this.tileComposeFn,
      tileDirtyElements: this.tileDirtyElements,
      mode: this.activeTool.type,
      activeLayerId: this._activeLayerId,
      cropFrame: this.cropFrameCorners(),
      cropGhost: this.cropGhost(),
      flowchartPreview: this.flowchartPreview,
      lassoPreview: this.lassoPreview,
      drawingPreview: this.drawingPreview,
      edgePreview: this.edgePreview,
      linkDragFromAnchor: this.linkDragFromAnchor,
      hoveredLinkTarget: this.hoveredLinkTarget,
      panGesture: this.panGesture,
      // `pinch` is unset during the constructor's first render; type says
      // non-null but runtime can be undefined.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
      pinchActive: this.pinch?.isActive() ?? false,
      gestureActive: this.gestureTx !== null,
      linkEndpointDrag: this.linkEndpointDrag,
      linkSegmentDrag: this.linkSegmentDrag,
      linkWaypointDrag: this.linkWaypointDrag,
      hoverCursorWorld: this.hoverCursorWorld,
      anchorStartHitSlop: this.anchorStartHitSlop,
      anchorClickRadius: this.anchorClickRadius,
      containerHover: this.containerHover,
      brushStroke: this.brushPreviewStroke,
      laserStrokes: this.interaction.laserStrokes,
      eraserTrail: this.interaction.eraserTrail,
      // Eraser cursor ring: a size-matched circle following the pointer while
      // the erase tool is active (not read-only). Sourced from `lastPointerWorld`
      // (updated on every hover AND drag move) — `hoverCursorWorld` is forced
      // null outside select mode. Radius is the panel's eraser width in SCREEN
      // px (matches the slider number).
      eraserCursor:
        this.activeTool.type === "erase" && !this._readOnly && this.lastPointerWorld !== null
          ? { center: this.lastPointerWorld, radius: this._brushSettings.width }
          : null,
      peerCursors: this._peerCursors,
      peerSelections: this._peerSelections,
      debugHitZones: this.debugHitZones,
      readOnly: this._readOnly,
      groupMoveOrigin: this.groupMoveOrigin,
      aspectLocked: this.selectionIsAspectLocked(),
      combinedSelectionBounds: this.combinedSelectionBounds(),
      editingText: this.editingTextOverlay(),
      previewClickCreate: (fromElement, anchorName) =>
        this.previewClickCreate(fromElement, anchorName),
      isPlaybackPaused: (id) => this.isPlaybackPaused(id),
    };
  }

  private render(): void {
    this.rerouteElbows();
    // Age out expired laser-trail points before the snapshot so the fade
    // advances every frame and the tick self-terminates once all trails clear.
    this.pruneLaser();
    // The per-shape animation clock is threaded per-instance through the
    // RenderSnapshot / render context (see `buildRenderSnapshot`), not set on
    // the process-global module clock each frame — so concurrent editors keep
    // independent playback.
    const snapshot = this.buildRenderSnapshot();
    renderEditor(snapshot);
    // Bookkeeping the orchestrator used to do inline: record what we just
    // painted (for the next frame's dirty diff / isolation-transition check)
    // and, on the tile-cache path, clear the consumed dirty set.
    this.lastRenderedScene = this._scene;
    this.lastRenderedEnteredGroup = this._enteredGroup;
    this.lastRenderedEraseActive = snapshot.eraseActive;
    // The forced erase repaint (if any) has now happened — later idle frames
    // (cursor moving / trail fading) skip the full main pass until the next cut.
    this.eraseDirty = false;
    // Clear the accumulated tile-dirty set only when the tile path actually
    // composited this frame. Group isolation (dim) / per-element hide make the
    // orchestrator fall back to the full renderScene path (it can't reproduce
    // dim/hide on cached tiles), so on those frames the pending invalidations
    // must survive to be applied when the tile path resumes — mirror the same
    // condition here.
    const isolationActive =
      (snapshot.dimElements !== undefined && snapshot.dimElements.size > 0) ||
      (snapshot.hideElements !== undefined && snapshot.hideElements.size > 0);
    if (snapshot.tileComposeFn && snapshot.viewportWorld && !isolationActive) {
      this.tileDirtyElements = new Map();
    }
    // Present AFTER the paint, on the same tick — deferred-submission
    // surfaces (WebGL2 / OffscreenCanvas) would otherwise lag one frame.
    this.onAfterRender?.();
  }
}

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

/** Distance from point `p` to the finite segment `a`–`b` (world space). */
