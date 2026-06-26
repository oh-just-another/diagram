/**
 * Backend-neutral binary transport for exchanging update / awareness messages
 * between peers. The interface is intentionally minimal and backend-agnostic —
 * it carries raw `Uint8Array` payloads and speaks no particular wire protocol.
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
