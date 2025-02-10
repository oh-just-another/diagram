import type { Patch } from "@oh-just-another/scene";
import type { TransactionHandle } from "./history.js";

/**
 * Pluggable history backend. Implementations:
 *
 *   - `History` — linear stack, standalone editing.
 *   - `YjsHistory` (lives in `@collab`) — wraps `Y.UndoManager` so Cmd+Z in
 *     collab affects only the local clientID's patches, surviving concurrent
 *     remote edits.
 *
 * Hosts pass an instance via `EditorOptions.history`; default is the linear
 * `History` class. Both implementations expose this surface.
 */
export interface HistoryProvider {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  push(patch: Patch): void;
  undo(): Patch | null;
  redo(): Patch | null;
  clear(): void;
  transaction(): TransactionHandle;
  /** Number of past patches, exposed for UI counters. */
  readonly size: number;
  /**
   * Optional inspection hooks for UIs that visualise the undo timeline
   * (`<HistoryPanel>`). The linear `History` exposes both as native arrays;
   * `YjsHistory` leaves them `undefined` because `Y.UndoManager`'s `undoStack`
   * items are opaque `StackItem`s, not `Patch`es. Hosts that depend on a
   * specific stack representation should narrow to the implementation they
   * instantiate.
   */
  readonly undoStack?: readonly Patch[];
  readonly redoStack?: readonly Patch[];
}
