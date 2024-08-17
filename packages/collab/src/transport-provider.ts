import * as Y from "yjs";
import { applyAwarenessUpdate, encodeAwarenessUpdate, type Awareness } from "y-protocols/awareness";
import type { Transport } from "@oh-just-another/network";

/**
 * Bridge a `Y.Doc` (and optional `Awareness`) onto a `Transport`. Every
 * Yjs update is wrapped in a tiny 1-byte tag so a single channel can
 * multiplex document and awareness messages.
 *
 *   tag 0x00 → Yjs document update
 *   tag 0x01 → awareness update
 *   tag 0x02 → state-sync request (joiner asks for the current full state)
 *
 * Use:
 *
 * ```ts
 * const provider = new TransportProvider({
 *   doc,
 *   awareness: new CollabAwareness(doc).awareness,
 *   transport: new BroadcastChannelTransport("room-foo"),
 * });
 * // …later
 * provider.destroy();
 * ```
 */
const TAG_DOC = 0;
const TAG_AWARENESS = 1;
const TAG_SYNC_REQUEST = 2;

export interface TransportProviderOptions {
  readonly doc: Y.Doc;
  readonly transport: Transport;
  readonly awareness?: Awareness;
}

export class TransportProvider {
  private readonly doc: Y.Doc;
  private readonly transport: Transport;
  private readonly awareness: Awareness | null;
  private readonly origin = Symbol("transport-provider");
  private readonly unsubscribeMessage: () => void;

  constructor(options: TransportProviderOptions) {
    this.doc = options.doc;
    this.transport = options.transport;
    this.awareness = options.awareness ?? null;

    // Forward local doc updates downstream — but only ones we didn't
    // ourselves apply (avoid echo).
    this.doc.on("updateV2", this.onDocUpdate);
    if (this.awareness) {
      this.awareness.on("update", this.onAwarenessUpdate);
    }

    this.unsubscribeMessage = this.transport.onMessage(this.onInbound);

    // Ask peers for their current state on join.
    this.transport.send(new Uint8Array([TAG_SYNC_REQUEST]));
  }

  destroy(): void {
    this.doc.off("updateV2", this.onDocUpdate);
    if (this.awareness) this.awareness.off("update", this.onAwarenessUpdate);
    this.unsubscribeMessage();
  }

  // --- inbound ---

  private readonly onInbound = (payload: Uint8Array): void => {
    if (payload.length === 0) return;
    const tag = payload[0]!;
    const body = payload.subarray(1);
    switch (tag) {
      case TAG_DOC:
        Y.applyUpdateV2(this.doc, body, this.origin);
        return;
      case TAG_AWARENESS:
        if (this.awareness) applyAwarenessUpdate(this.awareness, body, this.origin);
        return;
      case TAG_SYNC_REQUEST: {
        // Reply with our full doc state + awareness so the joiner catches up.
        const docPayload = Y.encodeStateAsUpdateV2(this.doc);
        this.transport.send(prependTag(TAG_DOC, docPayload));
        if (this.awareness) {
          const clients = [...this.awareness.getStates().keys()];
          const awarenessPayload = encodeAwarenessUpdate(this.awareness, clients);
          this.transport.send(prependTag(TAG_AWARENESS, awarenessPayload));
        }
        return;
      }
      default:
        // Unknown tag — silently ignore; lets the wire format extend later.
        return;
    }
  };

  // --- outbound ---

  private readonly onDocUpdate = (update: Uint8Array, originOfUpdate: unknown): void => {
    if (originOfUpdate === this.origin) return;
    this.transport.send(prependTag(TAG_DOC, update));
  };

  private readonly onAwarenessUpdate = (
    _: { added: number[]; updated: number[]; removed: number[] },
    originOfUpdate: unknown,
  ): void => {
    if (originOfUpdate === this.origin) return;
    if (!this.awareness) return;
    const changedClients = [..._.added, ..._.updated, ..._.removed];
    const payload = encodeAwarenessUpdate(this.awareness, changedClients);
    this.transport.send(prependTag(TAG_AWARENESS, payload));
  };
}

const prependTag = (tag: number, body: Uint8Array): Uint8Array => {
  const out = new Uint8Array(body.length + 1);
  out[0] = tag;
  out.set(body, 1);
  return out;
};
