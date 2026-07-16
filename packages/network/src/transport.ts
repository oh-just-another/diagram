/**
 * Backend-neutral binary transport for exchanging update / awareness messages
 * between peers. The interface is intentionally minimal and backend-agnostic —
 * it carries raw `Uint8Array` payloads and speaks no particular wire protocol.
 */

/**
 * Connection lifecycle a transport MAY expose (see
 * {@link Transport.onStatusChange}). Mirrors `WebSocketStatus`; transports
 * without a connection concept (BroadcastChannel) simply never report.
 */
export type TransportStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface Transport {
  /** Send a binary payload to all connected peers. */
  send(payload: Uint8Array): void;
  /**
   * Subscribe to inbound payloads. Returns an unsubscribe function.
   * Subscriptions are independent — a transport may have many.
   */
  onMessage(handler: (payload: Uint8Array) => void): () => void;
  /**
   * Optional: subscribe to connection-status transitions. Transports that
   * can drop and redial (WebSocket) expose this so protocol layers can
   * re-synchronize after a reconnect — frames sent into a dying socket are
   * silently lost, so state must be re-requested when the link returns.
   * Fires synchronously with the current status on subscribe; returns an
   * unsubscribe function.
   */
  onStatusChange?(handler: (status: TransportStatus) => void): () => void;
  /** Release every resource held by this transport. Idempotent. */
  close(): void;
}
