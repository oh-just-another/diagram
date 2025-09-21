import type { Bounds, ElementId } from "@oh-just-another/types";
import { getShape, getShapeWorldBounds } from "@oh-just-another/scene";
import {
  PEER_CURSOR_BROADCAST_INTERVAL_MS,
  type Editor,
  type PeerCursor,
  type PeerSelection,
} from "@oh-just-another/state";
import type { CollabAwareness, Peer, PeerUser } from "./awareness.js";

export interface BindAwarenessOptions {
  /**
   * Local user identity broadcast to peers (name + colour shown on
   * their screen). Stable for the lifetime of the binding.
   */
  readonly user: PeerUser;
  /**
   * Throttle in ms for the local cursor broadcast. Defaults to
   * `PEER_CURSOR_BROADCAST_INTERVAL_MS` (~30 fps). Lower → less
   * network chatter; higher than 16 → the user sees their own
   * pointer lag behind their peer's view.
   */
  readonly cursorThrottleMs?: number;
}

/**
 * Wire an `Editor` to a `CollabAwareness`:
 *
 *   - publishes the local user payload + cursor + selection into
 *     awareness, throttled so a fast drag does not flood the room;
 *   - pushes the room's other-peer cursors / selections back into the
 *     editor so the overlay paints them.
 *
 * Returns an unbind function. Clearing the editor selection or cursor
 * leaves awareness in a sane state.
 *
 * The editor exposes `onCursorMove` / `setPeerCursors` /
 * `setPeerSelections` as the extension points; `@state` knows nothing
 * about Yjs / awareness.
 */
export const bindAwareness = (
  editor: Editor,
  awareness: CollabAwareness,
  options: BindAwarenessOptions,
): (() => void) => {
  const throttle = options.cursorThrottleMs ?? PEER_CURSOR_BROADCAST_INTERVAL_MS;
  let lastBroadcastAt = 0;
  let pendingCursor: { x: number; y: number } | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Initial identity push so peers see us before our first move.
  awareness.updateLocal({ user: options.user });

  const broadcastNow = (): void => {
    if (!pendingCursor) return;
    awareness.updateLocal({ cursor: pendingCursor });
    lastBroadcastAt = Date.now();
    pendingCursor = null;
    flushTimer = null;
  };

  const unsubscribeCursor = editor.onCursorMove((point) => {
    pendingCursor = point;
    const elapsed = Date.now() - lastBroadcastAt;
    if (elapsed >= throttle) {
      broadcastNow();
    } else {
      flushTimer ??= setTimeout(broadcastNow, throttle - elapsed);
    }
  });

  // Local selection → awareness, with a side effect: any editor change
  // (selection OR scene mutation) re-resolves peer selection bounds so
  // a peer's halo follows their selected shapes as they get edited.
  let lastSelectionKey: string | null = null;
  const unsubscribeSelection = editor.subscribe(() => {
    const ids = [...editor.selection].sort();
    const key = ids.join(",");
    if (key !== lastSelectionKey) {
      lastSelectionKey = key;
      awareness.updateLocal({ selection: ids });
    }
    // Re-resolve peer selection bounds from the current scene.
    refreshPeerSelections();
  });

  // Awareness → editor. Each change recomputes both cursors and
  // selections from the room state and pushes the materialised arrays
  // to the editor (which paints them on the overlay).
  let lastPeers: readonly Peer[] = awareness.getPeers();
  const applyPeers = (peers: readonly Peer[]): void => {
    lastPeers = peers;
    const cursors: PeerCursor[] = [];
    const selections: PeerSelection[] = [];
    for (const p of peers) {
      if (p.clientId === awareness.clientId) continue;
      if (p.cursor) {
        cursors.push({
          position: p.cursor,
          color: p.user.color,
          name: p.user.name,
        });
      }
      if (p.selection && p.selection.length > 0) {
        const bounds = resolveSelectionBounds(editor, p.selection);
        if (bounds.length > 0) {
          selections.push({ color: p.user.color, bounds });
        }
      }
    }
    editor.setPeerCursors(cursors);
    editor.setPeerSelections(selections);
  };
  // Re-resolve only the selections (cursors don't depend on scene state).
  // Called when the editor scene changes — peer halos should track shape
  // movement / resize made by anyone.
  const refreshPeerSelections = (): void => {
    const selections: PeerSelection[] = [];
    for (const p of lastPeers) {
      if (p.clientId === awareness.clientId) continue;
      if (!p.selection || p.selection.length === 0) continue;
      const bounds = resolveSelectionBounds(editor, p.selection);
      if (bounds.length > 0) selections.push({ color: p.user.color, bounds });
    }
    editor.setPeerSelections(selections);
  };
  // Push current snapshot immediately so a late-binding sees existing peers.
  applyPeers(lastPeers);
  const unsubscribeAwareness = awareness.onPeers(applyPeers);

  return () => {
    unsubscribeCursor();
    unsubscribeSelection();
    unsubscribeAwareness();
    if (flushTimer !== null) clearTimeout(flushTimer);
    awareness.updateLocal({ cursor: null, selection: null });
    editor.setPeerCursors([]);
    editor.setPeerSelections([]);
  };
};

const resolveSelectionBounds = (editor: Editor, ids: readonly string[]): Bounds[] => {
  const out: Bounds[] = [];
  for (const id of ids) {
    const shape = getShape(editor.scene, id as ElementId);
    if (!shape) continue;
    out.push(getShapeWorldBounds(shape));
  }
  return out;
};
