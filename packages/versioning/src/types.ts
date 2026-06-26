import type { Scene } from "@oh-just-another/scene";

/**
 * Opaque identifier for a single snapshot. Caller owns uniqueness;
 * `SnapshotStore.capture` generates one if not provided.
 */
declare const versionIdBrand: unique symbol;
export type VersionId = string & { readonly [versionIdBrand]: true };
export const versionId = (raw: string): VersionId => raw as VersionId;

/**
 * Opaque identifier for a branch. Branches are first-class — every
 * snapshot carries a `branchId`, and history forms a tree rooted at
 * `DEFAULT_BRANCH_ID`. New branches are created by `branch(from)`.
 */
declare const branchIdBrand: unique symbol;
export type BranchId = string & { readonly [branchIdBrand]: true };
export const branchId = (raw: string): BranchId => raw as BranchId;

/** Default branch name — analogue of git's `main`. */
export const DEFAULT_BRANCH_ID: BranchId = branchId("main");

/**
 * A snapshot is an immutable point-in-time copy of a `Scene` plus
 * metadata (author, timestamp, message, parent link).
 */
export interface Snapshot {
  readonly id: VersionId;
  /** Branch this snapshot belongs to. */
  readonly branchId: BranchId;
  /**
   * Previous snapshot id in this branch's history. `null` for the
   * very first snapshot of a branch (which, when not the default
   * branch, points at the snapshot it was branched from via
   * `Branch.parentVersionId`).
   */
  readonly parentId: VersionId | null;
  readonly scene: Scene;
  readonly author: { id: string; name: string };
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Human-readable label. */
  readonly message: string;
}

/**
 * Branch descriptor. `head` is the latest snapshot in the branch;
 * `parentBranchId` + `parentVersionId` form the cross-branch link
 * (the point from which this branch diverged).
 */
export interface Branch {
  readonly id: BranchId;
  readonly name: string;
  readonly parentBranchId: BranchId | null;
  readonly parentVersionId: VersionId | null;
  readonly head: VersionId | null;
}
