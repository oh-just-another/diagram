import { createListeners } from "@oh-just-another/events";

import type { Transport } from "./transport.js";

/**
 * `Transport` backed by a single `WebSocket` connection. Suitable for
 * point-to-point connections to a y-websocket (or compatible) server.
 *
 * The wrapper handles:
 *   - lazy connection — `send`s issued before the socket opens are buffered
 *     and flushed on `open`
 *   - reconnect on transient errors (exponential backoff, capped at 30 s)
 *   - clean shutdown on `close()` (no further auto-reconnect)
 *
 * It does **not** implement any wire protocol — payloads are forwarded as
 * raw `Uint8Array`. Pair with `y-websocket`'s server or compatible.
 */
export interface WebSocketTransportOptions {
  /** Override the global `WebSocket` constructor (e.g. for tests / Node). */
  readonly webSocketImpl?: typeof globalThis.WebSocket;
  /** Initial reconnect delay in ms. Default 500. */
  readonly initialReconnectDelay?: number;
  /** Max reconnect delay in ms. Default 30 000. */
  readonly maxReconnectDelay?: number;
}

/**
 * Lifecycle states for the WebSocket connection. Hosts subscribe via
 * `onStatusChange` to drive UI badges ("connected", "reconnecting"...).
 *
 *   - `connecting` — initial dial in progress, or after a transient drop
 *   - `open` — socket is up, buffered frames have flushed
 *   - `reconnecting` — back-off timer is running before next dial
 *   - `closed` — `close()` has been called; no further attempts
 */
export type WebSocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export class WebSocketTransport implements Transport {
  private readonly url: string;
  private readonly listeners = createListeners<Uint8Array>();
  private readonly statusHandlers = new Set<(status: WebSocketStatus) => void>();
  private readonly buffer: Uint8Array[] = [];
  private readonly webSocketImpl: typeof globalThis.WebSocket;
  private readonly initialDelay: number;
  private readonly maxDelay: number;

  private socket: WebSocket | null = null;
  private closed = false;
  private reconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: WebSocketStatus = "connecting";

  constructor(url: string, options: WebSocketTransportOptions = {}) {
    this.url = url;
    this.webSocketImpl = options.webSocketImpl ?? globalThis.WebSocket;
    this.initialDelay = options.initialReconnectDelay ?? 500;
    this.maxDelay = options.maxReconnectDelay ?? 30_000;
    this.reconnectDelay = this.initialDelay;
    if (typeof this.webSocketImpl !== "function") {
      throw new Error(
        "WebSocketTransport: no global WebSocket available — pass `webSocketImpl` in options.",
      );
    }
    this.connect();
  }

  send(payload: Uint8Array): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else {
      this.buffer.push(payload);
    }
  }

  onMessage(handler: (payload: Uint8Array) => void): () => void {
    return this.listeners.add(handler);
  }

  /** Current lifecycle state. Updates fire via `onStatusChange`. */
  get status(): WebSocketStatus {
    return this._status;
  }

  /**
   * Subscribe to status transitions. Fires synchronously with the
   * current value on subscribe so the caller doesn't miss the first
   * `open`. Returns an unsubscribe function.
   */
  onStatusChange(handler: (status: WebSocketStatus) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this._status);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(next: WebSocketStatus): void {
    if (this._status === next) return;
    this._status = next;
    for (const h of this.statusHandlers) h(next);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus("closed");
    this.listeners.clear();
    this.statusHandlers.clear();
    this.buffer.length = 0;
  }

  private connect(): void {
    if (this.closed) return;
    this.setStatus("connecting");
    const sock = new this.webSocketImpl(this.url);
    sock.binaryType = "arraybuffer";

    sock.addEventListener("open", () => {
      this.reconnectDelay = this.initialDelay;
      let next = this.buffer.shift();
      while (next !== undefined) {
        sock.send(next);
        next = this.buffer.shift();
      }
      this.setStatus("open");
    });

    sock.addEventListener("message", (ev: MessageEvent<unknown>) => {
      let payload: Uint8Array | null = null;
      const data = ev.data;
      if (data instanceof ArrayBuffer) payload = new Uint8Array(data);
      else if (data instanceof Uint8Array) payload = data;
      if (!payload) return;
      this.listeners.emit(payload);
    });

    const onTerminated = () => {
      if (this.socket !== sock) return; // a newer connection already took over
      this.socket = null;
      if (this.closed) return;
      this.scheduleReconnect();
    };
    sock.addEventListener("close", onTerminated);
    sock.addEventListener("error", onTerminated);

    this.socket = sock;
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.maxDelay, this.reconnectDelay * 2);
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
