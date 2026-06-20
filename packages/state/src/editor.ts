import { createActor, type Actor } from "xstate";
import { createEmitter, type Emitter } from "@oh-just-another/events";
import type { Bounds, FileId, ElementId, Vec2 } from "@oh-just-another/types";
import { elementId as castElementId } from "@oh-just-another/types";
import type { SpatialGrid } from "@oh-just-another/scene";
import {
  addElement,
  anchorSnapper,
  apply,
  buildSpatialIndex,
  getBinaryFile,
  isElementHidden,
  isElementLocked,
  runAutoLayout,
  DEFAULT_LAYER_ID,
  findNearestAnchor,
  getAnchorWorld,
  getAnchorOutwardNormal,
  routeElbowLink,
  routeElbowPreview,
  getLink,
  getLinkPath,
  getElement,
  getElementAt,
  getElementAtIndexed,
  getElementWorldBounds,
  getElementRenderBounds,
  isFrame,
  FRAME_HEADER_HEIGHT,
  setTextMeasurer,
  getScreenToWorld,
  gridSnapper,
  snapExcludedAnchors,
  orderForTop,
  type FractionalIndex,
  outlineSnapper,
  removeElement,
  SnapEngine,
  isNoop,
  invert,
  type BrushPoint,
  updateLink,
  updateElement,
  type AnchorRef,
  type Link,
  type LinkEndpoint,
  type ImageElement,
  type Patch,
  type Scene,
  type Element,
  type GridStyle,
  type SnapCandidate,
  type TextElement,
  type TextStyle,
  isSnapToGridEnabled,
  resolveSnapSpacing,
} from "@oh-just-another/scene";
import {
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
  layoutText,
  onAnimationContentReady,
  pointToCaretIndex,
  selectionRects as textSelectionRects,
  setActiveRasterizer,
  setActiveTextShaper,
  setAnimationClock,
  ElementCache,
  type EditableTextLayout,
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
import {
  ANCHOR_CLICK_NEW_ELEMENT_GAP,
  DEFAULT_LINK_ROUTING,
  WAYPOINT_COLLAPSE_RADIUS,
} from "./constants.js";
import { FileDropRegistry, type FileDropContext, type FileDropHandler } from "./file-drop.js";
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
  reconcileFrameMembership as reconcileFrameMembershipHelper,
} from "./frame-helpers.js";
import { AutoCompactScheduler } from "./auto-compact.js";
import { AutoLayoutScheduler } from "./auto-layout-scheduler.js";
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
  ANCHOR_DOT_ACTIVE_RADIUS,
  LINK_START_ANCHOR_OUTSET,
  TOUCH_ANCHOR_START_HIT_SLOP,
  TOUCH_ANCHOR_DOT_CLICK_RADIUS,
  DOUBLE_CLICK_MS,
  DOUBLE_CLICK_TOLERANCE_PX,
  WHEEL_ZOOM_STEP,
  ANIMATION_MIN_INTERVAL_MS,
  ANIMATION_MAX_INTERVAL_MS,
  ANIMATION_COST_FACTOR,
  HEAVY_GIF_BYTES,
  GIF_AUTOSTOP_MS,
  CARET_BLINK_INTERVAL_MS,
} from "./constants.js";
import { HANDLE_HIT_SLOP, cursorForHandle } from "./handle.js";
import { anchorOverlayPoints } from "./editor/anchor-points.js";
import {
  interactionMachine,
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
  computeZoomToBounds,
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
  computeSelectAllLinks,
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
  selectLinksByBoundsLive as selectLinksByBoundsLivePure,
} from "./editor/applies/selection.js";
import { computeLinkEndpointUpdate, computeLinkPreviewEndpoints } from "./editor/applies/edge.js";
import {
  computeAnnotationMovePatch,
  computeGroupMovePatches,
  computeElementMovePatch,
} from "./editor/applies/move.js";
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
import { type PeerCursor, type PeerSelection } from "./overlay.js";
import * as Selection from "./selection.js";
import * as LinkSelection from "./link-selection.js";

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

/**
 * Index-access helper for provably-valid indices: throws instead of
 * returning `undefined` so callers stay non-nullable without `!`.
 */
const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("packages/state: index out of range");
  return v;
};

/**
 * Stable keys for cursor states a host can override with a custom image via
 * {@link Editor.setCursorOverride}. Each maps to one outcome of `computeCursor`.
 */
export type CursorRole =
  | "default"
  | "pan-ready"
  | "pan-active"
  | "move"
  | "draw"
  | "text"
  | "link-start"
  | "link-handle"
  | "annotation"
  | "resize-nwse"
  | "resize-nesw"
  | "resize-ns"
  | "resize-ew";

/**
 * A custom cursor: either a raw CSS `cursor` value, or an image with an
 * optional `@2x` variant (DPR-aware via `image-set`), hotspot, and keyword
 * fallback.
 */
export type CursorSpec =
  | string
  | {
      /** 1x image URL or data-URL. */
      readonly url: string;
      /** Optional 2x image for hi-DPI (retina) — emitted via `image-set`. */
      readonly url2x?: string;
      /** Hotspot offset (px) within the image; defaults to (0, 0). */
      readonly hotspot?: { readonly x: number; readonly y: number };
      /** Keyword shown if the image can't load / is too large. */
      readonly fallback?: string;
    };

/** Resize handle → cursor override role. */
const RESIZE_ROLE: Record<HandleId, CursorRole> = {
  nw: "resize-nwse",
  se: "resize-nwse",
  ne: "resize-nesw",
  sw: "resize-nesw",
  n: "resize-ns",
  s: "resize-ns",
  e: "resize-ew",
  w: "resize-ew",
};

