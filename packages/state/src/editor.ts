import { createActor, type Actor } from "xstate";
import type { Bounds, ShapeId, Vec2 } from "@oh-just-another/types";
import { shapeId as castShapeId } from "@oh-just-another/types";
import {
  addShape,
  apply,
  DEFAULT_LAYER_ID,
  getShape,
  getShapeAt,
  getShapeWorldBounds,
  getScreenToWorld,
  orderForTop,
  type Patch,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { bounds as B, matrix } from "@oh-just-another/math";
import { renderScene, type RenderTarget } from "@oh-just-another/renderer-core";
import { History, type HistoryOptions, type TransactionHandle } from "@oh-just-another/history";
import { fromPointerEvent } from "./dom-events";
import { hitHandle } from "./handle";
import { getInteractiveHitTester } from "./interactive";
import {
  boundsFromPoints,
  interactionMachine,
  interpretPressEnd,
  type InteractionContext,
  type InteractionEmit,
  type PressTarget,
} from "./machine";
import type { HandleId } from "./handle";
import type { Mode } from "./modes";
import { isResizable, renderOverlay } from "./overlay";
import * as Selection from "./selection";

export interface EditorOptions {
  readonly host: HTMLElement;
  readonly mainTarget: RenderTarget;
  readonly overlayTarget: RenderTarget;
  readonly initialScene: Scene;
  readonly initialMode?: Mode;
  /** Pre-existing history instance, or options for one. */
  readonly history?: History | HistoryOptions;
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
  private readonly actor: Actor<typeof interactionMachine>;
  private readonly listeners = new Set<() => void>();
  private readonly unbind: () => void;

  private _scene: Scene;
  private _selection: Selection.Selection = Selection.EMPTY;
  /** Live preview while drawing a new shape; null when not drawing. */
  private drawingPreview: Bounds | null = null;
  private nextId = 0;

  private readonly _history: History;
  /** Open transaction during a single drag/resize gesture. */
  private gestureTx: TransactionHandle | null = null;

  constructor(options: EditorOptions) {
    this.host = options.host;
    this.mainTarget = options.mainTarget;
    this.overlayTarget = options.overlayTarget;
    this._scene = options.initialScene;
    this._history =
      options.history instanceof History ? options.history : new History(options.history ?? {});

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

  /** Subscribe to scene/selection/mode/history changes. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setMode(mode: Mode): void {
    // Cancel any in-progress drag gesture so the partial state is not recorded.
    if (this.gestureTx) {
      this.gestureTx.cancel();
      this.gestureTx = null;
    }
    this.actor.send({ type: "SET_MODE", mode });
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
   * Replace the entire scene (e.g. after `parseScene`). Clears history,
   * selection and any open gesture. Use to load a saved document.
   */
  loadScene(scene: Scene): void {
    if (this.gestureTx) {
      this.gestureTx.cancel();
      this.gestureTx = null;
    }
    this._scene = scene;
    this._selection = Selection.EMPTY;
    this._history.clear();
    this.notify();
  }

  /** Detach all DOM listeners and stop the actor. */
  dispose(): void {
    this.unbind();
    this.actor.stop();
    this.listeners.clear();
  }

  // --- Internal ---

  private bindPointerEvents(): () => void {
    const onDown = (ev: PointerEvent) => {
      ev.preventDefault();
      this.host.setPointerCapture(ev.pointerId);
      const data = fromPointerEvent(ev, this.host);
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
      this.actor.send({ type: "POINTER_DOWN", point: worldPoint, target });
    };

    const onMove = (ev: PointerEvent) => {
      const data = fromPointerEvent(ev, this.host);
      const worldPoint = this.screenToWorld(data.point);
      const ctx = this.actor.getSnapshot().context;
      if (ctx.pressOrigin && ctx.mode !== "select" && this.isDrawingPhase(ctx)) {
        // Update drawing preview live before machine transitions occur.
        this.drawingPreview = boundsFromPoints(ctx.pressOrigin, worldPoint);
      }
      this.actor.send({ type: "POINTER_MOVE", point: worldPoint });
    };

    const onUp = (ev: PointerEvent) => {
      if (this.host.hasPointerCapture(ev.pointerId)) {
        this.host.releasePointerCapture(ev.pointerId);
      }
      const data = fromPointerEvent(ev, this.host);
      const worldPoint = this.screenToWorld(data.point);

      // First, fire any click-style effect derived from the press context.
      const ctxBeforeUp = this.actor.getSnapshot().context;
      const clickEffect = interpretPressEnd(ctxBeforeUp, worldPoint);
      if (clickEffect) this.applyEmit(clickEffect);

      this.drawingPreview = null;
      this.actor.send({ type: "POINTER_UP", point: worldPoint });
      this.commitGesture();
    };

    const onCancel = () => {
      this.drawingPreview = null;
      this.actor.send({ type: "POINTER_CANCEL" });
      this.cancelGesture();
    };

    this.host.addEventListener("pointerdown", onDown);
    this.host.addEventListener("pointermove", onMove);
    this.host.addEventListener("pointerup", onUp);
    this.host.addEventListener("pointercancel", onCancel);

    return () => {
      this.host.removeEventListener("pointerdown", onDown);
      this.host.removeEventListener("pointermove", onMove);
      this.host.removeEventListener("pointerup", onUp);
      this.host.removeEventListener("pointercancel", onCancel);
    };
  }

  private isDrawingPhase(ctx: InteractionContext): boolean {
    return ctx.mode === "draw-rect" || ctx.mode === "draw-ellipse";
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
    // Selection takes priority: if the point hits a handle on a currently
    // selected, *resizable* shape, dispatch a handle press. Non-resizable
    // shapes (polygon, path, text) don't display handles, so we don't hit-test
    // for them either.
    const zoom = this._scene.viewport.zoom;
    for (const id of this._selection) {
      const shape = getShape(this._scene, id);
      if (!shape || !isResizable(shape)) continue;
      const bounds = getShapeWorldBounds(shape);
      const handle = hitHandle(worldPoint, bounds, zoom);
      if (handle) {
        return { kind: "handle", shapeId: id, handle, bounds };
      }
    }
    // Otherwise: topmost shape under cursor.
    const shape = getShapeAt(this._scene, worldPoint);
    if (shape) {
      return { kind: "shape", id: shape.id, bounds: getShapeWorldBounds(shape) };
    }
    return { kind: "empty" };
  }

  private applyEmit(emit: InteractionEmit): void {
    switch (emit.type) {
      case "SELECT_REPLACE":
        this._selection = Selection.single(emit.id);
        this.notify();
        return;
      case "SELECT_CLEAR":
        this._selection = Selection.EMPTY;
        this.notify();
        return;
      case "MOVE_SHAPE":
        this.applyMove(emit.id, emit.delta, emit.originalBounds);
        return;
      case "RESIZE_SHAPE":
        this.applyResize(emit.id, emit.handle, emit.delta, emit.originalBounds);
        return;
      case "CREATE_SHAPE":
        this.applyCreate(emit.shapeType, emit.bounds);
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
    const order = orderForTop(
      Array.from(this._scene.shapes.values())
        .filter((s) => s.layerId === DEFAULT_LAYER_ID)
        .map((s) => s.order),
    );
    const common = {
      id,
      layerId: DEFAULT_LAYER_ID,
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
   * Open a gesture transaction on the first drag-emitted patch, then add
   * subsequent patches to it. POINTER_UP commits it as one history record.
   */
  private recordGesturePatch(patch: Patch): void {
    this.gestureTx ??= this._history.transaction();
    this.gestureTx.add(patch);
  }

  private commitGesture(): void {
    if (!this.gestureTx) return;
    this.gestureTx.commit();
    this.gestureTx = null;
  }

  private cancelGesture(): void {
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
    renderScene(this._scene, this.mainTarget);
    renderOverlay(
      this._scene,
      this._selection,
      this.overlayTarget,
      this.drawingPreview ? { drawingPreview: this.drawingPreview } : {},
    );
  }
}

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
