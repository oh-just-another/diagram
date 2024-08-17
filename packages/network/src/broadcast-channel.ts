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
  const data = ev.data;
  let payload: Uint8Array | null = null;
  if (data instanceof Uint8Array) payload = data;
  else if (data instanceof ArrayBuffer) payload = new Uint8Array(data);
  if (!payload) return;
  for (const h of this.handlers) h(payload);
 };
}
