import type * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { Vec2 } from "@oh-just-another/types";

/**
 * Identity + presence payload broadcast to every peer in the room.
 * Hosts read the live peer list via `getPeers()` / `onPeers()` and render
 * cursors / selection halos / "Alice is editing" badges from it.
 *
 * Element is open — hosts can stash whatever extra fields they want via
 * `updateLocal({ avatarUrl: ..., currentTool: ... })`. The kernel only
 * reads the typed fields below.
 */
export interface Peer {
  readonly clientId: number;
  readonly user: PeerUser;
  readonly cursor?: Vec2;
  readonly selection?: readonly string[];
  /** Free-form host extensions. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface PeerUser {
  readonly id: string;
  readonly name: string;
  /** CSS colour. Used for cursors / selection halos. */
  readonly color: string;
}

/**
 * Thin wrapper around `y-protocols/awareness`. One per `Y.Doc` (you can
 * pass the same instance to multiple transports).
 *
 * The wrapper:
 *   - parses raw awareness states into typed `Peer[]`,
 *   - normalises self vs others (`getOthers()` filters out the local id),
 *   - exposes a subscribe-style listener so React hooks can dedupe re-renders.
 */
export class CollabAwareness {
  readonly awareness: Awareness;
  private readonly listeners = new Set<(peers: readonly Peer[]) => void>();

  constructor(doc: Y.Doc) {
    this.awareness = new Awareness(doc);
    this.awareness.on("change", this.onAwarenessChange);
  }

  /** Local peer's `clientId`. Stable for the lifetime of the awareness. */
  get clientId(): number {
    return this.awareness.clientID;
  }

  /** Write (or update) the local peer's payload. */
  updateLocal(payload: {
    user?: PeerUser;
    cursor?: Vec2 | null;
    selection?: readonly string[] | null;
    extra?: Readonly<Record<string, unknown>>;
  }): void {
    const current = this.awareness.getLocalState() as Partial<Peer> | null;
    const next: Record<string, unknown> = { ...(current ?? {}) };
    if (payload.user !== undefined) next.user = payload.user;
    if ("cursor" in payload) {
      if (payload.cursor === null) delete next.cursor;
      else next.cursor = payload.cursor;
    }
    if ("selection" in payload) {
      if (payload.selection === null) delete next.selection;
      else next.selection = payload.selection;
    }
    if (payload.extra !== undefined) next.extra = payload.extra;
    this.awareness.setLocalState(next);
  }

  /** Every connected peer, including the local one. */
  getPeers(): readonly Peer[] {
    const out: Peer[] = [];
    for (const [clientId, state] of this.awareness.getStates()) {
      const peer = this.toPeer(clientId, state);
      if (peer) out.push(peer);
    }
    return out;
  }

  /** Every connected peer **except** the local one. */
  getOthers(): readonly Peer[] {
    return this.getPeers().filter((p) => p.clientId !== this.clientId);
  }

  /** Subscribe to peer-list changes. Returns an unsubscribe function. */
  onPeers(listener: (peers: readonly Peer[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Release resources. The underlying `Awareness` is destroyed. */
  destroy(): void {
    this.awareness.off("change", this.onAwarenessChange);
    this.awareness.destroy();
    this.listeners.clear();
  }

  private readonly onAwarenessChange = (): void => {
    const peers = this.getPeers();
    for (const l of this.listeners) l(peers);
  };

  private toPeer(clientId: number, state: unknown): Peer | null {
    if (!state || typeof state !== "object") return null;
    const s = state as Partial<Peer>;
    if (!s.user?.id || !s.user.name || !s.user.color) return null;
    return {
      clientId,
      user: s.user,
      ...(s.cursor !== undefined ? { cursor: s.cursor } : {}),
      ...(s.selection !== undefined ? { selection: s.selection } : {}),
      ...(s.extra !== undefined ? { extra: s.extra } : {}),
    };
  }
}
