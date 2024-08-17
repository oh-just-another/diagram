/**
 * Backend-neutral binary transport used by `@oh-just-another/collab` to exchange
 * Yjs update / awareness messages between peers.
 *
 * Implementations:
 *   - **`BroadcastChannelTransport`** — same-origin browser tabs. No server.
 *   - **`WebSocketTransport`** — generic wrapper around a `WebSocket`
 *     instance. The transport doesn't speak any particular wire protocol;
 *     it just hands raw `Uint8Array` payloads to the y-websocket server.
 *
 * The interface is intentionally minimal and backend-agnostic.
 */
export interface Transport {
  /** Send a binary payload to all connected peers. */
  send(payload: Uint8Array): void;
  /**
   * Subscribe to inbound payloads. Returns an unsubscribe function.
   * Subscriptions are independent — a transport may have many.
   */
  onMessage(handler: (payload: Uint8Array) => void): () => void;
  /** Release every resource held by this transport. Idempotent. */
  close(): void;
}
