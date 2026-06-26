import { createListeners } from "@oh-just-another/events";
import type { Scene } from "@oh-just-another/scene";
import {
  branchId as castBranchId,
  versionId as castVersionId,
  DEFAULT_BRANCH_ID,
  type Branch,
  type BranchId,
  type Snapshot,
  type VersionId,
} from "./types.js";

/**
 * Input to `SnapshotStore.capture` — everything the caller knows.
 * Store generates `id`, `parentId` (from branch head), `timestamp`.
 */
export interface CaptureRequest {
  readonly scene: Scene;
  readonly author: { id: string; name: string };
  readonly message: string;
  /** Defaults to the store's current branch. */
  readonly branchId?: BranchId;
}

export interface BranchRequest {
  readonly name: string;
  readonly fromVersion: VersionId;
  /** Override the auto-generated id (useful for tests). */
  readonly id?: BranchId;
}

/**
 * In-memory snapshot store. The store is the system-of-record for the
 * version tree; hosts that want persistence wrap `export()` / `import()`
 * with their own storage (localStorage, IndexedDB, server API).
 *
 * Branch model: the "main" branch is created on construction. Any
 * snapshot can be the basis for a new branch via `branch({ fromVersion,
 * name })`; the new branch's first capture chains back to the source
 * snapshot via `Branch.parentVersionId`.
 *
 * Listeners observe both `capture` and `branch` events so UIs (tree
 * view) re-render without polling.
 */
export class SnapshotStore {
  private readonly snapshots = new Map<VersionId, Snapshot>();
  private readonly branchesMap = new Map<BranchId, Branch>();
  private readonly listeners = createListeners();
  private idCounter = 0;
  private _currentBranchId: BranchId;

  constructor() {
    const main: Branch = {
      id: DEFAULT_BRANCH_ID,
      name: "main",
      parentBranchId: null,
      parentVersionId: null,
      head: null,
    };
    this.branchesMap.set(main.id, main);
    this._currentBranchId = main.id;
  }

  /** Active branch — new captures land here unless overridden. */
  get currentBranchId(): BranchId {
    return this._currentBranchId;
  }

  /**
   * Switch the active branch. Throws if the branch is unknown. Does
   * not mutate snapshots — only changes which branch new captures
   * append to.
   */
  setCurrentBranch(id: BranchId): void {
    if (!this.branchesMap.has(id)) {
      throw new Error(`Unknown branch: ${id}`);
    }
    if (this._currentBranchId === id) return;
    this._currentBranchId = id;
    this.notify();
  }

  /**
   * Capture a new snapshot. `parentId` is set to the target branch's
   * current head; the new snapshot becomes the branch's new head.
   */
  capture(req: CaptureRequest): Snapshot {
    const targetBranchId = req.branchId ?? this._currentBranchId;
    const branch = this.branchesMap.get(targetBranchId);
    if (!branch) throw new Error(`Unknown branch: ${targetBranchId}`);
    const snapshot: Snapshot = {
      id: castVersionId(this.uniqueId("v")),
      branchId: targetBranchId,
      parentId: branch.head,
      scene: req.scene,
      author: req.author,
      message: req.message,
      timestamp: new Date().toISOString(),
    };
    this.snapshots.set(snapshot.id, snapshot);
    this.branchesMap.set(targetBranchId, { ...branch, head: snapshot.id });
    this.notify();
    return snapshot;
  }

  /**
   * Create a new branch rooted at an existing snapshot. The branch
   * starts empty (no captures yet); its `parentVersionId` records
   * the divergence point so UIs can render the tree.
   */
  branch(req: BranchRequest): Branch {
    const parent = this.snapshots.get(req.fromVersion);
    if (!parent) throw new Error(`Unknown source snapshot: ${req.fromVersion}`);
    const id = req.id ?? castBranchId(this.uniqueId("br"));
    if (this.branchesMap.has(id)) {
      throw new Error(`Branch already exists: ${id}`);
    }
    const next: Branch = {
      id,
      name: req.name,
      parentBranchId: parent.branchId,
      parentVersionId: req.fromVersion,
      head: null,
    };
    this.branchesMap.set(id, next);
    this.notify();
    return next;
  }

  /** Look up a snapshot by id. */
  get(id: VersionId): Snapshot | undefined {
    return this.snapshots.get(id);
  }

  /** All snapshots, in insertion order. */
  list(): readonly Snapshot[] {
    return [...this.snapshots.values()];
  }

  /**
   * Snapshots on a specific branch, ordered ancestor → descendant.
   * Walks parent links from `branch.head` back to the branch root
   * (snapshot whose `parentId` belongs to a different branch).
   */
  listBranch(id: BranchId): readonly Snapshot[] {
    const branch = this.branchesMap.get(id);
    if (branch?.head === undefined || branch.head === null) return [];
    const out: Snapshot[] = [];
    let cursor: VersionId | null = branch.head;
    while (cursor !== null) {
      const snap = this.snapshots.get(cursor);
      if (snap?.branchId !== id) break;
      out.push(snap);
      cursor = snap.parentId;
    }
    return out.reverse();
  }

  /** All branches, in insertion order. */
  branches(): readonly Branch[] {
    return [...this.branchesMap.values()];
  }

  /**
   * Replace store state from a serialised dump. Wipes any existing
   * snapshots / branches. Used by hosts implementing persistence.
   */
  import(dump: {
    readonly snapshots: readonly Snapshot[];
    readonly branches: readonly Branch[];
  }): void {
    this.snapshots.clear();
    this.branchesMap.clear();
    for (const b of dump.branches) this.branchesMap.set(b.id, b);
    if (!this.branchesMap.has(DEFAULT_BRANCH_ID)) {
      this.branchesMap.set(DEFAULT_BRANCH_ID, {
        id: DEFAULT_BRANCH_ID,
        name: "main",
        parentBranchId: null,
        parentVersionId: null,
        head: null,
      });
    }
    for (const s of dump.snapshots) this.snapshots.set(s.id, s);
    this._currentBranchId = DEFAULT_BRANCH_ID;
    this.notify();
  }

  /** Snapshot the store's state for persistence. */
  export(): { snapshots: readonly Snapshot[]; branches: readonly Branch[] } {
    return { snapshots: this.list(), branches: this.branches() };
  }

  /**
   * Subscribe to capture / branch / setCurrentBranch / import events.
   * Returns an unsubscribe fn.
   */
  subscribe(fn: () => void): () => void {
    return this.listeners.add(fn);
  }

  private notify(): void {
    this.listeners.emit();
  }

  private uniqueId(prefix: string): string {
    return `${prefix}-${++this.idCounter}-${Date.now().toString(36)}`;
  }
}