/** Build a CSS `cursor` value from a {@link CursorSpec}. */
const cssCursor = (spec: CursorSpec, fallbackKeyword: string): string => {
  if (typeof spec === "string") return spec;
  const hx = spec.hotspot?.x ?? 0;
  const hy = spec.hotspot?.y ?? 0;
  const img =
    spec.url2x !== undefined
      ? `image-set(url("${spec.url}") 1x, url("${spec.url2x}") 2x)`
      : `url("${spec.url}")`;
  return `${img} ${String(hx)} ${String(hy)}, ${spec.fallback ?? fallbackKeyword}`;
};

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
   * When false the background grid is not painted. Toggled via `toggleGrid`
   * (`g` hotkey, standard parity). View-only — never persisted or in history.
   */
  gridVisible = true;
  public readonly actor: Actor<typeof interactionMachine>;
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
   * `fanOutEvents` (in `editor/event-fanout.ts`) to decide which
   * typed events to fire on each `notify()` — only the slices
   * whose identity changed since the previous notify get an event.
   */
  private readonly eventCache: EditorEventCache = createEventCache();
  private readonly unbind: () => void;

  public _scene: Scene;
  public _selection: Selection.Selection = Selection.EMPTY;
  /**
   * Snapshot of an in-progress annotation drag (press on pin → move
   * pointer → release). `originPosition` is the annotation's stored
   * position at press time; per-move handler computes a delta from
   * the current pointer in world space and writes it back.
   */
  public annotationDrag: {
    id: AnnotationId;
    originPosition: Vec2;
    originWorldPoint: Vec2;
    moved: boolean;
  } | null = null;
  /** Live preview while drawing a new shape; null when not drawing. */
  public drawingPreview: Bounds | null = null;
  public edgePreview: { from: Vec2; to: Vec2; points?: readonly Vec2[] } | null = null;
  /**
   * Active "drag a link from a start-anchor" gesture. Set when a
   * press lands on one of the selected element's link-start dots; lets
   * the user draw a link straight from the dot without switching to the
   * draw-edge tool. `fromWorld` is the true anchor world point (the link
   * origin, un-offset); `origin` is the press point (for the drag
   * threshold). Read by the pointer handlers (drive preview / commit on
   * up) and the render orchestrator (keep the source's start dots visible
   * during the drag). Null when no such drag is in flight. */
  public linkDragFromAnchor: {
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
  public hoveredLinkTarget: {
    elementId: ElementId;
    activeAnchor: string | null;
    outlinePoint?: Vec2 | undefined;
    /**
     * What the drop will produce, for clear pre-drop feedback (standard):
     *   - `"point"` → fixed attach to a specific dot (highlight the dot);
     *   - `"element"` → floating attach to the whole shape (highlight the
     *     element). Mirrors `snapLinkEndpoint`: an anchor within threshold →
     *     point, otherwise floating.
     */
    mode: "point" | "element";
  } | null = null;
  /**
   * Last idle cursor position (world) in select mode — the overlay grows the
   * SINGLE selected element's link-start dot nearest it
   * (`ANCHOR_DOT_HOVER_GROW_RADIUS`). Reset to null on press / gesture.
   */
  public hoverCursorWorld: Vec2 | null = null;
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
   */
  public linkEndpointDrag: {
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
  public linkWaypointDrag: {
    linkId: LinkId;
    index: number;
    pendingInsert: boolean;
  } | null = null;
  /**
   * Host-managed elbow segment drag. `index` is the segment in the routed
   * chain `[from, ...routedPoints, to]`; `axis` is its orientation. Dragging
   * pins the segment's perpendicular coordinate into `Link.fixedSegments`;
   * the reroute pass re-flows the rest. One undo step via the gesture tx.
   */
  public linkSegmentDrag: { linkId: LinkId; axis: "h" | "v"; at: number } | null = null;
  /** Live lasso bounds during a rubber-band select gesture. */
  public lassoPreview: Bounds | null = null;

  /**
   * Selection captured at lasso-press time. Used to compute the live
   * preview correctly: in `replace` mode the lasso starts from empty
   * each frame; in `add` mode it starts from this snapshot so shapes
   * the user already had selected don't blink out and back.
   */
  private lassoBaseSelection: Selection.Selection | null = null;
  /** Link-selection counterpart of `lassoBaseSelection` for the marquee. */
  private lassoBaseLinks: LinkSelection.LinkSelection | null = null;
  /**
   * Snapshot of every selected shape's `position` at press-down. Used to
   * translate the whole group additively during a multi-shape drag. The
   * machine still emits per-shape MOVE_SHAPE — the editor intercepts and
   * fans out when this map is populated.
   */
  public groupMoveOrigin: ReadonlyMap<ElementId, Vec2> | null = null;
  /**
   * Press-time snapshot of connectors that must follow a multi-element
   * drag rigidly — both endpoints bound to moved elements, carrying
   * absolute geometry (waypoints / fixedSegments / routedPoints). Each
   * frame translates from these originals so the shift never compounds.
   * Cleared on gesture commit / cancel alongside `groupMoveOrigin`.
   */
  public groupLinkMoveOrigin: ReadonlyMap<LinkId, Link> | null = null;
  /**
   * Per-shape snapshot for a group-resize gesture — `bounds` is the
   * shape's world AABB at press-down. Editor scales the relative
   * position / size against the combined bounds delta each frame.
   */
  public groupResizeOrigin: {
    readonly combined: Bounds;
    readonly elements: ReadonlyMap<
      ElementId,
      { readonly position: Vec2; readonly bounds: Bounds; readonly scale: Vec2 }
    >;
    readonly links: ReadonlyMap<LinkId, Link>;
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
   * Transient flag set by the host while a snap-suppress modifier
   * (Cmd / Ctrl) is held during a drag — lets the user pull a shape off
   * the grid for one gesture without toggling snap off. Read by the
   * move / resize / create wrappers; never persisted.
   */
  private snapSuppressed = false;

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
   * Double-click detection state. Updated on every non-drag pointer
   * up; the next pointer-up within `DOUBLE_CLICK_MS` and within
   * `DOUBLE_CLICK_TOLERANCE_PX` of `lastClickWorldPoint` counts as a
   * double-click. Used to trigger group drill-down (enter isolation).
   */
  private lastClickAt = 0;
  private lastClickWorldPoint: Vec2 | null = null;

  /**
   * Separate double-click tracker for link edit handles (waypoint /
   * segment). Kept apart from `lastClickAt` because a handle press
   * returns early in `onDown` (begin-drag) and never reaches the up-side
   * double-click path that updates `lastClickAt`. Updated by
   * `isHandleDoubleClick` on each handle press.
   */
  private lastHandleClickAt = 0;
  private lastHandleClickWorld: Vec2 | null = null;

  /**
   * In-progress brush stroke. Hosts push points via
   * `extendBrushStroke`; the overlay reads it through
   * `pendingBrushStroke` to draw a live preview.
   */
  public brushStroke: BrushStrokeState | null = null;

  /**
   * Last world-space pointer position observed by the host's onMove
   * handler. `paste()` uses it as the default drop target so a fresh
   * paste lands under the cursor instead of overlapping the originals.
   * `null` until the pointer first enters the host.
   */
  public lastPointerWorld: Vec2 | null = null;
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
   * Fractional-order compaction scheduler (microtask-coalesced).
   * Triggered from every `notify()`; only does real work when at
   * least one shape/edge order string crossed AUTO_COMPACT_THRESHOLD.
   * See `./auto-compact.ts` for the extracted logic.
   */
  private readonly autoCompactScheduler = new AutoCompactScheduler({
    getScene: () => this._scene,
    compact: (layerId) => {
      this.compactLayerZOrder(layerId, { recordHistory: false });
    },
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
  public dragElementId: ElementId | null = null;

  /**
   * Element that the current press added to the selection additively
   * (shift / meta click on an unselected shape). The press promotes it
   * so a subsequent drag moves it; on a *tap* the up-handler would
   * otherwise `SELECT_TOGGLE` it straight back off, so it consults this
   * to skip that redundant toggle. Reset at every press-down.
   */
  public additivePressAdded: ElementId | null = null;

  /**
   * Live container highlight: the container shape the dragged item is
   * currently hovering over. Drawn by the overlay as a dashed
   * accent rect on the container's drop-zone so the user sees where the
   * shape will land after release.
   */
  public containerHover: { id: ElementId; dropZone: Bounds } | null = null;

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
  public readonly activePointers = new Map<number, Vec2>();
  /**
   * One-finger-pan candidate: set at pointer-down when a TOUCH press lands
   * on empty canvas in select mode. A tap (no movement) still falls through
   * to select/deselect; once the finger drags past slop, onMove promotes
   * this to a real pan instead of a marquee lasso (mobile convention).
   * Screen-space origin point.
   */
  public touchPanCandidate: Vec2 | null = null;
  // Pinch gesture state lives in PinchController (./editor/pinch.ts)
  // — `pinch.isActive()` replaces the old `pinchOrigin !== null` check.
  public pinch!: PinchController;
  /** Bridge for `editor/container-ops.ts`. Built lazily in constructor. */
  private containerOpsRef!: ContainerOpsRef;

  /**
   * Space-bar held → next pointer drag pans the canvas instead of
   * doing whatever the current mode would do. Visual cursor goes to
   * "grab" / "grabbing". Wires a window-level keydown/keyup listener
   * in `bindPointerEvents`.
   */
  public spaceHeld = false;

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
  public panGesture: {
    pointerId: number;
    button: number;
    startPoint: Vec2;
    lastPoint: Vec2;
    moved: boolean;
  } | null = null;

  /**
   * Set on a right-click pointerdown so the upcoming native
   * `contextmenu` event can be unconditionally preventDefault'ed
   * (the gesture decides whether to fire the menu manually on
   * pointerup based on whether the user dragged).
   */
  public suppressNextContextMenu = false;

  /**
   * Long-press tracking. Starts on `pointerdown`; cancelled on
   * `pointermove > LONG_PRESS_MAX_MOVEMENT_PX` or `pointerup` before
   * the timer fires. Hosts subscribe via `onLongPress` to surface a
   * context menu (mobile alternative to right-click).
   */
  // Long-press timer + origin live in LongPressController
  // (./editor/long-press.ts). The Set of subscribers stays here
  // because `onLongPress` is part of the public Editor API.
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
  private readonly inputMode: "mouse" | "touch";
  private readonly handleHitSlop: number;
  private readonly edgeHandleHitSlop: number;
  private readonly edgeHitThreshold: number;
  /** Link-start anchor-dot grab/click hit radii — touch-enlarged in touch mode. */
  public readonly anchorStartHitSlop: number;
  public readonly anchorClickRadius: number;

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
        return self.mode;
      },
      setMode: (m) => {
        self.setMode(m);
      },
      notify: () => {
        self.notify();
      },
    });
    this.tileComposeFn =
      options.useTileCache === true && options.tileCompose ? options.tileCompose : null;

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
      (factor, anchorWorld) => {
        this.zoomAt(factor, anchorWorld);
      },
      (delta) => {
        this.panBy(delta);
      },
    );
    // Bridge for container-ops module — narrow surface that the
    // pure functions in editor/container-ops.ts call back into.
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- bridge literal rebinds `this`; alias keeps Editor reference
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
    // Pause animation playback when the tab / window is hidden (browsers
    // throttle rAF to ~1fps in background but don't stop it; an explicit
    // stop saves the decode + render entirely). Resume when visible again,
    // viewport permitting.
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

  /** Snapshot used by event-fanout. Kept private — internal API. */
  private observableSnapshot() {
    return {
      mode: this.mode,
      selection: this._selection,
      selectedLinks: this._selectedLinks,
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

  /** Show/hide the background grid (standard `g`). View-only — not in history. */
  setGridVisible(on: boolean): void {
    if (this.gridVisible === on) return;
    this.gridVisible = on;
    this.scheduleRender();
  }

  /** Toggle background grid visibility. */
  toggleGrid(): void {
    this.setGridVisible(!this.gridVisible);
  }

  /** Whether the active draw-mode sticks after a create (toolbar lock). */
  get toolLocked(): boolean {
    return this._toolLocked;
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
  // Pure body in `./editor/public/image-insert.ts`.
  insertImage(input: {
    src: string;
    width: number;
    height: number;
    position: Vec2;
    image?: HTMLImageElement;
    animated?: boolean;
    fileId?: FileId;
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
  /** EMA of animation-tick render cost (ms) — drives the adaptive throttle. */
  private gifRenderCostEma = 0;
  /** Wall-clock of the last animation-tick render — for the interval throttle. */
  private lastGifTickMs = 0;

  private readonly animationTick = new AnimationTick({
    // Keep ticking only while an animated shape is actually on-screen.
    // Frame selection is wall-clock-based, so when the GIF scrolls back
    // into view the tick resumes on the correct frame. The tick is re-armed
    // on viewport changes via `maybeAnimate()` in `notify()`.
    isAnimated: () => this.hasVisibleAnimatedElement(),
    onTick: () => {
      // Adaptive throttle — skip this rAF if an animation frame was rendered
      // too recently. The target interval grows with the measured render
      // cost so a heavy scene drops GIF fps instead of blowing the frame
      // budget.
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const target = Math.min(
        ANIMATION_MAX_INTERVAL_MS,
        Math.max(ANIMATION_MIN_INTERVAL_MS, this.gifRenderCostEma * ANIMATION_COST_FACTOR),
      );
      if (now - this.lastGifTickMs < target) return;
      this.lastGifTickMs = now;
      // Freeze heavy GIFs that have played long enough.
      this.autoStopHeavyGifs();
      // Force a full re-render: the scene reference hasn't changed,
      // but the animation adapter advanced the GIF frame. Re-painting
      // picks up the current frame.
      this.lastRenderedScene = null;
      this.render();
      const cost = (typeof performance !== "undefined" ? performance.now() : Date.now()) - now;
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
   * current viewport. Drives viewport-culling of the animation tick —
   * off-screen GIFs don't burn decode / render cost, and the wall-clock
   * frame selection means they show the right frame the moment they
   * scroll back in.
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

  /** Bound `visibilitychange` handler — pause/resume the tick. */
  private readonly onVisibilityChange = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      this.animationTick.stop();
    } else {
      this.maybeAnimate();
    }
  };

  // ── Per-shape GIF playback (auto-stop + reduced-motion) ──────
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
   * Seed playback for a freshly-animated shape. Start paused (frozen on
   * frame 0) when the user prefers reduced motion; playing otherwise.
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
   * image (resume after auto-stop, play after reduced-motion). Resuming
   * continues from the frozen frame.
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
   * Freeze heavy GIFs after `GIF_AUTOSTOP_MS` of continuous play.
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
      if (!st?.playing) continue;
      const heavy =
        img.animationData instanceof ArrayBuffer && img.animationData.byteLength > HEAVY_GIF_BYTES;
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
      // (reduced-motion is honoured at this point too).
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
   * the shape entirely and leaves history untouched (no undo entry).
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

  // Pure body in `./editor/public/selection-ops.ts`.
  deleteSelected(): void {
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
   * Frame whose NAME (header label) is being edited inline (double-click
   * the header), or null. The host overlay (`<FrameNameEditorOverlay>` in
   * `@react-ui`) renders an input over the header and commits the name.
   */
  private _editingFrameName: ElementId | null = null;
  get editingFrameName(): ElementId | null {
    return this._editingFrameName;
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
    for (let i = 1; i < path.length; i++) total += distanceTo(req(path[i - 1]), req(path[i]));
    let remaining = total * t;
    for (let i = 1; i < path.length; i++) {
      const a = req(path[i - 1]);
      const b = req(path[i]);
      const seg = distanceTo(a, b);
      if (remaining <= seg) {
        const r = seg === 0 ? 0 : remaining / seg;
        return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
      }
      remaining -= seg;
    }
    return req(path[path.length - 1]);
  }

  beginTextEdit(id: ElementId): void {
    if (!canBeginTextEdit(this._scene, id, (lid) => this.isLayerLocked(lid))) return;
    // Commit any in-flight edit on a different shape first.
    if (this._editingTextElement !== null && this._editingTextElement !== id) this.commitTextEdit();
    this._editingTextElement = id;
    this._textEditOrigin =
      this._pendingTextCreate === id ? null : (getElement(this._scene, id) ?? null);
    const shape = getElement(this._scene, id) as TextElement | undefined;
    const len = shape?.text.length ?? 0;
    this._textSel = { start: len, end: len, dir: "forward" };
    this.startCaretBlink();
    this.notify();
  }

  // --- Frame name inline editing (double-click the header) ---

  /**
   * Start editing a frame's header name. No-op unless `id` is a frame on
   * an unlocked layer. Commits any in-flight text edit first.
   */
  beginFrameNameEdit(id: ElementId): void {
    const shape = getElement(this._scene, id);
    if (shape?.type !== "frame") return;
    if (this.isLayerLocked(shape.layerId)) return;
    if (this._editingTextElement !== null) this.commitTextEdit();
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
    const shape = getElement(this._scene, id);
    if (shape?.type === "frame") {
      const trimmed = name.trim();
      const current = (shape as { name?: string }).name ?? "";
      if (trimmed !== current) {
        const r = updateElement(this._scene, id, (s) => {
          const copy = { ...s } as typeof s & { name?: string };
          // `exactOptionalPropertyTypes`: drop the key when cleared.
          if (trimmed === "") delete copy.name;
          else copy.name = trimmed;
          return copy;
        });
        this._scene = r.scene;
        this._history.push(r.patch);
      }
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
    let bestId: ElementId | null = null;
    let bestOrder = "";
    for (const s of this._scene.elements.values()) {
      if (!isFrame(s)) continue;
      const hx = s.position.x;
      // The header strip can extend up to the frame's full width (it hugs
      // the label but is capped there), so the rename hit zone spans it.
      const hw = s.width * s.scale.x;
      const hh = FRAME_HEADER_HEIGHT * s.scale.y;
      const hyTop = s.position.y - hh;
      if (p.x >= hx && p.x <= hx + hw && p.y >= hyTop && p.y <= hyTop + hh) {
        if (bestId === null || s.order > bestOrder) {
          bestId = s.id;
          bestOrder = s.order;
        }
      }
    }
    return bestId;
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
    const id = this._editingTextElement;
    if (!id) return;
    const r = updateElement(this._scene, id, (s) => ({ ...s, text: value }));
    this._scene = r.scene;
    this._textSel = { start: selStart, end: selEnd, dir };
    this.wakeCaret();
    this.notify();
  }

  /** Selection-only update (arrows / shift-select / click) — no text change. */
  setEditingSelection(
    selStart: number,
    selEnd: number,
    dir: "forward" | "backward" = "forward",
  ): void {
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

    const local = textSelectionRects(
      layout,
      this._textSel.start,
      this._textSel.end,
      measure,
      align,
    );
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
      if (finalElement)
        this._history.push({ kind: "element", id, before: null, after: finalElement });
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
  get pendingBrushStroke(): {
    readonly origin: Vec2;
    readonly points: readonly BrushPoint[];
  } | null {
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
    this.drawingPreview = null;
    this.edgePreview = null;
    this.lassoPreview = null;
    // Abort a host-managed link-from-anchor gesture too — it lives outside
    // the machine, so POINTER_CANCEL above doesn't touch it. Without this a
    // gesture left mid-flight would keep its preview after Escape.
    this.linkDragFromAnchor = null;
    this.hoveredLinkTarget = null;
    this.hoverCursorWorld = null;
    this._editingLinkCaption = null;
    this.pendingLinkDropMenu = null;
    this.linkWaypointDrag = null;
    this.linkSegmentDrag = null;
    // Endpoint-rebind drag: gestureTx.cancel above already reverted the live
    // re-point; just drop the handle-preview state so the dot stops tracking.
    this.linkEndpointDrag = null;
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

  /**
   * Clone the selection IN PLACE (zero offset), select the clones, and return
   * the clone of `anchorId` (or null). Unlike `duplicateSelected` this also
   * clones group descendants and frame members, remapping `parentId`/`frameId`
   * among the clones so a duplicated frame keeps its contents. Used by
   * `⌥`-drag duplicate — the caller then drags the clones, leaving the
   * originals. One undo step.
   */
  duplicateSelectedInPlace(anchorId: ElementId | null = null): ElementId | null {
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
    const tx = this._history.transaction();
    for (const id of ids) {
      const shape = getElement(this._scene, id);
      if (!shape) continue;
      const newId = idMap.get(id);
      if (newId === undefined) continue;
      const order = orderForTop(
        [...this._scene.elements.values()]
          .filter((sh) => sh.layerId === shape.layerId)
          .map((sh) => sh.order),
      );
      const copy = { ...shape, id: newId, order } as Element & {
        parentId?: ElementId;
        frameId?: ElementId;
      };
      if (copy.parentId !== undefined) {
        const mapped = idMap.get(copy.parentId);
        if (mapped !== undefined) copy.parentId = mapped;
      }
      if (copy.frameId !== undefined) {
        const mapped = idMap.get(copy.frameId);
        if (mapped !== undefined) copy.frameId = mapped;
      }
      const r = addElement(this._scene, copy);
      this._scene = r.scene;
      tx.add(r.patch);
    }
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
   * +10 px nudge so duplicates stay visible). Relative offsets
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
   * Select the nearest interactable top-level element in `direction` from the
   * current selection's centre (or the viewport centre when nothing is
   * selected). standard `⌘`+arrows. Candidates must lie within a 45° cone of the
   * direction; the closest by along+lateral distance wins. No-op when nothing
   * qualifies.
   */
  selectClosest(direction: "left" | "right" | "up" | "down"): void {
    const ref = this.combinedSelectionBounds();
    const vp = this._scene.viewport;
    const refC = ref
      ? { x: ref.x + ref.width / 2, y: ref.y + ref.height / 2 }
      : {
          x: vp.pan.x + vp.size.width / 2 / vp.zoom,
          y: vp.pan.y + vp.size.height / 2 / vp.zoom,
        };
    const dv =
      direction === "left"
        ? { x: -1, y: 0 }
        : direction === "right"
          ? { x: 1, y: 0 }
          : direction === "up"
            ? { x: 0, y: -1 }
            : { x: 0, y: 1 };
    let best: ElementId | null = null;
    let bestScore = Infinity;
    for (const s of this._scene.elements.values()) {
      if (s.parentId !== undefined) continue; // top-level shapes only
      if (this._selection.has(s.id)) continue;
      if (!this.isElementInteractable(s)) continue;
      const b = getElementWorldBounds(s);
      const cx = b.x + b.width / 2 - refC.x;
      const cy = b.y + b.height / 2 - refC.y;
      const along = cx * dv.x + cy * dv.y;
      if (along <= 0) continue; // not in the direction's half-plane
      const perp = Math.abs(cx * dv.y - cy * dv.x);
      if (perp > along) continue; // outside the 45° cone
      const score = along + perp;
      if (score < bestScore) {
        bestScore = score;
        best = s.id;
      }
    }
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
  setGrid(patch: { size?: number; style?: GridStyle; snap?: boolean }): void {
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
    this.snapSuppressed = suppressed;
  }

  /**
   * True when a gesture should snap: feature on, grid visible, AND the
   * suppress modifier not held. Hiding the grid (`toggleGrid` / `g`) also
   * disables snap-to-grid — snapping to an invisible grid is confusing.
   * Re-showing the grid restores the stored snap preference.
   */
  private snapActive(): boolean {
    return !this.snapSuppressed && this.gridVisible && isSnapToGridEnabled(this._scene.viewport);
  }

  /** World-unit spacing the current gesture snaps to. */
  private snapSpacing(): number {
    return resolveSnapSpacing(this._scene.viewport);
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
    return ctx.mode === "draw-rect" || ctx.mode === "draw-ellipse" || ctx.mode === "draw-edge";
  }

  // --- Long-press --- (controller in `./editor/long-press.ts`)

  public startLongPress(screenPoint: Vec2): void {
    this.longPress.start(screenPoint);
  }
  public cancelLongPress(): void {
    this.longPress.cancel();
  }

  // --- Pinch gesture --- (controller in `./editor/pinch.ts`)
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

  // Pure body in `./editor/hit-test.ts`. Editor passes a narrow
  // context bundle that closes over its private state + accel
  // helpers (acceleratedElementAt, isElementInteractable, …).
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
    const next = this.computeCursor(worldPoint ?? this.lastPointerWorld);
    if (this.host.style.cursor !== next) this.host.style.cursor = next;
  }

  /**
   * The CSS cursor for the current state. Priority: active gesture → text edit → pan affordance →
   * draw tool → idle hover hit-test. Pure read of editor state; no side effects.
   */
  private computeCursor(p: Vec2 | null): string {
    // Each outcome is a (role, fallback-keyword) pair; `resolveCursor` returns
    // a host-registered custom image for that role if one exists, else the
    // keyword. Roles are the stable override keys (see `setCursorOverride`).
    const r = (role: CursorRole, keyword: string): string => this.resolveCursor(role, keyword);
    const resizeRole = (h: HandleId): string => r(RESIZE_ROLE[h], cursorForHandle(h));
    // 1. Active gestures (highest priority — what the pointer is doing now).
    if (this.panGesture) return r("pan-active", "grabbing");
    if (this.linkDragFromAnchor?.moved === true) return r("draw", "crosshair");
    if (this.isDraggingWaypoint || this.isDraggingSegment) return r("move", "grabbing");
    if (this.annotationDrag?.moved === true) return r("move", "grabbing");
    if (this.brushStroke) return r("draw", "crosshair");
    // Machine-driven drag past the threshold (`gestureTx` opens then): resize
    // shows the handle's arrow; element / link move shows grabbing.
    if (this.gestureTx) {
      const t = this.actor.getSnapshot().context.pressTarget;
      if (t && (t.kind === "handle" || t.kind === "group-handle")) return resizeRole(t.handle);
      if (t && (t.kind === "element" || t.kind === "link" || t.kind === "edge-endpoint")) {
        return r("move", "grabbing");
      }
    }
    // 2. In-canvas text editing → I-beam.
    if (this.editingTextElement !== null) return r("text", "text");
    // 3. Pan affordance (idle): Space held or hand tool.
    if (this.spaceHeld || this.mode === "hand") return r("pan-ready", "grab");
    // 4. Draw tools (idle, before a gesture starts).
    switch (this.mode) {
      case "draw-rect":
      case "draw-ellipse":
      case "draw-frame":
      case "draw-edge":
      case "brush":
        return r("draw", "crosshair");
      case "draw-text":
        return r("text", "text");
      default:
        break;
    }
    // 5. Idle hover in select mode — key off the hit-test target.
    if (p) {
      if (this.isOverLinkStartDot(p)) return r("link-start", "crosshair");
      const t = this.hitTest(p);
      switch (t.kind) {
        case "handle":
        case "group-handle":
          return resizeRole(t.handle);
        case "edge-endpoint":
          return r("link-handle", "grab");
        case "annotation":
          return r("annotation", "pointer");
        default:
          return r("default", "default");
      }
    }
    return r("default", "default");
  }

  /**
   * Resolve a cursor role to a CSS `cursor` value: a host-registered custom
   * image (via {@link setCursorOverride}) if present, else `fallbackKeyword`.
   */
  private resolveCursor(role: CursorRole, fallbackKeyword: string): string {
    const spec = this.cursorOverrides.get(role);
    return spec === undefined ? fallbackKeyword : cssCursor(spec, fallbackKeyword);
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
   * True when `p` is within the grab radius of one of the single selected
   * element's link-start dots — used to show a `crosshair` (start a link).
   * Mirrors the anchor-drag hit-test in pointer-binding so the cursor matches
   * exactly where a press would begin a link.
   */
  private isOverLinkStartDot(p: Vec2): boolean {
    if (this.mode !== "select" || this._selection.size !== 1) return false;
    const id = [...this._selection][0];
    if (id === undefined) return false;
    const shape = getElement(this._scene, id);
    if (!shape) return false;
    const zoom = this._scene.viewport.zoom || 1;
    const { worldPoints } = anchorOverlayPoints(shape, LINK_START_ANCHOR_OUTSET / zoom);
    const grab = (ANCHOR_DOT_ACTIVE_RADIUS + this.anchorStartHitSlop) / zoom;
    const grab2 = grab * grab;
    for (const wp of worldPoints) {
      const dx = wp.x - p.x;
      const dy = wp.y - p.y;
      if (dx * dx + dy * dy <= grab2) return true;
    }
    return false;
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
  public computeHiddenElements(): ReadonlySet<ElementId> | undefined {
    return computeHiddenElementsPure(this._scene);
  }

  public computeDimElements(enteredGroupId: ElementId): ReadonlySet<ElementId> {
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
    const isFrameEl = el.type === "frame";
    const members: ElementId[] = [];
    for (const s of this._scene.elements.values()) {
      if (s.parentId === id || (isFrameEl && s.frameId === id)) members.push(s.id);
    }
    if (members.length === 0) return;
    if (el.type === "group") this._enteredGroup = id;
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
      now - this.lastClickAt < DOUBLE_CLICK_MS &&
      this.lastClickWorldPoint !== null &&
      distanceTo(this.lastClickWorldPoint, worldPoint) <= DOUBLE_CLICK_TOLERANCE_PX;
    this.lastClickAt = now;
    this.lastClickWorldPoint = worldPoint;

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
      if (raw?.type === "text") {
        this.beginTextEdit(raw.id);
        return true;
      }
      if (raw?.type === "frame") {
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
        this.lassoBaseSelection ??= this._selection;
        this.lassoBaseLinks ??= this._selectedLinks;
        this.lassoPreview = emit.bounds;
        this.applyLassoLiveSelection(emit.bounds, emit.mode);
        this.notify();
        return;
      case "LASSO_CLEAR":
        if (
          this.lassoPreview !== null ||
          this.lassoBaseSelection !== null ||
          this.lassoBaseLinks !== null
        ) {
          this.lassoPreview = null;
          this.lassoBaseSelection = null;
          this.lassoBaseLinks = null;
          this.notify();
        }
        return;
      case "SELECT_BY_BOUNDS":
        // Final commit — uses the same logic as the live preview so
        // the visible selection matches what lands. Reset the base
        // snapshot so the next gesture re-captures it.
        this.lassoBaseSelection = null;
        this.lassoBaseLinks = null;
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
    // Locked / layer-locked elements are selectable but don't move.
    const el = getElement(this._scene, id);
    if (el && !this.isElementManipulable(el)) return;
    const d = this.snapActive() ? snapMoveDelta(originalBounds, delta, this.snapSpacing()) : delta;
    const patch = computeElementMovePatch(this._scene, id, d, originalBounds);
    if (!patch) return;
    this._scene = apply(this._scene, patch);
    this.recordGesturePatch(patch);
    this.notify();
  }

  private applyGroupMove(delta: Vec2): void {
    if (!this.groupMoveOrigin) return;
    const d = this.snapActive()
      ? snapGroupDelta(this.groupMoveOrigin, delta, this.snapSpacing())
      : delta;
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

  // Body moved to `./editor/viewport-helpers.ts`.
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
      // Render bounds (not geometric) so overpaint — a frame's header
      // strip, confetti particles — is cleared too, no ghost trail.
      const afterBounds = getElementRenderBounds(shape);
      const beforeBounds = old ? getElementRenderBounds(old) : null;
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
        // Render bounds so a removed frame/confetti clears its overpaint.
        const beforeBounds = getElementRenderBounds(shape);
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `acc` is mutated via the `add` closure; TS flow analysis can't see it and narrows to null
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
      if (getElement(this._scene, id)?.type !== "image") return false;
    }
    return true;
  }

  // Pure body in `./editor/applies/resize.ts`.
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
      this.selectionIsAspectLocked(),
    );
    this._scene = result.scene;
    for (const patch of result.patches) this.recordGesturePatch(patch);
    this.notify();
  }

  private applyResize(id: ElementId, handle: HandleId, delta: Vec2, originalBounds: Bounds): void {
    const shape = getElement(this._scene, id);
    const d = this.snapActive()
      ? snapResizeDelta(originalBounds, handle, delta, this.snapSpacing())
      : delta;
    // Text: aspect-locked font scaling. Snapshot the pristine shape on
    // the gesture's first tick so the scale base never compounds.
    if (shape?.type === "text") {
      if (this._resizeOriginElement?.id !== id) {
        this._resizeOriginElement = shape;
      }
      const result = computeTextResize(
        this._scene,
        this._resizeOriginElement as TextElement,
        handle,
        d,
        originalBounds,
      );
      if (!result) return;
      this._scene = result.scene;
      this.recordGesturePatch(result.patch);
      this.notify();
      return;
    }
    const result = computeElementResize(this._scene, id, handle, d, originalBounds, (s, raw, h) =>
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
    const b = this.snapActive() ? snapCreateBounds(bounds, this.snapSpacing()) : bounds;
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
  placeShapeAtLinkDrop(
    factory: (ctx: {
      id: ElementId;
      layerId: LayerId;
      position: Vec2;
      order: FractionalIndex;
    }) => Element,
  ): void {
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
    const built = factory({
      id: newId,
      layerId: this._activeLayerId,
      position: pending.world,
      order,
    });
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
    this._selectedLinks = LinkSelection.EMPTY;
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
  public createLinkedElementFromAnchor(fromElement: ElementId, anchorName: string): void {
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
    const placed = req(getElement(this._scene, newId));
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
    const src = getElement(this._scene, fromElement);
    if (!src) return null;
    const anchor: AnchorRef = { kind: "named", name: anchorName };
    const normal = getAnchorOutwardNormal(src, anchor);
    const b = getElementWorldBounds(src);
    const extentAlong = Math.abs(normal.x) * b.width + Math.abs(normal.y) * b.height;
    const dist = extentAlong + ANCHOR_CLICK_NEW_ELEMENT_GAP;
    const delta = { x: normal.x * dist, y: normal.y * dist };
    const bounds: Bounds = { x: b.x + delta.x, y: b.y + delta.y, width: b.width, height: b.height };
    const fromWorld = getAnchorWorld(src, anchor);
    // Facing edge of the ghost (toward the source) = its centre pulled back
    // along the normal by half its extent.
    const ghostCx = bounds.x + bounds.width / 2;
    const ghostCy = bounds.y + bounds.height / 2;
    const nearEdge = {
      x: ghostCx - normal.x * (extentAlong / 2),
      y: ghostCy - normal.y * (extentAlong / 2),
    };
    // The would-be element itself — a same-kind clone of the source shifted
    // to the ghost bounds, with blank user text (mirrors
    // `createLinkedElementFromAnchor`). The overlay renders THIS through the
    // real renderer so the ghost looks like the actual shape (an ellipse
    // ghosts as an ellipse), not a bounding rect. Throwaway id — never enters
    // the real scene.
    let element = {
      ...src,
      id: PREVIEW_GHOST_ELEMENT_ID,
      position: { x: src.position.x + delta.x, y: src.position.y + delta.y },
    } as Element;
    if (element.type === "text") element = { ...element, text: "" } as Element;
    else if (element.type === "frame") element = { ...element, name: "" } as Element;

    // Build a throwaway scene holding the ghost element + the would-be link so
    // the connector can be drawn through the REAL link renderer (same routing,
    // arrowhead and style it'll have once created) — faded — instead of a
    // dashed preview line. Mirrors the link build in
    // `createLinkedElementFromAnchor` exactly. The `path` field stays for
    // callers that just want the straight from→to segment.
    const srcCenter = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const withGhost = addElement(this._scene, element).scene;
    const placed = req(getElement(withGhost, PREVIEW_GHOST_ELEMENT_ID));
    const { ref: toRef } = findNearestAnchor(placed, srcCenter, snapExcludedAnchors(placed));
    const linkResult = computeCreateLink(
      withGhost,
      { kind: "anchor", elementId: fromElement, anchor },
      { kind: "anchor", elementId: PREVIEW_GHOST_ELEMENT_ID, anchor: toRef },
      PREVIEW_GHOST_LINK_ID,
      this._activeLayerId,
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
    const result = this.snapEngine.snap({
      scene: this._scene,
      probe: worldPoint,
      threshold: this.snapThreshold,
      gesture: "draw-edge",
    });

    // Attach contract: dropping on a port dot → *fixed* anchor; dropping
    // near an EDGE (not a dot) → *fixed* outline point (a ratio along the
    // perimeter — survives move/resize); dropping on the body interior (no
    // snap to a dot or edge) → *floating* against the whole shape, so the
    // connection re-aims at the partner as either shape moves; dropping on
    // empty canvas → a free point.
    //
    // Pick a candidate ON the pressed shape if there is one, otherwise the
    // nearest overall. The "nearest overall" branch matters because the
    // attach DOTS are drawn OUTSIDE the body — a release on a dot finds no
    // element under it (hit-test = empty), so `pressTargetElement` is null,
    // yet the snap engine still reports the dot's anchor within threshold.
    // Binding it makes the endpoint enter PERPENDICULAR to that edge instead
    // of staying a free point that aims at the partner (jumping between the
    // four sides).
    const pick = (kind: SnapCandidate["kind"]): SnapCandidate | undefined => {
      if (pressTargetElement !== null) {
        const onTarget = result.all.find(
          (c) => c.kind === kind && c.metadata?.elementId === pressTargetElement,
        );
        if (onTarget) return onTarget;
      }
      return result.all.find((c) => c.kind === kind);
    };

    const boundFrom = (
      cand: SnapCandidate | undefined,
      want: "anchor" | "outline",
    ): LinkEndpoint | null => {
      if (!cand) return null;
      const elId = cand.metadata?.elementId as ElementId | undefined;
      if (elId === undefined) return null;
      const shp = getElement(this._scene, elId);
      if (!shp) return null;
      const ep = endpointFromSnap(elId, cand, shp);
      return ep.kind === want ? ep : null;
    };

    const anchorEp = boundFrom(pick("anchor"), "anchor");
    if (anchorEp) return anchorEp;
    const outlineEp = boundFrom(pick("outline"), "outline");
    if (outlineEp) return outlineEp;

    // No dot/edge snap. Over a shape body → floating; else a free point.
    if (pressTargetElement !== null && getElement(this._scene, pressTargetElement)) {
      return { kind: "floating", elementId: pressTargetElement };
    }
    return { kind: "point", position: worldPoint };
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
    const base = this.lassoBaseSelection ?? Selection.EMPTY;
    const next = selectByBoundsLivePure(
      this._scene,
      base,
      (id) => this.isLayerLocked(id),
      bounds,
      mode,
    );
    const linkBase = this.lassoBaseLinks ?? LinkSelection.EMPTY;
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

  // Pure body in `./editor/applies/edge.ts`. The wrapper here
  // owns the side effects (history push, drag-state clearing,
  // notify).
  /**
   * Live endpoint-rebind move: re-point the dragged end to the cursor in the
   * scene (a free `point` endpoint), recorded in the gesture transaction so the
   * WHOLE link redraws under the cursor with full fidelity — real style,
   * arrowhead, curved bow, and (via `rerouteElbows` in `render`) a live elbow
   * re-route. One undo step on commit; Escape cancels the transaction and the
   * link snaps back to where it was. The handle dot follows via `linkEndpointDrag`.
   */
  private applyLinkEndpointMove(linkId: LinkId, side: "from" | "to", toPoint: Vec2): void {
    const edge = getLink(this._scene, linkId);
    if (!edge) return;
    // A real drag breaks the handle double-click chain (mirrors waypoint /
    // segment drags) so a quick click after dropping isn't read as a delete.
    this.lastHandleClickAt = 0;
    // Resolve the attach target under the cursor and snap the endpoint to it
    // with the SAME logic the drop uses, so the link attaches LIVE exactly as it
    // will commit — lands on the dot (fixed), floats on the body, or stays a
    // free point over empty space.
    const target = this.linkAttachTargetAt(toPoint);
    const targetId = target?.kind === "element" ? target.id : null;
    const ep = this.snapLinkEndpoint(targetId, toPoint);
    const r = updateLink(this._scene, linkId, (e) =>
      side === "from" ? { ...e, from: ep } : { ...e, to: ep },
    );
    this._scene = r.scene;
    this.recordGesturePatch(r.patch);
    this.linkEndpointDrag = { linkId, side, toPoint };
    // Attach-point highlight — the SAME feedback as drawing a new link
    // (candidate dots + float-element halo), driven by `hoveredLinkTarget`.
    this.updateHoveredLinkTarget(toPoint);
    this.notify();
  }

  private applyLinkEndpointUpdate(
    emit: Extract<InteractionEmit, { type: "UPDATE_EDGE_ENDPOINT" }>,
  ): void {
    // A move opened a gesture transaction (live re-point per tick). The final
    // snapped endpoint goes into the SAME transaction so the net history step is
    // original → final (one undo). A pure click (no move, no tx) that resolves
    // to a no-op change must not leave a junk undo entry.
    const moved = this.gestureTx !== null;
    const result = computeLinkEndpointUpdate(this._scene, emit, (toElement, toPoint) =>
      this.snapLinkEndpoint(toElement, toPoint),
    );
    if (result === null) {
      this.cancelGesture();
      this.linkEndpointDrag = null;
      this.hoveredLinkTarget = null;
      this.notify();
      return;
    }
    if (!moved && isNoop(result.patch)) {
      this.linkEndpointDrag = null;
      this.hoveredLinkTarget = null;
      this.notify();
      return;
    }
    this._scene = result.scene;
    this.recordGesturePatch(result.patch);
    this.commitGesture();
    this.linkEndpointDrag = null;
    this.hoveredLinkTarget = null;
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
    // A real drag breaks the handle double-click chain (see updateSegmentDrag).
    this.lastHandleClickAt = 0;
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
    if (edge?.waypoints && drag.index >= 0 && drag.index < edge.waypoints.length) {
      const path = getLinkPath(this._scene, edge);
      const wp = req(edge.waypoints[drag.index]);
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

  /** True while an elbow segment is being dragged. */
  get isDraggingSegment(): boolean {
    return this.linkSegmentDrag !== null;
  }

  /**
   * Begin a host-managed elbow segment drag. `axis` is the segment's
   * orientation; `at` is its centre along its own axis (used to re-identify it
   * across re-routes).
   */
  beginSegmentDrag(linkId: LinkId, axis: "h" | "v", at: number): void {
    if (!getLink(this._scene, linkId)) return;
    this.linkSegmentDrag = { linkId, axis, at };
  }

  /**
   * Move the dragged elbow segment perpendicular to its axis: pin its
   * perpendicular coordinate to the cursor. The reroute pass re-flows the
   * rest around the pin (one undo step via the gesture transaction).
   */
  updateSegmentDrag(world: Vec2): void {
    const drag = this.linkSegmentDrag;
    if (!drag) return;
    // A real drag breaks the handle double-click chain, so a single click
    // right after pinning can't be misread as a double-click (= delete).
    this.lastHandleClickAt = 0;
    const edge = getLink(this._scene, drag.linkId);
    if (!edge) return;
    const pos = drag.axis === "h" ? world.y : world.x;
    const fixed = [...(edge.fixedSegments ?? [])];
    const entry = { axis: drag.axis, pos, at: drag.at };
    const at = fixed.findIndex((f) => f.axis === drag.axis && Math.abs(f.at - drag.at) < 0.5);
    if (at >= 0) fixed[at] = entry;
    else fixed.push(entry);
    const r = updateLink(this._scene, drag.linkId, (e) => ({ ...e, fixedSegments: fixed }));
    this._scene = r.scene;
    this.recordGesturePatch(r.patch);
    this.notify();
  }

  /** Finish the elbow segment drag (commit the gesture as one undo step). */
  endSegmentDrag(): void {
    if (!this.linkSegmentDrag) return;
    this.linkSegmentDrag = null;
    this.commitGesture();
  }

  /**
   * Double-click detector for link edit handles (waypoint / segment).
   * Returns true when this press follows the previous handle press within
   * the double-click window + tolerance. Updates state every call. Kept
   * separate from the up-side double-click path (handles return early in
   * `onDown`, so that path never sees them).
   */
  isHandleDoubleClick(world: Vec2): boolean {
    const now = performance.now();
    const isDouble =
      now - this.lastHandleClickAt < DOUBLE_CLICK_MS &&
      this.lastHandleClickWorld !== null &&
      distanceTo(this.lastHandleClickWorld, world) <= DOUBLE_CLICK_TOLERANCE_PX;
    this.lastHandleClickAt = now;
    this.lastHandleClickWorld = world;
    return isDouble;
  }

  /**
   * Delete a free bend point (waypoint) from a straight / bezier link by
   * index — double-click a waypoint handle to remove it. One undo step.
   */
  deleteWaypoint(linkId: LinkId, index: number): void {
    const edge = getLink(this._scene, linkId);
    if (!edge?.waypoints || index < 0 || index >= edge.waypoints.length) return;
    const wps = edge.waypoints.filter((_, i) => i !== index);
    const r = updateLink(this._scene, linkId, (e) => ({ ...e, waypoints: wps }));
    this._scene = r.scene;
    this._history.push(r.patch);
    this.notify();
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
    const edge = getLink(this._scene, linkId);
    if (!edge?.fixedSegments || edge.fixedSegments.length === 0) return;
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < edge.fixedSegments.length; i++) {
      const f = req(edge.fixedSegments[i]);
      if (f.axis !== axis) continue;
      const d = Math.abs(f.pos - pos) + Math.abs(f.at - at) * 0.001;
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return;
    const fixed = edge.fixedSegments.filter((_, i) => i !== bestIdx);
    const r = updateLink(this._scene, linkId, (e) => ({ ...e, fixedSegments: fixed }));
    this._scene = r.scene;
    this._history.push(r.patch);
    this.notify();
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
    this.elbowRouteSig.delete(id);
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

    // Mode mirrors snapLinkEndpoint: a named-anchor OR edge (outline) hit →
    // *fixed* point (show the dot, no float halo); only the body interior with
    // no edge/dot snap → floating (attach to the whole element).
    const mode: "point" | "element" = activeName !== null || outlinePoint ? "point" : "element";
    this.hoveredLinkTarget = { elementId: shape.id, activeAnchor: activeName, outlinePoint, mode };
    this.notify();
  }

  // Pure body in `./editor/applies/edge.ts`.
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
  // cancelGesture / finalizeOpenGestureTx / maybeRevertModeAfterCreate
  // live in `./editor/gesture-tx.ts`. The thin instance methods below
  // preserve the original call sites.
  private recordGesturePatch(patch: Patch): void {
    // Snapshot the pre-gesture scene the moment the transaction opens, so a
    // later cancel/Escape can restore it (the history tx only records undo data,
    // it doesn't roll `_scene` back). Callers apply the patch to `_scene` BEFORE
    // recording, so reconstruct the pre-state by inverting this first patch.
    if (this.gestureTx === null) this.gestureStartScene = apply(this._scene, invert(patch));
    this.gestures.record(patch);
  }
  public commitGesture(): void {
    this._resizeOriginElement = null;
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
  // Pure body in `./editor/container-ops.ts`. Editor exposes a
  // small `ContainerOpsRef` bridge so the module can mutate scene
  // + push patches into the running gesture transaction.
  public applyContainerDrop(worldPoint: Vec2): void {
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
   * Return the running gesture tx, or open a new one if the drag finished
   * with an empty transaction (a move-by-zero-pixels gesture can still
   * carry a container reparent).
   */
  private beginOrAttachGesture(): TransactionHandle {
    this.gestureTx ??= this._history.transaction();
    return this.gestureTx;
  }

  // Body moved to `./editor/gesture-tx.ts`.
  public cancelGesture(): void {
    this._resizeOriginElement = null;
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
    const base = `${part(edge.from)}|${part(edge.to)}|${JSON.stringify(edge.fixedSegments ?? null)}`;
    // Avoid-obstacles links depend on EVERY shape's geometry, so their route
    // must invalidate when any obstacle moves — fold a digest of all element
    // bboxes into the signature. Only paid by links that opt in.
    if (edge.avoidObstacles === true) {
      let digest = "|avoid:";
      for (const el of this._scene.elements.values()) {
        const bb = getElementWorldBounds(el);
        digest += `${el.id},${bb.x},${bb.y},${bb.width},${bb.height};`;
      }
      return base + digest;
    }
    return base;
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
    setAnimationClock((shape: { readonly id?: unknown }) =>
      this.playbackClock(shape.id as ElementId),
    );
    renderEditor(this);
    // Present AFTER the paint, on the same tick — deferred-submission
    // surfaces (WebGL2 / OffscreenCanvas) would otherwise lag one frame.
    this.onAfterRender?.();
  }
}

/**
 * Throwaway id for the transient click-create ghost preview element built by
 * `previewClickCreate`. Never enters the scene / history — it lives only for
 * the duration of one overlay paint, so any stable constant is fine.
 */
const PREVIEW_GHOST_ELEMENT_ID = "__ghost-preview__" as ElementId;

/** Throwaway link id for the click-create ghost preview. See above. */
const PREVIEW_GHOST_LINK_ID = "__ghost-preview-link__" as LinkId;

const distanceTo = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

// `coverageRatio` moved to `./editor/container-ops.ts`.

// `hasWidthHeight` moved to `./editor/shape-traits.ts` for shared
// use by container-ops and the future applies/resize module.

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

// `describeNudge` moved to `./editor/public/selection-ops.ts`.

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

/**
 * Convert a snap candidate into an `LinkEndpoint`. Anchor snap → named
 * anchor ref; outline snap → outline ref with the sampled ratio. Falls
 * back to a free point if the metadata isn't recognised.
 */
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
