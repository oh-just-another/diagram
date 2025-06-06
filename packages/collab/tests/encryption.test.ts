import { describe, expect, it, vi } from "vitest";
import type { Transport } from "@oh-just-another/network";
import {
  EncryptedTransport,
  ENCRYPTION_IV_BYTES,
  generateRoomKey,
  importRoomKey,
} from "../src";

/**
 * In-memory pair of transports — `a` sends, `b` receives, and vice
 * versa. Simulates two browsers connected to a fan-out relay
 * without booting any sockets. Both ends are bound by the same
 * roomId implicitly (the loop test ignores rooms).
 */
const pairedTransports = (): { a: Transport; b: Transport } => {
  const handlersA = new Set<(p: Uint8Array) => void>();
  const handlersB = new Set<(p: Uint8Array) => void>();
  const make = (
    outbound: Set<(p: Uint8Array) => void>,
    inbound: Set<(p: Uint8Array) => void>,
  ): Transport => ({
    send: (payload) => {
      for (const h of outbound) h(payload);
    },
    onMessage: (h) => {
      inbound.add(h);
      return () => inbound.delete(h);
    },
    close: () => {
      /* no-op */
    },
  });
  return { a: make(handlersB, handlersA), b: make(handlersA, handlersB) };
};

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const decode = (b: Uint8Array): string => new TextDecoder().decode(b);

describe("generateRoomKey", () => {
  it("returns a 20-hex roomId and a 22-char base64url key", async () => {
    const { roomId, keyBase64 } = await generateRoomKey();
    expect(roomId).toMatch(/^[0-9a-f]{20}$/);
    // 16 raw bytes encoded as base64url-without-padding = 22 chars.
    expect(keyBase64).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("each call returns a different roomId + key", async () => {
    const a = await generateRoomKey();
    const b = await generateRoomKey();
    expect(a.roomId).not.toBe(b.roomId);
    expect(a.keyBase64).not.toBe(b.keyBase64);
  });
});

describe("importRoomKey", () => {
  it("round-trips: generate → keyBase64 → import → same crypto material", async () => {
    const { keyBase64, key: original } = await generateRoomKey();
    const reimported = await importRoomKey(keyBase64);
    // Both keys should encrypt identically (deterministic at the
    // ciphertext level given a fixed IV).
    const iv = new Uint8Array(ENCRYPTION_IV_BYTES); // all zeros — TEST ONLY
    const a = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      original,
      utf8("x") as BufferSource,
    );
    const b = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      reimported,
      utf8("x") as BufferSource,
    );
    expect(new Uint8Array(a)).toEqual(new Uint8Array(b));
  });

  it("throws on malformed base64", async () => {
    await expect(importRoomKey("notbase64!!!")).rejects.toThrow();
  });

  it("throws on wrong byte length", async () => {
    // Valid base64 but only 4 bytes (32 bits) — AES-128 wants 16.
    await expect(importRoomKey("AAAAAA")).rejects.toThrow(/expected 16 bytes/);
  });
});

describe("EncryptedTransport", () => {
  it("two peers with the same key round-trip a payload", async () => {
    const { keyBase64 } = await generateRoomKey();
    const keyA = await importRoomKey(keyBase64);
    const keyB = await importRoomKey(keyBase64);
    const { a, b } = pairedTransports();
    const encA = new EncryptedTransport(a, keyA);
    const encB = new EncryptedTransport(b, keyB);

    const received: string[] = [];
    encB.onMessage((p) => received.push(decode(p)));

    encA.send(utf8("hello from A"));
    // crypto.subtle is async — wait for the next microtask flush.
    await new Promise((r) => setTimeout(r, 30));
    expect(received).toEqual(["hello from A"]);
  });

  it("wrong key on the receiver drops the frame silently", async () => {
    const { keyBase64: kA } = await generateRoomKey();
    const { keyBase64: kB } = await generateRoomKey();
    const keyA = await importRoomKey(kA);
    const keyB = await importRoomKey(kB);
    const { a, b } = pairedTransports();
    const onError = vi.fn();
    const encA = new EncryptedTransport(a, keyA);
    const encB = new EncryptedTransport(b, keyB, { onDecryptError: onError });

    const received: Uint8Array[] = [];
    encB.onMessage((p) => received.push(p));

    encA.send(utf8("attacker"));
    await new Promise((r) => setTimeout(r, 30));
    expect(received).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("relay sees only ciphertext (different from plaintext, IV-prefixed)", async () => {
    const { key } = await generateRoomKey();
    let captured: Uint8Array | null = null;
    const transport: Transport = {
      send: (p) => {
        captured = p;
      },
      onMessage: () => () => {},
      close: () => {},
    };
    const enc = new EncryptedTransport(transport, key);
    enc.send(utf8("secret diagram update"));
    await new Promise((r) => setTimeout(r, 30));
    expect(captured).not.toBeNull();
    // IV (12 bytes) + ciphertext (≥ plaintext) + 16-byte GCM tag.
    expect(captured!.byteLength).toBeGreaterThan(ENCRYPTION_IV_BYTES + 16);
    expect(decode(captured!)).not.toContain("secret");
  });

  it("close() releases inner subscription + handlers", async () => {
    const { key } = await generateRoomKey();
    let innerClosed = false;
    let unsubCalled = false;
    const transport: Transport = {
      send: () => {},
      onMessage: () => () => {
        unsubCalled = true;
      },
      close: () => {
        innerClosed = true;
      },
    };
    const enc = new EncryptedTransport(transport, key);
    enc.onMessage(() => {
      throw new Error("should not fire after close");
    });
    enc.close();
    expect(innerClosed).toBe(true);
    expect(unsubCalled).toBe(true);
  });
});
