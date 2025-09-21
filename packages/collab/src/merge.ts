import type { ElementId } from "@oh-just-another/types";
import type { Scene } from "@oh-just-another/scene";

/**
 * CRDT branch merge editor-facing API. The runtime implementation
 * lives on Y.Doc subdocs; this contract lets hosts wire UI
 * (`<MergeDialog>`) against a stable surface.
 *
 * Branch model:
 *   Each named branch = its own Y.Doc subdoc inside the parent.
 *   Snapshots inside a branch are versioned per its own history;
 *   merging a source branch into a target performs a three-way
 *   merge against their common ancestor.
 */

export interface BranchId {
  readonly id: string;
  readonly name: string;
  readonly parentVersionId: string | null;
}

export interface MergeConflict {
  readonly elementId: ElementId;
  readonly base: unknown | null;
  readonly source: unknown;
  readonly target: unknown;
}

export interface MergeReport {
  readonly applied: readonly ElementId[];
  readonly conflicts: readonly MergeConflict[];
  /**
   * The resulting scene after auto-applying non-conflicting
   * changes. Conflicts are NOT applied — the host UI resolves
   * them and produces a final scene via `applyConflictResolution`.
   */
  readonly autoMerged: Scene;
}

/**
 * Resolution choice made by the user in `<MergeDialog>`.
 *
 *   - `ours`     keep the target version of the shape.
 *   - `theirs`   keep the source version of the shape.
 *   - `both`     keep both — `theirs` lands as a duplicate with a
 *                "-copy" suffixed id. Convention not contract;
 *                hosts can supply their own id-rewriter.
 */
export type ConflictChoice = "ours" | "theirs" | "both";

export interface ConflictResolution {
  readonly elementId: ElementId;
  readonly choice: ConflictChoice;
}

/**
 * Implementation hook. The kernel does NOT ship one — collab
 * authors plug their Yjs-backed implementation into a host
 * editor instance.
 */
export interface BranchMergeAPI {
  branchToDoc(branchId: BranchId): unknown; // Y.Doc — kept loose to avoid Yjs as a peer dep here.
  mergeBranch(source: BranchId, target: BranchId): Promise<MergeReport>;
  applyConflictResolution(
    report: MergeReport,
    resolutions: readonly ConflictResolution[],
  ): Promise<Scene>;
}
