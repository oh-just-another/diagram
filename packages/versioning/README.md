# @oh-just-another/versioning

[![npm version](https://img.shields.io/npm/v/@oh-just-another/versioning.svg)](https://www.npmjs.com/package/@oh-just-another/versioning)

L3 snapshot history + branch tree + diff/merge utilities for diagram scenes. Depends on `@oh-just-another/types`, `@oh-just-another/scene` and `@oh-just-another/serialization`.

A `SnapshotStore` is the system-of-record for a git-like version tree: every snapshot is an immutable copy of a `Scene` with author / timestamp / message, branches fork from any snapshot, and three-way merge resolves divergent heads.

## Install

```bash
pnpm add @oh-just-another/versioning
```

## Usage

```ts
import {
  SnapshotStore,
  diffScenes,
  isEmptyDiff,
  serializeStore,
} from "@oh-just-another/versioning";

const store = new SnapshotStore(); // starts on the "main" branch

const v1 = store.capture({ scene, author: { id: "u1", name: "Ada" }, message: "init" });
const feature = store.branch({ name: "feature", fromVersion: v1.id });

const diff = diffScenes(sceneA, sceneB);
if (!isEmptyDiff(diff)) console.log(diff.elements.added);

const json = serializeStore(store); // persist via the host's storage of choice
```

## API surface

| Area          | Highlights                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Store         | `SnapshotStore` (capture / branch / restore / listeners), `CaptureRequest`, `BranchRequest`.                              |
| Types         | `Snapshot`, `Branch`, branded `VersionId` / `BranchId` (+ `versionId()` / `branchId()`), `DEFAULT_BRANCH_ID`.             |
| Diff          | `diffScenes`, `isEmptyDiff`, `SceneDiff`, `DiffCategory`.                                                                 |
| Merge         | `findCommonAncestor`, `threeWayMerge`, `mergeBranchHeads`, `resolveConflict`, `Conflict` / `MergeReport` types.           |
| Editor bridge | `captureFromEditor`, `restoreSnapshot`, `EditorLike`, `CaptureOptions`.                                                   |
| Serialization | `serializeStore` / `stringifyStore` / `importStoreJson` / `importIntoStore`, `serializeSnapshot` / `deserializeSnapshot`. |
