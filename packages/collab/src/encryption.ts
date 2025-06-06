import type { Transport } from "@oh-just-another/network";
import {
  ENCRYPTION_IV_BYTES,
  ENCRYPTION_KEY_BITS,
  ROOM_ID_BYTES,
} from "./constants.js";

/**
 * Client-side AES-GCM encryption for collab transports. Mirrors
 * standard's "URL fragment carries the key" model: the secret
 * never reaches the relay, so a blind fan-out server can route
 * payloads without ever decrypting them.
 *
 * URL convention (set by the host app, parsed in `apps/diagram/src/collab.ts`):
 *
 *   /#room=<roomId>,<keyBase64>
 *
 * `roomId` goes in the WebSocket pathname (`/<roomId>`) so the
 * relay can route by room. `keyBase64` stays in the URL fragment
 * which the browser does not transmit on any request — including
 * the WebSocket upgrade — so the server never sees it.
 *
 * Wire format per frame:
 *
 *   [ 12-byte IV ][ AES-GCM ciphertext + 16-byte auth tag ]
 *
 * IV is random per frame (WebCrypto / NIST guidance — never reuse
 * an IV with the same key). The auth tag is part of the ciphertext
 * tail produced by AES-GCM; tampered frames throw on decrypt.
 */

/** Strongly-typed result of {@link generateRoomKey}. */
export interface RoomCredentials {
  /** Public room identifier — appears in the WS pathname, visible to relay. */
  readonly roomId: string;
  /**
   * Base64url-encoded raw AES key. Goes into the URL fragment; share
   * the full URL to invite peers. Never log this value.
   */
  readonly keyBase64: string;
  /** The imported `CryptoKey` ready for AES-GCM operations. */
  readonly key: CryptoKey;
}

/**
 * Mint a fresh credentials pair for a new collab session. Uses
 * `crypto.getRandomValues` for the roomId and `crypto.subtle` for
 * the AES key.
 */
export const generateRoomKey = async (): Promise<RoomCredentials> => {
  const roomId = randomHex(ROOM_ID_BYTES);
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: ENCRYPTION_KEY_BITS },
    /* extractable */ true,
    ["encrypt", "decrypt"],
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  const keyBase64 = base64UrlEncode(new Uint8Array(raw));
  return { roomId, keyBase64, key };
};

/**
 * Re-import a key the second peer parsed out of the URL fragment.
 * Throws on malformed base64 / wrong length so the caller can
 * surface "broken invite link" cleanly.
 */
export const importRoomKey = async (keyBase64: string): Promise<CryptoKey> => {
  const raw = base64UrlDecode(keyBase64);
  if (raw.byteLength !== ENCRYPTION_KEY_BITS / 8) {
    throw new Error(
      `importRoomKey: expected ${ENCRYPTION_KEY_BITS / 8} bytes, got ${raw.byteLength}`,
    );
  }
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "AES-GCM", length: ENCRYPTION_KEY_BITS },
    /* extractable */ false,
    ["encrypt", "decrypt"],
  );
};

/**
 * Wrap any {@link Transport} so every outgoing payload is AES-GCM
 * encrypted and every incoming payload is decrypted before reaching
 * subscribers. The relay sees nothing but binary blobs.
 *
 * Decryption errors are silently dropped — a tampered or
 * wrong-key frame should not surface as a noisy console error
 * (that would let a malicious peer flood the log). Callers can opt
 * into observability by passing `onDecryptError`.
 */
export class EncryptedTransport implements Transport {
  private readonly handlers = new Set<(payload: Uint8Array) => void>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly inner: Transport,
    private readonly key: CryptoKey,
    private readonly options: { readonly onDecryptError?: (err: unknown) => void } = {},
  ) {
    this.unsubscribe = inner.onMessage((cipher) => {
      void this.decryptAndDispatch(cipher);
    });
  }

  send(payload: Uint8Array): void {
    void this.encryptAndSend(payload);
  }

  onMessage(handler: (payload: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  close(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.handlers.clear();
    this.inner.close();
  }

  private async encryptAndSend(plaintext: Uint8Array): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTES));
    const cipherBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      this.key,
      plaintext as BufferSource,
    );
    // Frame = IV || ciphertext (with auth tag suffix from AES-GCM).
    const cipher = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
    cipher.set(iv, 0);
    cipher.set(new Uint8Array(cipherBuf), iv.byteLength);
    this.inner.send(cipher);
  }

  private async decryptAndDispatch(cipher: Uint8Array): Promise<void> {
    if (cipher.byteLength <= ENCRYPTION_IV_BYTES) {
      this.options.onDecryptError?.(new Error("payload smaller than IV"));
      return;
    }
    const iv = cipher.subarray(0, ENCRYPTION_IV_BYTES);
    const body = cipher.subarray(ENCRYPTION_IV_BYTES);
    let plain: ArrayBuffer;
    try {
      plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        this.key,
        body as BufferSource,
      );
    } catch (err) {
      this.options.onDecryptError?.(err);
      return;
    }
    const out = new Uint8Array(plain);
    for (const handler of this.handlers) handler(out);
  }
}

// --- Helpers ---------------------------------------------------------------

/** Random hex string of `byteCount` bytes (length = byteCount * 2). */
const randomHex = (byteCount: number): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Base64url (RFC 4648 §5): standard base64 with `+` → `-`, `/` → `_`,
 * no `=` padding. URL-safe so the key can live in `location.hash`
 * without any escaping.
 */
const base64UrlEncode = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const base64UrlDecode = (s: string): Uint8Array => {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
