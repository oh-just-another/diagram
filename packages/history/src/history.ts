import { batch, invert, isNoop, type Patch } from "@oh-just-another/scene";
import { mergeByEntity } from "./merge.js";
import type { HistoryProvider } from "./provider.js";

export interface HistoryOptions {
  /**
   * Cap the number of undo records. The oldest record is dropped when the
   * limit is exceeded. `Infinity` (the default) keeps everything.
   */
  readonly limit?: number;
  /**
   * When committing a transaction with multiple patches, collapse them per
   * entity so each undo step is one operation per touched entity. Default: true.
   */
  readonly mergeTransactions?: boolean;
}

/**
 * Linear undo/redo stack over `@oh-just-another/scene` patches.
 *
 * The history owns no scene; callers supply patches via `push(...)` and apply
 * the returned patches from `undo()` / `redo()` themselves. Multiple operations
 * can be grouped into one logical step via `transaction()`.
 *
 * The redo stack is cleared on any non-undo `push`.
 */
export class History implements HistoryProvider {
  private readonly past: Patch[] = [];
  private readonly future: Patch[] = [];
  private readonly limit: number;
  private readonly mergeTransactions: boolean;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? Infinity;
    this.mergeTransactions = options.mergeTransactions ?? true;
  }

  /** Push a single patch. Clears the redo stack. No-ops are ignored. */
  push(patch: Patch): void {
    if (isNoop(patch)) return;
    this.past.push(patch);
    this.future.length = 0;
    this.trim();
  }

  /**
   * Returns the inverse patch the caller should apply to scene, or `null` if
   * there is nothing to undo. The popped patch moves onto the redo stack so
   * `redo()` can replay it.
   */
  undo(): Patch | null {
    const patch = this.past.pop();
    if (!patch) return null;
    this.future.push(patch);
    return invert(patch);
  }

  /**
   * Returns the patch to re-apply, or `null` if there is nothing to redo.
   * The patch moves back onto the undo stack.
   */
  redo(): Patch | null {
    const patch = this.future.pop();
    if (!patch) return null;
    this.past.push(patch);
    return patch;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get size(): number {
    return this.past.length;
  }
  get redoSize(): number {
    return this.future.length;
  }

  /** Read-only view of the undo stack, oldest first. */
  get undoStack(): readonly Patch[] {
    return this.past;
  }
  /** Read-only view of the redo stack — the most-recently undone is **last**. */
  get redoStack(): readonly Patch[] {
    return this.future;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }

  /**
   * Open a transaction: subsequent patches are collected and pushed as a
   * single `batch` record (optionally merged per entity). The returned
   * `commit` / `cancel` close it.
   *
   * Only one transaction can be open at a time; calling `transaction()` while
   * another is open throws.
   */
  transaction(): TransactionHandle {
    if (this.current !== null) {
      throw new Error("A transaction is already open");
    }
    const tx: Patch[] = [];
    this.current = tx;
    return {
      add: (patch: Patch) => {
        if (this.current !== tx) {
          throw new Error("Transaction is no longer open");
        }
        if (!isNoop(patch)) tx.push(patch);
      },
      commit: () => {
        if (this.current !== tx) return;
        this.current = null;
        if (tx.length === 0) return;
        const collapsed = this.mergeTransactions ? mergeByEntity(tx) : tx;
        if (collapsed.length === 0) return;
        const firstCollapsed = collapsed[0];
        const record =
          collapsed.length === 1 && firstCollapsed !== undefined
            ? firstCollapsed
            : batch(collapsed);
        if (isNoop(record)) return;
        this.past.push(record);
        this.future.length = 0;
        this.trim();
      },
      cancel: () => {
        if (this.current !== tx) return;
        this.current = null;
      },
      isOpen: () => this.current === tx,
    };
  }

  /** True while a transaction is open. */
  hasOpenTransaction(): boolean {
    return this.current !== null;
  }

  /**
   * Add a patch to the currently-open transaction, or `push` directly if no
   * transaction is open.
   */
  record(patch: Patch, options?: { transaction?: TransactionHandle }): void {
    if (options?.transaction?.isOpen()) {
      options.transaction.add(patch);
      return;
    }
    this.push(patch);
  }

  private current: Patch[] | null = null;

  private trim(): void {
    if (!Number.isFinite(this.limit)) return;
    while (this.past.length > this.limit) this.past.shift();
  }
}

/** Handle to an open transaction. Returned by `History.transaction()`. */
export interface TransactionHandle {
  /** Add a patch to the transaction. Throws if the transaction has closed. */
  add(patch: Patch): void;
  /** Commit the transaction: push the (merged) batch onto the undo stack. */
  commit(): void;
  /** Discard the transaction without recording anything. */
  cancel(): void;
  /** True until `commit()` or `cancel()` is called. */
  isOpen(): boolean;
}
