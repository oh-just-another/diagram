import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Transport, TransportStatus } from "@oh-just-another/network";
import { TransportProvider } from "../src/transport-provider.js";

const TAG_DOC = 0;
const TAG_SYNC_REQUEST = 2;

/**
 * Controllable in-memory transport: frames route to the linked peer only
 * while `up` is true (a dead link silently eats frames — same failure mode
 * as a WebSocket dying mid-send). `setStatus` drives the reconnect logic.
 */
class FakeTransport implements Transport {
  peer: FakeTransport | null = null;
  up = true;
  readonly sent: Uint8Array[] = [];
  private readonly handlers = new Set<(p: Uint8Array) => void>();
  private readonly statusHandlers = new Set<(s: TransportStatus) => void>();
  private status: TransportStatus = "open";

  send(payload: Uint8Array): void {
    this.sent.push(payload);
    if (this.up && this.peer) {
      for (const h of this.peer.handlers) h(payload);
    }
  }

  onMessage(handler: (payload: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatusChange(handler: (status: TransportStatus) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  setStatus(next: TransportStatus): void {
    this.status = next;
    for (const h of this.statusHandlers) h(next);
  }

  close(): void {
    this.handlers.clear();
    this.statusHandlers.clear();
  }
}

const link = (): [FakeTransport, FakeTransport] => {
  const a = new FakeTransport();
  const b = new FakeTransport();
  a.peer = b;
  b.peer = a;
  return [a, b];
};

const syncRequests = (t: FakeTransport): number =>
  t.sent.filter((p) => p.length === 1 && p[0] === TAG_SYNC_REQUEST).length;

describe("TransportProvider reconnect resync", () => {
  it("requests peer state once on join", () => {
    const [a] = link();
    const provider = new TransportProvider({ doc: new Y.Doc(), transport: a });
    expect(syncRequests(a)).toBe(1);
    provider.destroy();
  });

  it("re-requests state and offers its own on every reconnect", () => {
    const [a] = link();
    const doc = new Y.Doc();
    const provider = new TransportProvider({ doc, transport: a });
    expect(syncRequests(a)).toBe(1);

    // The subscribe-time "open" plus transitions that are not reconnects
    // must not trigger a resync.
    a.setStatus("reconnecting");
    expect(syncRequests(a)).toBe(1);

    a.setStatus("open");
    expect(syncRequests(a)).toBe(2);
    // The resync also pushes our full doc state downstream.
    const fullStates = a.sent.filter((p) => p[0] === TAG_DOC);
    expect(fullStates.length).toBeGreaterThan(0);

    a.setStatus("reconnecting");
    a.setStatus("open");
    expect(syncRequests(a)).toBe(3);
    provider.destroy();
  });

  it("converges docs after updates were lost on a dead link", () => {
    const [a, b] = link();
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const pa = new TransportProvider({ doc: docA, transport: a });
    const pb = new TransportProvider({ doc: docB, transport: b });

    docA.getMap("m").set("before", 1);
    expect(docB.getMap("m").get("before")).toBe(1);

    // Link dies silently: the edit is sent but never delivered. A later
    // delta would depend on it and sit in docB's pending queue forever.
    a.up = false;
    b.up = false;
    docA.getMap("m").set("lost", 2);
    expect(docB.getMap("m").get("lost")).toBeUndefined();

    // Link returns; both transports report a reconnect → both resync.
    a.up = true;
    b.up = true;
    a.setStatus("reconnecting");
    b.setStatus("reconnecting");
    a.setStatus("open");
    b.setStatus("open");

    expect(docB.getMap("m").get("lost")).toBe(2);

    // And updates flow live again afterwards.
    docA.getMap("m").set("after", 3);
    expect(docB.getMap("m").get("after")).toBe(3);
    pa.destroy();
    pb.destroy();
  });

  it("works with transports that report no status", () => {
    const bare: Transport = {
      send: () => undefined,
      onMessage: () => () => undefined,
      close: () => undefined,
    };
    const provider = new TransportProvider({ doc: new Y.Doc(), transport: bare });
    provider.destroy();
  });

  it("stops resyncing after destroy", () => {
    const [a] = link();
    const provider = new TransportProvider({ doc: new Y.Doc(), transport: a });
    provider.destroy();
    a.setStatus("reconnecting");
    a.setStatus("open");
    expect(syncRequests(a)).toBe(1);
  });
});
