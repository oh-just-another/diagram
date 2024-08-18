import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import type { Editor } from "@oh-just-another/state";
import { CollabAwareness, SceneDoc, TransportProvider, bindEditor } from "@oh-just-another/collab";
import { BroadcastChannelTransport } from "@oh-just-another/network";

/**
 * Reads `?room=<name>` from the current URL. When present, wires the
 * editor to a Yjs document shared over a `BroadcastChannel` (same-origin
 * tabs). Returns the awareness instance so the UI can render peer
 * cursors / lists.
 */
export const useCollab = (
  editor: Editor | null,
): {
  readonly room: string | null;
  readonly awareness: CollabAwareness | null;
} => {
  const room = useMemo(readRoomFromUrl, []);
  const [awareness, setAwareness] = useState<CollabAwareness | null>(null);

  useEffect(() => {
    if (!editor || !room) return undefined;

    const doc = new Y.Doc();
    const sceneDoc = new SceneDoc(doc);
    const aw = new CollabAwareness(doc);
    aw.updateLocal({ user: randomUser() });

    const channelName = `demo-room-${room}`;
    console.warn(`[collab] joining room "${room}" (channel "${channelName}")`);
    const transport = new BroadcastChannelTransport(channelName);
    // Diagnostic wrapper — logs each tagged message in / out so we can
    // confirm the BroadcastChannel hop in DevTools.
    const wrappedTransport = {
      send: (p: Uint8Array): void => {
        console.debug(`[collab] → send tag=${p[0]} bytes=${p.length}`);
        transport.send(p);
      },
      onMessage: (h: (p: Uint8Array) => void): (() => void) =>
        transport.onMessage((p) => {
          console.debug(`[collab] ← recv tag=${p[0]} bytes=${p.length}`);
          h(p);
        }),
      close: (): void => transport.close(),
    };
    const provider = new TransportProvider({
      doc,
      transport: wrappedTransport,
      awareness: aw.awareness,
    });
    // Wait briefly for peers to answer the implicit sync request before we
    // decide to seed the room with our local scene. Without this, joiners
    // would race the seeder and clobber the existing room state.
    const unbind = bindEditor(editor, sceneDoc, { waitForSyncMs: 300 });
    setAwareness(aw);

    return () => {
      unbind();
      provider.destroy();
      aw.destroy();
      transport.close();
      doc.destroy();
      setAwareness(null);
    };
  }, [editor, room]);

  return { room, awareness };
};

const readRoomFromUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("room");
};

const COLORS = ["#1a73e8", "#e91e63", "#43a047", "#fb8c00", "#7b1fa2", "#00838f"];

const randomUser = (): { id: string; name: string; color: string } => {
  const id = Math.random().toString(36).slice(2, 8);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
  return { id, name: `Peer ${id.slice(0, 4)}`, color };
};
