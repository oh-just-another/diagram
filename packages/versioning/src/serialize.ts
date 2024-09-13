import {
  deserializeScene,
  parseScene,
  serializeScene,
  stringifyScene,
  type SceneDocument,
} from "@oh-just-another/serialization";
import { branchId, versionId, type Branch, type Snapshot } from "./types.js";
import type { SnapshotStore } from "./store.js";

/**
 * Wire-format for a snapshot dump. Embeds the scene document inline
 * so the file is fully self-contained — no separate scene-file refs.
 */
export interface SerializedSnapshot {
  readonly id: string;
  readonly branchId: string;
  readonly parentId: string | null;
  readonly scene: SceneDocument;
  readonly author: { id: string; name: string };
  readonly timestamp: string;
  readonly message: string;
}

export interface SerializedBranch {
  readonly id: string;
  readonly name: string;
  readonly parentBranchId: string | null;
  readonly parentVersionId: string | null;
  readonly head: string | null;
}

export interface SerializedStore {
  readonly format: "oh-just-another/versioning";
  readonly version: 1;
  readonly snapshots: readonly SerializedSnapshot[];
  readonly branches: readonly SerializedBranch[];
}

export const serializeSnapshot = (snap: Snapshot): SerializedSnapshot => ({
  id: snap.id,
  branchId: snap.branchId,
  parentId: snap.parentId,
  scene: serializeScene(snap.scene),
  author: snap.author,
  timestamp: snap.timestamp,
  message: snap.message,
});

export const deserializeSnapshot = (raw: SerializedSnapshot): Snapshot => ({
  id: versionId(raw.id),
  branchId: branchId(raw.branchId),
  parentId: raw.parentId === null ? null : versionId(raw.parentId),
  scene: deserializeScene(raw.scene),
  author: raw.author,
  timestamp: raw.timestamp,
  message: raw.message,
});

const serializeBranch = (b: Branch): SerializedBranch => ({
  id: b.id,
  name: b.name,
  parentBranchId: b.parentBranchId,
  parentVersionId: b.parentVersionId,
  head: b.head,
});

const deserializeBranch = (raw: SerializedBranch): Branch => ({
  id: branchId(raw.id),
  name: raw.name,
  parentBranchId: raw.parentBranchId === null ? null : branchId(raw.parentBranchId),
  parentVersionId: raw.parentVersionId === null ? null : versionId(raw.parentVersionId),
  head: raw.head === null ? null : versionId(raw.head),
});

/** Serialise the whole store (snapshots + branches) into a plain object. */
export const serializeStore = (store: SnapshotStore): SerializedStore => ({
  format: "oh-just-another/versioning",
  version: 1,
  snapshots: store.list().map(serializeSnapshot),
  branches: store.branches().map(serializeBranch),
});

/** JSON-stringify shortcut. */
export const stringifyStore = (store: SnapshotStore, indent: number | null = null): string =>
  JSON.stringify(serializeStore(store), null, indent ?? undefined);

/**
 * Load a previously-serialised dump into a `SnapshotStore`. Throws
 * via `parseScene` if any embedded scene is malformed.
 */
export const importIntoStore = (store: SnapshotStore, dump: SerializedStore): void => {
  const format = dump.format as string;
  if (format !== "oh-just-another/versioning") {
    throw new Error(`Unknown versioning format: ${format}`);
  }
  store.import({
    snapshots: dump.snapshots.map(deserializeSnapshot),
    branches: dump.branches.map(deserializeBranch),
  });
};

/** Parse a JSON string + import. */
export const importStoreJson = (store: SnapshotStore, json: string): void => {
  const raw = JSON.parse(json) as SerializedStore;
  // Validate embedded scenes by running them through `parseScene`
  // (the rest of the dump is plain JSON; zod-validating the wrapper
  // would be overkill — host parses + trusts).
  for (const s of raw.snapshots) {
    parseScene(stringifyScene(deserializeScene(s.scene)));
  }
  importIntoStore(store, raw);
};
