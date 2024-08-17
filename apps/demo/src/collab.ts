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

    const transport = new BroadcastChannelTransport(`demo-room-${room}`);
    const provider = new TransportProvider({
      doc,
      transport,
      awareness: aw.awareness,
    });
    const unbind = bindEditor(editor, sceneDoc);
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
