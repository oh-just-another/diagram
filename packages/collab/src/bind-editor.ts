import type * as Y from "yjs";
import type { Editor } from "@oh-just-another/state";
import type { Scene } from "@oh-just-another/scene";
import { SceneDoc } from "./scene-doc.js";

export interface BindEditorOptions {
  /**
   * Milliseconds to wait for a remote sync response before deciding to
   * seed the CRDT from the local scene. Defaults to 0 (no wait — the
   * connecting tab seeds immediately if the doc looks empty).
   *
   * Set this to a small value (e.g. 200 ms) in transports where peers
   * may answer asynchronously (BroadcastChannel, WebSocket). Joiners
   * will then adopt the room's existing state instead of clobbering it
   * with their own.
   */
  readonly waitForSyncMs?: number;
}

/**
 * Wire an `Editor` to a `SceneDoc` (or raw `Y.Doc`) so that local
 * changes propagate to the CRDT and remote CRDT changes feed back into
 * the editor.
 *
 * Sync handshake: when `waitForSyncMs > 0` and the CRDT looks empty
 * at bind-time, we wait that long for the first inbound update. If it
 * arrives, the editor adopts the room's state (`loadScene(snapshot)`).
 * If the timeout elapses (we're the only peer), we seed the room with
 * the editor's current scene.
 *
 * Self-origin transactions are tagged so the local subscriber doesn't
 * apply its own change twice.
 *
 * Returns an unbind function.
 */
export const bindEditor = (
  editor: Editor,
  source: SceneDoc | Y.Doc,
  options: BindEditorOptions = {},
): (() => void) => {
  const sceneDoc = source instanceof SceneDoc ? source : new SceneDoc(source);
  const origin = Symbol("editor-binding");
  const waitMs = options.waitForSyncMs ?? 0;

  let lastSyncedScene: Scene = editor.scene;
  let disposed = false;

  // Local change → CRDT.
  const unsubscribeLocal = editor.subscribe(() => {
    if (disposed) return;
    if (editor.scene === lastSyncedScene) return;
    sceneDoc.applyDelta(lastSyncedScene, editor.scene, origin);
    lastSyncedScene = editor.scene;
  });

  // CRDT change → local. Filter out self-origin updates by transaction tag.
  const onUpdate = (_update: Uint8Array, originOfUpdate: unknown): void => {
    if (disposed || originOfUpdate === origin) return;
    const snapshot = sceneDoc.snapshot();
    editor.loadScene(snapshot, { preserveHistory: true });
    lastSyncedScene = editor.scene;
  };
  sceneDoc.doc.on("update", onUpdate);

  // Initial seed vs adopt.
  const isCurrentlyEmpty = (): boolean =>
    sceneDoc.shapes.size === 0 && sceneDoc.edges.size === 0 && sceneDoc.layers.size === 0;

  const seedFromEditor = (): void => {
    if (disposed) return;
    sceneDoc.replace(editor.scene, origin);
    lastSyncedScene = editor.scene;
  };

  const adoptFromCrdt = (): void => {
    if (disposed) return;
    const snapshot = sceneDoc.snapshot();
    editor.loadScene(snapshot);
    lastSyncedScene = editor.scene;
  };

  if (!isCurrentlyEmpty()) {
    adoptFromCrdt();
  } else if (waitMs <= 0) {
    seedFromEditor();
  } else {
    // Wait briefly for a peer to answer the implicit sync request that the
    // TransportProvider sent on connect. If anything lands in the doc
    // during that window, adopt; otherwise seed.
    const timer = setTimeout(() => {
      if (disposed) return;
      if (isCurrentlyEmpty()) seedFromEditor();
      // Else: an update arrived → onUpdate already called loadScene.
    }, waitMs);

    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribeLocal();
      sceneDoc.doc.off("update", onUpdate);
    };
  }

  return () => {
    disposed = true;
    unsubscribeLocal();
    sceneDoc.doc.off("update", onUpdate);
  };
};
