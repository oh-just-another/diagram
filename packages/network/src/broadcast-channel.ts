import type { Transport } from "./transport.js";

/**
 * `Transport` over the browser's [`BroadcastChannel`](https://developer.mozilla.org/en-US/Web/API/BroadcastChannel)
 * API. Connects every tab / iframe / worker on the same origin that
 * opens a channel with the same `name`.
 *
 * Use for:
 *  - "Open this URL in another tab to see your peer" demo flows.
 *  - Cross-window editor coordination (multiple editor instances on the
 *   same page sharing a single Y.Doc).
 *
 * Doesn't replicate to other machines — that's the WebSocket transport's
 * job.
 */
export class BroadcastChannelTransport implements Transport {
  private channel: BroadcastChannel | null;
  private readonly handlers = new Set<(payload: Uint8Array) => void>();

  constructor(name: string) {
    this.channel = new BroadcastChannel(name);
    this.channel.addEventListener("message", this.onNativeMessage);
  }

  send(payload: Uint8Array): void {
    if (!this.channel) return;
    // postMessage clones structured data — pass the buffer directly so
    // receivers see a fresh Uint8Array on the other side.
    this.channel.postMessage(payload);
  }

  onMessage(handler: (payload: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    if (!this.channel) return;
    this.channel.removeEventListener("message", this.onNativeMessage);
    this.channel.close();
    this.channel = null;
    this.handlers.clear();
  }

  // Bound so we can remove the listener cleanly.
  private readonly onNativeMessage = (ev: MessageEvent<unknown>): void => {
    const payload = toUint8Array(ev.data);
    if (!payload) {
      console.warn(
        "[BroadcastChannelTransport] dropped inbound message — unsupported payload type",
        Object.prototype.toString.call(ev.data),
        ev.data,
      );
      return;
    }
    for (const h of this.handlers) h(payload);
  };
}

/**
 * `instanceof Uint8Array` returns `false` across realms — BroadcastChannel
 * delivers structured-cloned data whose prototype lives in the *sender's*
 * realm, not the receiver's. Detect typed arrays by their internal tag
 * via `Object.prototype.toString.call` instead.
 */
const toUint8Array = (data: unknown): Uint8Array | null => {
  if (data === null || data === undefined) return null;
  const tag = Object.prototype.toString.call(data);
  if (tag === "[object Uint8Array]") {
    const view = data as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (tag === "[object ArrayBuffer]") return new Uint8Array(data as ArrayBuffer);
  return null;
};
