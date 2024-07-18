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
import { renderOverlay } from "./overlay";
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
    // selected shape, dispatch a handle press.
    const zoom = this._scene.viewport.zoom;
    for (const id of this._selection) {
      const shape = getShape(this._scene, id);
      if (!shape) continue;
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
    }
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
    // Only built-in rectangle/ellipse have width/height to resize.
    if (shape.type !== "rectangle" && shape.type !== "ellipse") return;

    const nextBounds = resizeFromHandle(originalBounds, handle, delta);
    const normalized = B.normalize(nextBounds);

    const next: Shape = {
      ...shape,
      position: { x: normalized.x, y: normalized.y },
      width: normalized.width,
      height: normalized.height,
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
