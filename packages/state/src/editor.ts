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
  getShapesInBounds,
  getShapeWorldBounds,
  getScreenToWorld,
  panBy as viewportPanBy,
  resize as viewportResize,
  zoomAt as viewportZoomAt,
  gridSnapper,
  listAnchorsLocal,
  orderForBottom,
  orderForTop,
  outlineSnapper,
  removeAnnotation,
  removeEdge,
  removeLayer,
  removeShape,
  SnapEngine,
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
  DEFAULT_LOD,
  renderEdges,
  renderGrid,
  renderScene,
  ShapeCache,
  type RenderTarget,
} from "@oh-just-another/renderer-core";
import { History, type HistoryOptions, type TransactionHandle } from "@oh-just-another/history";
import { fromPointerEvent } from "./dom-events.js";
import {
  ANNOTATION_PIN_HIT_SLOP,
  DEFAULT_SNAP_THRESHOLD,
  EDGE_ENDPOINT_HANDLE_RADIUS,
  EDGE_HIT_THRESHOLD,
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_MAX_MOVEMENT_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  PINCH_MIN_MOVEMENT_PX,
  TOUCH_EDGE_HANDLE_HIT_SLOP,
  TOUCH_EDGE_HIT_THRESHOLD,
  TOUCH_HANDLE_HIT_SLOP,
  VIEWPORT_CULL_PADDING_RATIO,
  WHEEL_PAN_FACTOR,
  WHEEL_ZOOM_STEP,
} from "./constants.js";
import { HANDLE_SIZE, hitHandle } from "./handle.js";
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
  /** Pre-existing history instance, or options for one. */
  readonly history?: History | HistoryOptions;
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
}

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

  private readonly _history: History;
  /** Open transaction during a single drag/resize gesture. */
  private gestureTx: TransactionHandle | null = null;

  constructor(options: EditorOptions) {
    this.host = options.host;
    this.mainTarget = options.mainTarget;
    this.overlayTarget = options.overlayTarget;
    this.backgroundTarget = options.backgroundTarget ?? null;
    this._scene = options.initialScene;
    this._history =
      options.history instanceof History ? options.history : new History(options.history ?? {});

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
    this.handleHitSlop = this.inputMode === "touch" ? TOUCH_HANDLE_HIT_SLOP : HANDLE_SIZE;
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
  get history(): History {
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
    for (const id of this._selection) {
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
    const out: Shape[] = [];
    for (const id of this._selection) {
      const s = getShape(this._scene, id);
      if (s) out.push(structuredClone(s));
    }
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
   * Paste clipboard contents into the scene, offset 10 px down-right
   * of the originals to make duplicates visible. New shapes get fresh
   * ids and end up selected. Single undo step.
   */
  paste(): void {
    if (this.clipboard.length === 0) return;
    const tx = this._history.transaction();
    const newIds: ShapeId[] = [];
    for (const tmpl of this.clipboard) {
      const newId = castShapeId(`shape-${++this.nextId}-${Date.now().toString(36)}`);
      const order = orderForTop(
        [...this._scene.shapes.values()]
          .filter((s) => s.layerId === tmpl.layerId)
          .map((s) => s.order),
      );
      const clone = {
        ...structuredClone(tmpl),
        id: newId,
        position: { x: tmpl.position.x + 10, y: tmpl.position.y + 10 },
        order,
      } as Shape;
      const r = addShape(this._scene, clone);
      this._scene = r.scene;
      tx.add(r.patch);
      newIds.push(newId);
    }
    tx.commit();
    let next = Selection.EMPTY;
    for (const id of newIds) next = Selection.add(next, id);
    this._selection = next;
    this.notify();
    this.announce(`Pasted ${newIds.length} shapes`);
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
  }

  // --- Internal ---

  private bindPointerEvents(): () => void {
    const onDown = (ev: PointerEvent) => {
      ev.preventDefault();
      this.host.setPointerCapture(ev.pointerId);
      const data = fromPointerEvent(ev, this.host);

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

      // Interactive sub-element check: when the press lands on a shape whose
      // type has a registered hit-tester (rich templates, etc.) and the
      // tester finds an interactive node, fire its emit and skip the normal
      // press flow entirely. This is what makes a click on a template Button
      // behave differently from a click on the template body.
      const topShape = getShapeAt(this._scene, worldPoint);
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
      // Snapshot positions of every selected shape when the press lands
      // on a member of a multi-selection — the editor will translate the
      // whole group during the drag.
      if (target.kind === "shape" && this._selection.size > 1 && this._selection.has(target.id)) {
        const snap = new Map<ShapeId, Vec2>();
        for (const id of this._selection) {
          const s = getShape(this._scene, id);
          if (s) snap.set(id, s.position);
        }
        this.groupMoveOrigin = snap;
      } else {
        this.groupMoveOrigin = null;
      }
      // Snapshot each member's world bounds + position + scale when the
      // press lands on a group-handle so the per-frame resize math has
      // a stable baseline to scale against.
      if (target.kind === "group-handle") {
        const shapes = new Map<ShapeId, { position: Vec2; bounds: Bounds; scale: Vec2 }>();
        for (const id of this._selection) {
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

      const data = fromPointerEvent(ev, this.host);
      const worldPoint = this.screenToWorld(data.point);

      // First, fire any click-style effect derived from the press context.
      const ctxBeforeUp = this.actor.getSnapshot().context;
      const clickEffect = interpretPressEnd(ctxBeforeUp, worldPoint);
      if (clickEffect) this.applyEmit(clickEffect);

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
      this.commitGesture();
    };

    const onCancel = (ev: PointerEvent) => {
      this.activePointers.delete(ev.pointerId);
      if (this.pinchOrigin) {
        if (this.activePointers.size < 2) this.pinchOrigin = null;
        return;
      }
      this.cancelLongPress();
      this.drawingPreview = null;
      this.actor.send({ type: "POINTER_CANCEL" });
      this.cancelGesture();
    };

    this.host.addEventListener("pointerdown", onDown);
    this.host.addEventListener("pointermove", onMove);
    this.host.addEventListener("pointerup", onUp);
    this.host.addEventListener("pointercancel", onCancel);

    // Wheel: Cmd/Ctrl + wheel → zoom around the cursor (matches standard /
    // standard). Plain wheel → pan both axes from deltaX/deltaY simultaneously
    // (trackpads emit both; mouse-wheel-only users use Shift+wheel for
    // horizontal). Always preventDefault so the page does not scroll.
    const onWheel = (ev: WheelEvent): void => {
      ev.preventDefault();
      const rect = this.host.getBoundingClientRect();
      const screenPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      if (ev.ctrlKey || ev.metaKey) {
        const direction = ev.deltaY < 0 ? 1 : -1;
        const factor = Math.pow(WHEEL_ZOOM_STEP, direction);
        const currentZoom = this._scene.viewport.zoom;
        const nextZoom = clampZoom(currentZoom * factor);
        if (nextZoom === currentZoom) return;
        const anchor = this.screenToWorld(screenPoint);
        this.zoomAt(nextZoom / currentZoom, anchor);
      } else {
        // Pan: deltaX → horizontal, deltaY → vertical. Shift converts a
        // vertical-only wheel into horizontal pan (and zeroes Y) — common
        // pattern for users on mice without horizontal scroll.
        let dx = ev.deltaX;
        let dy = ev.deltaY;
        if (ev.shiftKey && dx === 0) {
          dx = dy;
          dy = 0;
        }
        this.panBy({ x: -dx * WHEEL_PAN_FACTOR, y: -dy * WHEEL_PAN_FACTOR });
      }
    };
    // `passive: false` because we preventDefault. Browsers default wheel
    // listeners to passive — must opt out explicitly.
    this.host.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      this.host.removeEventListener("pointerdown", onDown);
      this.host.removeEventListener("pointermove", onMove);
      this.host.removeEventListener("pointerup", onUp);
      this.host.removeEventListener("pointercancel", onCancel);
      this.host.removeEventListener("wheel", onWheel);
    };
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
    // 1a. Group resize handles win when several shapes are selected.
    if (this._selection.size > 1) {
      const combined = this.combinedSelectionBounds();
      if (combined) {
        const handle = hitHandle(worldPoint, combined, zoom, this.handleHitSlop);
        if (handle) {
          return { kind: "group-handle", handle, bounds: combined };
        }
      }
    }
    // 1b. Resize handles on a single selected shape.
    for (const id of this._selection) {
      const shape = getShape(this._scene, id);
      if (!shape || !isResizable(shape)) continue;
      const bounds = getShapeWorldBounds(shape);
      const handle = hitHandle(worldPoint, bounds, zoom, this.handleHitSlop);
      if (handle) {
        return { kind: "handle", shapeId: id, handle, bounds };
      }
    }
    // 2. Endpoint handles on a selected edge — only when an edge is
    //    selected. Threshold in screen pixels, converted to world.
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
    // 3. Topmost shape under cursor. Skip shapes on locked layers.
    const shape = getShapeAt(this._scene, worldPoint);
    if (shape && !this.isLayerLocked(shape.layerId)) {
      return { kind: "shape", id: shape.id, bounds: getShapeWorldBounds(shape) };
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
        this.lassoPreview = emit.bounds;
        this.notify();
        return;
      case "LASSO_CLEAR":
        if (this.lassoPreview !== null) {
          this.lassoPreview = null;
          this.notify();
        }
        return;
      case "SELECT_BY_BOUNDS":
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
    }
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

  private combinedSelectionBounds(): Bounds | null {
    let acc: Bounds | null = null;
    for (const id of this._selection) {
      const s = getShape(this._scene, id);
      if (!s) continue;
      const b = getShapeWorldBounds(s);
      acc = acc ? B.union(acc, b) : b;
    }
    return acc;
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
    const sx = originalBounds.width > 0 ? next.width / originalBounds.width : 1;
    const sy = originalBounds.height > 0 ? next.height / originalBounds.height : 1;
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
    if (
      shape.type !== "rectangle" &&
      shape.type !== "ellipse" &&
      shape.type !== "image" &&
      shape.type !== "template"
    )
      return;

    const raw = resizeFromHandle(originalBounds, handle, delta);
    const constrained = applyResizeConstraints(originalBounds, raw, handle, shape);

    const next: Shape = {
      ...shape,
      position: { x: constrained.x, y: constrained.y },
      width: constrained.width,
      height: constrained.height,
    } as Shape;
    const patch: Patch = { kind: "shape", id, before: shape, after: next };
    this._scene = apply(this._scene, patch);
    this.recordGesturePatch(patch);
    this.notify();
  }

  private applyCreate(kind: "rect" | "ellipse", bounds: Bounds): void {
    const id = castShapeId(`shape-${++this.nextId}-${Date.now().toString(36)}`);
    const layerId = this._activeLayerId;
    const order = orderForTop(
      Array.from(this._scene.shapes.values())
        .filter((s) => s.layerId === layerId)
        .map((s) => s.order),
    );
    const common = {
      id,
      layerId,
      position: { x: bounds.x, y: bounds.y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order,
      style:
        kind === "rect"
          ? { fill: "#cfe1ff", stroke: "#1a40b0", strokeWidth: 2 }
          : { fill: "#ffd6d6", stroke: "#a01a1a", strokeWidth: 2 },
      width: bounds.width,
      height: bounds.height,
    };
    const shape: Shape =
      kind === "rect" ? { ...common, type: "rectangle" } : { ...common, type: "ellipse" };
    const result = addShape(this._scene, shape);
    this._scene = result.scene;
    this._selection = Selection.single(id);
    // CREATE is a single-shot operation, not part of a multi-tick gesture.
    this._history.push(result.patch);
    this.notify();
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
    const { ref } = findNearestAnchor(shape, worldPoint);
    return { kind: "anchor", shapeId: pressTargetShape, anchor: ref };
  }

  /**
   * Select every shape whose world-bounds intersect the lasso rectangle.
   * `mode: "replace"` swaps the selection wholesale; `"add"` extends it
   * (Shift / Cmd lasso).
   */
  private applySelectByBounds(bounds: Bounds, mode: "replace" | "add"): void {
    const hits = getShapesInBounds(this._scene, bounds);
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
    const shape = getShapeAt(this._scene, worldPoint);
    if (!shape) {
      if (this.hoveredEdgeTarget !== null) {
        this.hoveredEdgeTarget = null;
        this.notify();
      }
      return;
    }
    const nearest = findNearestAnchor(shape, worldPoint);
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
      if (shape) from = findNearestAnchor(shape, fromPoint).world;
    }
    let to = toPoint;
    // If the pointer is currently hovering a shape, snap the visible end
    // to its nearest port too. The host has no way to know the hovered
    // shape mid-drag (no PressTarget pushed in POINTER_MOVE) — but we can
    // simply hit-test the scene here.
    const hovered = getShapeAt(this._scene, toPoint);
    if (hovered) {
      to = findNearestAnchor(hovered, toPoint).world;
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
    if (!this.gestureTx) return;
    this.gestureTx.commit();
    this.gestureTx = null;
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
  }

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
    renderScene(this._scene, this.mainTarget, {
      ...(viewportWorld ? { viewport: viewportWorld } : {}),
      boundsCache: this.boundsCache,
      lod: DEFAULT_LOD,
    });
    renderEdges(this._scene, this.mainTarget);
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
        const names = [...listAnchorsLocal(shape).keys()];
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
    if (this._selection.size > 1) {
      const combined = this.combinedSelectionBounds();
      if (combined) overlayOpts.groupBounds = combined;
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
