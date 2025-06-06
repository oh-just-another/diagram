import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { Editor } from "@oh-just-another/state";
import {
  bindAwareness,
  bindEditor,
  CollabAwareness,
  EncryptedTransport,
  generateRoomKey,
  importRoomKey,
  SceneDoc,
  TransportProvider,
} from "@oh-just-another/collab";
import {
  WebSocketTransport,
  type Transport,
  type WebSocketStatus,
} from "@oh-just-another/network";

/**
 * Collab orchestration for the demo. URL model:
 *
 *   /#room=<roomId>,<keyBase64>
 *
 * - `roomId` rides in the WS pathname so the relay can route by
 *   room. Visible to the server.
 * - `keyBase64` lives in the URL *fragment* — browsers never
 *   transmit fragments, so the AES key never reaches the relay.
 *
 * Every outbound Yjs / awareness update goes through
 * `EncryptedTransport` (AES-GCM, random 12-byte IV per frame).
 * The relay sees opaque blobs only.
 *
 * Session lifecycle:
 *   • `startSession()` mints fresh credentials, writes them into
 *     `location.hash`, opens the connection. Returns the URL for
 *     the host to copy / share.
 *   • Reload / fresh-tab with the same hash auto-joins.
 *   • `leaveSession()` clears the hash and tears down everything.
 *
 * Relay endpoint is the same-origin `/relay` by default (Vite
 * proxies it to `ws://localhost:1234`). Host can override via
 * `VITE_RELAY_URL` in `.env` / `.env.local`.
 */

export type ConnectionStatus = WebSocketStatus;

export interface CollabAPI {
  readonly status: ConnectionStatus | null;
  readonly awareness: CollabAwareness | null;
  readonly room: string | null;
  /**
   * Generate a fresh roomId + AES key, update the URL hash,
   * connect. The returned URL is what the host shares with peers.
   */
  readonly startSession: () => Promise<string>;
  /** Disconnect + clear the URL hash. Idempotent. */
  readonly leaveSession: () => void;
}

export const useCollab = (editor: Editor | null): CollabAPI => {
  const [credentials, setCredentials] = useState<ParsedHashCreds | null>(
    readCredentialsFromHash,
  );
  const [awareness, setAwareness] = useState<CollabAwareness | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;

  // Listen for hash changes — covers manual paste of an invite URL
  // and the back/forward buttons walking history that touched the
  // hash, so joining via paste kicks in without a reload.
  useEffect(() => {
    const onHashChange = (): void => {
      setCredentials(readCredentialsFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!editor || !credentials) return undefined;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const key = await importRoomKey(credentials.keyBase64).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[collab] invalid key in URL hash:", err);
        return null;
      });
      if (cancelled || !key) return;

      const doc = new Y.Doc();
      const sceneDoc = new SceneDoc(doc);
      const aw = new CollabAwareness(doc);
      const user = randomUser();
      editor.setCommentAuthor({ id: user.id, name: user.name });

      const rawTransport: Transport = new WebSocketTransport(
        `${resolveRelayBase()}/${credentials.roomId}`,
      );
      const unsubscribeStatus =
        rawTransport instanceof WebSocketTransport
          ? rawTransport.onStatusChange(setStatus)
          : null;
      const transport = new EncryptedTransport(rawTransport, key);

      const provider = new TransportProvider({
        doc,
        transport,
        awareness: aw.awareness,
      });
      const unbindEditorRef = bindEditor(editor, sceneDoc, { waitForSyncMs: 300 });
      const unbindAwarenessRef = bindAwareness(editor, aw, { user });
      setAwareness(aw);

      cleanup = () => {
        unsubscribeStatus?.();
        unbindAwarenessRef();
        unbindEditorRef();
        provider.destroy();
        aw.destroy();
        transport.close();
        doc.destroy();
        setAwareness(null);
        setStatus(null);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [editor, credentials]);

  const startSession = useCallback(async (): Promise<string> => {
    const creds = await generateRoomKey();
    const hash = `#room=${creds.roomId},${creds.keyBase64}`;
    // `replaceState` instead of `assign` so back-button doesn't
    // bounce out of the session.
    window.history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
    const parsed: ParsedHashCreds = {
      roomId: creds.roomId,
      keyBase64: creds.keyBase64,
    };
    setCredentials(parsed);
    return location.href;
  }, []);

  const leaveSession = useCallback(() => {
    window.history.replaceState(null, "", `${location.pathname}${location.search}`);
    setCredentials(null);
  }, []);

  return {
    status,
    awareness,
    room: credentials?.roomId ?? null,
    startSession,
    leaveSession,
  };
};

// --- URL hash parsing ------------------------------------------------------

interface ParsedHashCreds {
  readonly roomId: string;
  readonly keyBase64: string;
}

/**
 * Parses `#room=<roomId>,<keyBase64>` out of `location.hash`. The
 * URL fragment is browser-only; this function silently returns null
 * for anything that doesn't match (including SSR — the `window` guard
 * makes it safe in Node tests).
 */
const readCredentialsFromHash = (): ParsedHashCreds | null => {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const value = params.get("room");
  if (!value) return null;
  const [roomId, keyBase64] = value.split(",", 2);
  if (!roomId || !keyBase64) return null;
  return { roomId, keyBase64 };
};

// --- Relay URL resolution --------------------------------------------------

/**
 * Returns the base WS URL the client connects to. Order:
 *   1. `VITE_RELAY_URL` from env (host override, e.g. `wss://relay.example.com`).
 *   2. Same-origin `/relay` proxied by Vite in dev / nginx in prod.
 */
const resolveRelayBase = (): string => {
  const env = (import.meta.env.VITE_RELAY_URL as string | undefined)?.trim();
  if (env) return env.replace(/\/$/, "");
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/relay`;
};

// --- Peer identity ---------------------------------------------------------

const COLORS = ["#1a73e8", "#e91e63", "#43a047", "#fb8c00", "#7b1fa2", "#00838f"];

const randomUser = (): { id: string; name: string; color: string } => {
  const id = Math.random().toString(36).slice(2, 8);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
  return { id, name: `Peer ${id.slice(0, 4)}`, color };
};
