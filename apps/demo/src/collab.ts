import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import type { Editor } from "@oh-just-another/state";
import {
  bindAwareness,
  bindEditor,
  CollabAwareness,
  SceneDoc,
  TransportProvider,
} from "@oh-just-another/collab";
import {
  BroadcastChannelTransport,
  WebSocketTransport,
  type Transport,
  type WebSocketStatus,
} from "@oh-just-another/network";

/**
 * Reads `?room=<name>` from the current URL. When present, wires the
 * editor to a Yjs document shared over a `BroadcastChannel` (same-origin
 * tabs). Returns the awareness instance so the UI can render peer
 * cursors / lists.
 */
export type ConnectionStatus = WebSocketStatus | "local";

export const useCollab = (
  editor: Editor | null,
): {
  readonly room: string | null;
  readonly awareness: CollabAwareness | null;
  readonly status: ConnectionStatus | null;
} => {
  const config = useMemo(readCollabConfigFromUrl, []);
  const room = config?.room ?? null;
  const [awareness, setAwareness] = useState<CollabAwareness | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    if (!editor || !config) return undefined;

    const doc = new Y.Doc();
    const sceneDoc = new SceneDoc(doc);
    const aw = new CollabAwareness(doc);
    const user = randomUser();

    // Pick transport based on URL: `?relay=ws://host:port` switches to
    // the WebSocketTransport (cross-machine); otherwise BroadcastChannel
    // (same-origin tabs).
    let transport: Transport;
    let unsubscribeStatus: (() => void) | null = null;
    if (config.relayUrl) {
      const url = `${config.relayUrl.replace(/\/$/, "")}/${config.room}`;
      console.warn(`[collab] joining room "${config.room}" via relay ${url}`);
      const ws = new WebSocketTransport(url);
      unsubscribeStatus = ws.onStatusChange(setStatus);
      transport = ws;
    } else {
      const channelName = `demo-room-${config.room}`;
      console.warn(`[collab] joining room "${config.room}" (channel "${channelName}")`);
      transport = new BroadcastChannelTransport(channelName);
      setStatus("local");
    }
    const provider = new TransportProvider({
      doc,
      transport,
      awareness: aw.awareness,
    });
    // Wait briefly for peers to answer the implicit sync request before we
    // decide to seed the room with our local scene. Without this, joiners
    // would race the seeder and clobber the existing room state.
    const unbindEditorRef = bindEditor(editor, sceneDoc, { waitForSyncMs: 300 });
    const unbindAwarenessRef = bindAwareness(editor, aw, { user });
    setAwareness(aw);

    return () => {
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
  }, [editor, config]);

  return { room, awareness, status };
};

interface CollabConfig {
  readonly room: string;
  readonly relayUrl: string | null;
}

const readCollabConfigFromUrl = (): CollabConfig | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (!room) return null;
  const relayUrl = params.get("relay");
  return { room, relayUrl: relayUrl && /^wss?:\/\//.test(relayUrl) ? relayUrl : null };
};

const COLORS = ["#1a73e8", "#e91e63", "#43a047", "#fb8c00", "#7b1fa2", "#00838f"];

const randomUser = (): { id: string; name: string; color: string } => {
  const id = Math.random().toString(36).slice(2, 8);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
  return { id, name: `Peer ${id.slice(0, 4)}`, color };
};
