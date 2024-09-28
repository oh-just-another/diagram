export {
  type VersionId,
  type BranchId,
  type Snapshot,
  type Branch,
  versionId,
  branchId,
  DEFAULT_BRANCH_ID,
} from "./types.js";
export { SnapshotStore, type CaptureRequest, type BranchRequest } from "./store.js";
export { diffScenes, isEmptyDiff, type SceneDiff, type DiffCategory } from "./diff.js";
export {
  captureFromEditor,
  restoreSnapshot,
  type EditorLike,
  type CaptureOptions,
} from "./editor-bridge.js";
export {
  serializeSnapshot,
  deserializeSnapshot,
  serializeStore,
  stringifyStore,
  importIntoStore,
  importStoreJson,
  type SerializedSnapshot,
  type SerializedBranch,
  type SerializedStore,
} from "./serialize.js";
export {
  findCommonAncestor,
  threeWayMerge,
  resolveConflict,
  mergeBranchHeads,
  type Conflict,
  type SceneConflict,
  type MergeReport,
  type ConflictResolution,
} from "./merge.js";
