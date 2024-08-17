import type * as Y from "yjs";
import type { Editor } from "@oh-just-another/state";
import type { Scene } from "@oh-just-another/scene";
import { SceneDoc } from "./scene-doc.js";

/**
 * Wire an `Editor` to a `SceneDoc` (or raw `Y.Doc`) so that local changes
 * propagate to the CRDT and remote CRDT changes feed back into the
 * editor.
 *
 * MVP scope:
 *   - **Local → CRDT** via `editor.subscribe` + `applyDelta` (cheap
 *     per-shape ops in a single Yjs transaction).
 *   - **CRDT → Local** via a single `Y.Doc.on("update")` listener that
 *     calls `editor.loadScene(sceneDoc.snapshot())`. This resets undo /
 *     redo on remote updates — fine for collab where local-history
 *     semantics are anyway tricky. Switching to a `Y.UndoManager`-backed
 *     pipeline is a follow-up.
 *
 * Self-origin updates (caused by the very subscriber that's running) are
 * tagged so we don't apply our own change twice. Without it the editor
 * would flicker through `loadScene` on every keystroke.
 *
 * Returns an unbind function.
 */
export const bindEditor = (editor: Editor, source: SceneDoc | Y.Doc): (() => void) => {
  const sceneDoc = source instanceof SceneDoc ? source : new SceneDoc(source);
  const origin = Symbol("editor-binding");

  // Initial sync: if the CRDT is empty (e.g. fresh room), seed it with the
  // editor's current scene. Otherwise replace the editor's local scene with
  // the room's state — joiners adopt what's already there.
  const initial = sceneDoc.snapshot();
  if (initial.shapes.size === 0 && initial.edges.size === 0 && initial.layers.size === 0) {
    sceneDoc.replace(editor.scene, origin);
  } else {
    editor.loadScene(initial);
  }

  let lastSyncedScene: Scene = editor.scene;

  // Local change → CRDT.
  const unsubscribeLocal = editor.subscribe(() => {
    if (editor.scene === lastSyncedScene) return;
    sceneDoc.applyDelta(lastSyncedScene, editor.scene, origin);
    lastSyncedScene = editor.scene;
  });

  // CRDT change → local. Filter out our own updates by transaction origin.
  const onUpdate = (_update: Uint8Array, originOfUpdate: unknown): void => {
    if (originOfUpdate === origin) return;
    const snapshot = sceneDoc.snapshot();
    editor.loadScene(snapshot);
    lastSyncedScene = editor.scene;
  };
  sceneDoc.doc.on("update", onUpdate);

  return () => {
    unsubscribeLocal();
    sceneDoc.doc.off("update", onUpdate);
  };
};
