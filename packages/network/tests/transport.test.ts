import { describe, expect, it } from "vitest";
import { BroadcastChannelTransport, WebSocketTransport } from "../src/index";

describe("BroadcastChannelTransport", () => {
  it("delivers messages between two channels with the same name", () => {
    const a = new BroadcastChannelTransport("test-room-1");
    const b = new BroadcastChannelTransport("test-room-1");
    return new Promise<void>((resolve, reject) => {
      const off = b.onMessage((payload) => {
        try {
          expect(Array.from(payload)).toEqual([1, 2, 3]);
          off();
          a.close();
          b.close();
          resolve();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
      a.send(new Uint8Array([1, 2, 3]));
    });
  });
});

describe("WebSocketTransport", () => {
  it("buffers sends issued before the socket opens", () => {
    const listeners: Record<string, (ev: { data?: unknown }) => void> = {};
    const sent: Uint8Array[] = [];
    class StubSocket {
      readyState = 0;
      binaryType = "";
      addEventListener(event: string, fn: (ev: { data?: unknown }) => void) {
        listeners[event] = fn;
      }
      send(p: Uint8Array) {
        sent.push(p);
      }
      close(): undefined {
        return undefined;
      }
    }
    const t = new WebSocketTransport("ws://x", {
      webSocketImpl: StubSocket as unknown as typeof WebSocket,
    });
    t.send(new Uint8Array([9]));
    expect(sent).toEqual([]); // buffered until `open`
    // Trigger open event — the transport flushes its outbound buffer.
    listeners.open?.({});
    t.close();
    expect(sent.length).toBeGreaterThan(0);
  });
});
