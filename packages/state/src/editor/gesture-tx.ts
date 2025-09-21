import type { Patch } from "@oh-just-another/scene";
import type { ElementId } from "@oh-just-another/types";
import type { HistoryProvider, TransactionHandle } from "@oh-just-another/history";
import type { Mode } from "../modes.js";

/**
 * Narrow editor surface that `GestureController` needs. Editor
 * implements this implicitly by exposing the listed fields and
 * methods to the controller through a thin internal-only bridge
 * object — this module never imports the full `Editor` class so
 * it stays small and acycle-free.
 *
 * Fields are written by the controller (`gestureTx`;
 * `groupMoveOrigin` etc. are cleared on every commit) and are
 * internal — not exposed externally.
 */
export interface GestureRef {
  readonly history: HistoryProvider;
  gestureTx: TransactionHandle | null;
  groupMoveOrigin: unknown;
  groupResizeOrigin: unknown;
  dragShapeId: ElementId | null;
  containerHover: { readonly id: ElementId } | null;
  readonly toolLocked: boolean;
  readonly mode: Mode;
  setMode(mode: Mode): void;
  notify(): void;
}

/**
 * Gesture lifecycle controller. Wraps the open-transaction model
 * — drag / resize / multi-step operations open a `TransactionHandle`
 * on first move, append patches as they arrive, commit on
 * POINTER_UP. `commit` also clears the drag-target scratch fields
 * and unconditionally fires a final notify so downstream
 * subscribers (Undo/Redo button, mode toggle) update even when
 * intermediate xstate re-entrancy queued events that only drained
 * after the outer event handler returned.
 */
export class GestureController {
  constructor(private readonly ref: GestureRef) {}

  /**
   * Open a gesture transaction on the first drag-emitted patch,
   * then add subsequent patches to it. POINTER_UP commits it as
   * one history record.
   */
  record(patch: Patch): void {
    this.ref.gestureTx ??= this.ref.history.transaction();
    this.ref.gestureTx.add(patch);
  }

  commit(): void {
    this.ref.groupMoveOrigin = null;
    this.ref.groupResizeOrigin = null;
    this.ref.dragShapeId = null;
    if (this.ref.containerHover !== null) {
      this.ref.containerHover = null;
    }
    if (this.ref.gestureTx) {
      this.ref.gestureTx.commit();
      this.ref.gestureTx = null;
    }
    // Notify unconditionally on gesture end. Two reasons:
    //   1. Committing the transaction (drag / resize) flips
    //      canUndo / canRedo, so Undo/Redo toolbar buttons need a
    //      final notify to reflect the new state.
    //   2. CREATE_SHAPE / CREATE_EDGE path: `maybeRevertModeAfterCreate`
    //      enqueues a `SET_MODE` event on the xstate actor while
    //      still inside an `actor.on("*")` handler. xstate v5
    //      drains the queue before the outer `actor.send` returns;
    //      `commit` runs AFTER that outer send, so the `mode`
    //      getter here already shows the freshly-applied "select".
    //      The intermediate notify from inside `applyCreate` reads
    //      the pre-drain mode; this final notify gives subscribers
    //      the correct value.
    this.ref.notify();
  }

  cancel(): void {
    this.ref.groupMoveOrigin = null;
    this.ref.groupResizeOrigin = null;
    if (!this.ref.gestureTx) return;
    this.ref.gestureTx.cancel();
    this.ref.gestureTx = null;
  }

  /**
   * Defensive cleanup invoked by public commands (paste, etc.)
   * that open their own history transaction. A real gesture-in-
   * flight gets committed (preserving user work); a stale tx that
   * survived an earlier exception gets cancelled. Either way the
   * next `transaction()` call lands on a clean slot, so pressing
   * Cmd+V mid-drag doesn't throw "A transaction is already open".
   */
  finalize(): void {
    if (!this.ref.gestureTx) return;
    try {
      this.ref.gestureTx.commit();
    } catch {
      this.ref.gestureTx.cancel();
    }
    this.ref.gestureTx = null;
  }

  /**
   * Internal hook — called from `applyCreate` / `applyCreateEdge`
   * after a successful shape / edge instantiation. Reverts the
   * active mode to `select` unless `toolLocked` is on.
   */
  maybeRevertModeAfterCreate(): void {
    if (this.ref.toolLocked) return;
    if (this.ref.mode === "select" || this.ref.mode === "hand") return;
    this.ref.setMode("select");
  }
}
