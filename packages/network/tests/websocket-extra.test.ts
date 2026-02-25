/**
 * Extended unit tests for WebSocketTransport.
 * Covers:
 *   - connect → open → status transitions
 *   - send before open (buffer) and after open (direct)
 *   - incoming message handling (ArrayBuffer, Uint8Array, non-binary drops)
 *   - close → reconnect with exponential backoff (fake timers)
 *   - error event → reconnect
 *   - close() during reconnect timer (cancels timer)
 *   - close() cleans up handlers, buffer, socket
 *   - onStatusChange fires immediately + on transitions + unsubscribe
 *   - onMessage unsubscribe
 *   - no global WebSocket → throws
 *   - stale socket events ignored after reconnect
 *   - backoff caps at maxReconnectDelay
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketTransport } from "../src/index";

// ---------------------------------------------------------------------------
// Minimal WebSocket stub factory
// ---------------------------------------------------------------------------

type EventName = "open" | "close" | "error" | "message";

interface StubSocketInstance {
  readyState: number;
  binaryType: string;
  sentFrames: Uint8Array[];
  listeners: Partial<Record<EventName, ((ev: MessageEvent | Event) => void)[]>>;
  fire(event: "open" | "close" | "error"): void;
  fireMessage(data: ArrayBuffer | Uint8Array | string): void;
  close(): void;
}

function makeStubWebSocketClass(): {
  StubWebSocket: typeof WebSocket;
  instances: StubSocketInstance[];
} {
  const instances: StubSocketInstance[] = [];

  class StubSocket implements StubSocketInstance {
    readyState = 0; // CONNECTING
    binaryType = "";
    sentFrames: Uint8Array[] = [];
    listeners: Partial<Record<EventName, ((ev: MessageEvent | Event) => void)[]>> = {};

    constructor(_url: string) {
      instances.push(this);
    }

    addEventListener(event: string, fn: (ev: MessageEvent | Event) => void): void {
      const key = event as EventName;
      this.listeners[key] ??= [];
      this.listeners[key].push(fn);
    }

    send(payload: Uint8Array): void {
      this.sentFrames.push(payload);
    }

    close(): void {
      this.readyState = 3; // CLOSED
    }

    // --- test helpers -------------------------------------------------------

    fire(event: "open" | "close" | "error"): void {
      if (event === "open") this.readyState = 1; // OPEN
      for (const fn of this.listeners[event] ?? []) fn(new Event(event));
    }

    fireMessage(data: ArrayBuffer | Uint8Array | string): void {
      const ev = new MessageEvent("message", { data });
      for (const fn of this.listeners.message ?? []) fn(ev);
    }
  }

  return { StubWebSocket: StubSocket as unknown as typeof WebSocket, instances };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransport(
  url = "ws://test",
  extraOpts: { initialReconnectDelay?: number; maxReconnectDelay?: number } = {},
): {
  t: WebSocketTransport;
  instances: StubSocketInstance[];
} {
  const { StubWebSocket, instances } = makeStubWebSocketClass();
  const t = new WebSocketTransport(url, {
    webSocketImpl: StubWebSocket,
    initialReconnectDelay: 500,
    maxReconnectDelay: 30_000,
    ...extraOpts,
  });
  return { t, instances };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebSocketTransport — constructor & status", () => {
  it("starts in connecting status", () => {
    const { t } = makeTransport();
    expect(t.status).toBe("connecting");
    t.close();
  });

  it("throws when given a non-function webSocketImpl", () => {
    // A non-function value bypasses the ?? fallback and triggers the guard.
    expect(
      () =>
        new WebSocketTransport("ws://x", {
          webSocketImpl: "not-a-function" as unknown as typeof WebSocket,
        }),
    ).toThrow("no global WebSocket available");
  });

  it("transitions to open status when socket fires open", () => {
    const { t, instances } = makeTransport();
    const statuses: string[] = [];
    t.onStatusChange((s) => statuses.push(s));
    instances[0].fire("open");
    expect(t.status).toBe("open");
    expect(statuses).toContain("open");
    t.close();
  });
});

describe("WebSocketTransport — onStatusChange", () => {
  it("fires immediately with current status on subscribe", () => {
    const { t } = makeTransport();
    const received: string[] = [];
    const unsub = t.onStatusChange((s) => received.push(s));
    expect(received).toEqual(["connecting"]);
    unsub();
    t.close();
  });

  it("does not fire when status does not change (idempotent)", () => {
    const { t, instances } = makeTransport();
    // Open the socket first
    instances[0].fire("open");
    const received: string[] = [];
    const unsub = t.onStatusChange((s) => received.push(s));
    // Already open — firing open again must not emit a second "open"
    instances[0].fire("open");
    expect(received.filter((s) => s === "open").length).toBe(1);
    unsub();
    t.close();
  });

  it("unsubscribe stops further notifications", () => {
    const { t, instances } = makeTransport();
    const received: string[] = [];
    const unsub = t.onStatusChange((s) => received.push(s));
    unsub();
    instances[0].fire("open");
    // Only the initial synchronous call should be in the array
    expect(received).toEqual(["connecting"]);
    t.close();
  });
});

describe("WebSocketTransport — send / buffer", () => {
  it("buffers sends issued before open and flushes them on open", () => {
    const { t, instances } = makeTransport();
    const p1 = new Uint8Array([1]);
    const p2 = new Uint8Array([2]);
    t.send(p1);
    t.send(p2);
    expect(instances[0].sentFrames).toEqual([]); // not yet sent

    instances[0].fire("open");

    expect(instances[0].sentFrames).toEqual([p1, p2]);
    t.close();
  });

  it("sends directly when socket is already open", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("open");
    const p = new Uint8Array([42]);
    t.send(p);
    expect(instances[0].sentFrames).toContain(p);
    t.close();
  });

  it("buffer is cleared on close()", () => {
    const { t, instances } = makeTransport();
    t.send(new Uint8Array([7]));
    t.close();
    // The close guard prevents connect from running again, so opening
    // the socket sends nothing.
    instances[0].fire("open");
    expect(instances[0].sentFrames).toEqual([]);
  });
});

describe("WebSocketTransport — onMessage", () => {
  it("dispatches ArrayBuffer payloads to handlers", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("open");
    const received: Uint8Array[] = [];
    const unsub = t.onMessage((p) => received.push(p));
    const buf = new Uint8Array([10, 20, 30]).buffer;
    instances[0].fireMessage(buf);
    expect(Array.from(received[0]!)).toEqual([10, 20, 30]);
    unsub();
    t.close();
  });

  it("dispatches Uint8Array payloads directly", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("open");
    const received: Uint8Array[] = [];
    t.onMessage((p) => received.push(p));
    const arr = new Uint8Array([5, 6]);
    instances[0].fireMessage(arr);
    expect(received[0]).toBe(arr);
    t.close();
  });

  it("drops non-binary messages silently", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("open");
    const received: Uint8Array[] = [];
    t.onMessage((p) => received.push(p));
    instances[0].fireMessage("not binary");
    expect(received).toHaveLength(0);
    t.close();
  });

  it("unsubscribe stops handler from receiving messages", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("open");
    const received: Uint8Array[] = [];
    const unsub = t.onMessage((p) => received.push(p));
    unsub();
    instances[0].fireMessage(new Uint8Array([1]).buffer);
    expect(received).toHaveLength(0);
    t.close();
  });

  it("clears message handlers on close()", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("open");
    const received: Uint8Array[] = [];
    t.onMessage((p) => received.push(p));
    t.close();
    // Fire message on the now-closed socket
    instances[0].fireMessage(new Uint8Array([9]).buffer);
    expect(received).toHaveLength(0);
  });
});

describe("WebSocketTransport — reconnect on close event", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a reconnect after socket close and transitions to reconnecting", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("open");
    const statuses: string[] = [];
    t.onStatusChange((s) => statuses.push(s));

    instances[0].fire("close");

    expect(t.status).toBe("reconnecting");
    expect(statuses).toContain("reconnecting");
    t.close();
  });

  it("creates a new socket after the initial backoff delay", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("close"); // triggers reconnect

    expect(instances).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(instances).toHaveLength(2);
    t.close();
  });

  it("doubles backoff delay on successive disconnects", () => {
    const { t, instances } = makeTransport();

    // 1st disconnect → 500 ms timer
    instances[0].fire("close");
    vi.advanceTimersByTime(500); // fires timer → 2nd socket

    // 2nd disconnect → 1 000 ms timer
    instances[1]!.fire("close");
    vi.advanceTimersByTime(999);
    expect(instances).toHaveLength(2); // not yet

    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);
    t.close();
  });

  it("caps reconnect delay at maxReconnectDelay", () => {
    const { t, instances } = makeTransport("ws://x", {
      initialReconnectDelay: 100,
      maxReconnectDelay: 200,
    });

    // 1st drop → 100 ms
    instances[0].fire("close");
    vi.advanceTimersByTime(100);

    // 2nd drop → would be 200 ms (capped at max)
    instances[1]!.fire("close");
    vi.advanceTimersByTime(200);

    // 3rd drop → still 200 ms
    instances[2]!.fire("close");
    vi.advanceTimersByTime(200);

    expect(instances).toHaveLength(4);
    t.close();
  });

  it("resets backoff to initial delay after a successful open", () => {
    const { t, instances } = makeTransport();

    // Drop once → 500 ms
    instances[0].fire("close");
    vi.advanceTimersByTime(500);

    // 2nd socket opens successfully
    instances[1]!.fire("open");

    // Drop again → back to 500 ms (not 1 000 ms)
    instances[1]!.fire("close");
    vi.advanceTimersByTime(499);
    expect(instances).toHaveLength(2); // not yet

    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);
    t.close();
  });
});

describe("WebSocketTransport — reconnect on error event", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("also reconnects when the socket fires an error", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("error");
    expect(t.status).toBe("reconnecting");

    vi.advanceTimersByTime(500);
    expect(instances).toHaveLength(2);
    t.close();
  });
});

describe("WebSocketTransport — close()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions to closed status", () => {
    const { t } = makeTransport();
    t.close();
    expect(t.status).toBe("closed");
  });

  it("cancels a pending reconnect timer", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("close"); // starts 500 ms timer
    expect(t.status).toBe("reconnecting");
    t.close();
    vi.advanceTimersByTime(500);
    // No new socket should have been created
    expect(instances).toHaveLength(1);
  });

  it("does not reconnect after close() even if socket later fires close", () => {
    const { t, instances } = makeTransport();
    instances[0].fire("open");
    t.close();
    instances[0].fire("close"); // should be ignored
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(1);
  });

  it("calling close() multiple times is safe", () => {
    const { t } = makeTransport();
    t.close();
    expect(() => t.close()).not.toThrow();
    expect(t.status).toBe("closed");
  });
});

describe("WebSocketTransport — stale socket event guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores close/error events from a superseded socket", () => {
    const { t, instances } = makeTransport();

    // 1st socket closes → timer fires → 2nd socket is created
    instances[0].fire("close");
    vi.advanceTimersByTime(500);
    expect(instances).toHaveLength(2);

    // 2nd socket opens — now the current socket is instances[1]
    instances[1]!.fire("open");

    // The old (stale) socket fires close — must not trigger another reconnect
    instances[0].fire("close");

    expect(t.status).toBe("open");
    t.close();
  });
});
