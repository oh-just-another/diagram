import type { Patch } from "@oh-just-another/scene";
import type { TransactionHandle } from "./history.js";

/**
 * Pluggable history backend. The default is the linear `History` class; hosts
 * may supply another implementation that exposes this surface.
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
   * Optional inspection hooks for UIs that visualise the undo timeline.
   * Implementations may leave them `undefined` when their stacks are not
   * representable as `Patch`es; hosts that depend on a specific stack
   * representation should narrow to the implementation they instantiate.
   */
  readonly undoStack?: readonly Patch[];
  readonly redoStack?: readonly Patch[];
}
