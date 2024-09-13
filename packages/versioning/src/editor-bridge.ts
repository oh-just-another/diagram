import type { Scene } from "@oh-just-another/scene";
import { type SnapshotStore } from "./store.js";
import type { Snapshot, VersionId } from "./types.js";

/**
 * Minimal slice of the `Editor` interface this package needs. Hosts pass
 * their `Editor` instance — the bridge stays decoupled from `@state`,
 * preserving the layered dependency graph (`@versioning` → `@scene` only).
 */
export interface EditorLike {
  readonly scene: Scene;
  loadScene(scene: Scene, options?: { preserveHistory?: boolean }): void;
}

export interface CaptureOptions {
  readonly message: string;
  readonly author: { id: string; name: string };
}

/**
 * Read the editor's current scene, push a new snapshot into the store on the
 * current branch, and return the snapshot.
 */
export const captureFromEditor = (
  store: SnapshotStore,
  editor: EditorLike,
  options: CaptureOptions,
): Snapshot =>
  store.capture({
    scene: editor.scene,
    author: options.author,
    message: options.message,
  });

/**
 * Restore a snapshot into the editor. Clears local history by default — the
 * snapshot is treated as a new starting point. Pass `{ preserveHistory: true }`
 * to keep the existing undo stack (for collab-style restore where remote peers
 * should not lose their local history).
 */
export const restoreSnapshot = (
  store: SnapshotStore,
  editor: EditorLike,
  versionId: VersionId,
  options: { preserveHistory?: boolean } = {},
): boolean => {
  const snap = store.get(versionId);
  if (!snap) return false;
  editor.loadScene(snap.scene, { preserveHistory: options.preserveHistory ?? false });
  return true;
};
