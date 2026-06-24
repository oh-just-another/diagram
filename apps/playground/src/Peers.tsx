import { useEffect, useState } from "react";
import type { CollabAwareness, Peer } from "@oh-just-another/collab";

/**
 * Renders the list of connected peers as colour-coded chips. The local
 * peer is highlighted with "(you)".
 */
export const Peers = ({ awareness }: { readonly awareness: CollabAwareness | null }) => {
  const [peers, setPeers] = useState<readonly Peer[]>([]);
  useEffect(() => {
    if (!awareness) {
      setPeers([]);
      return undefined;
    }
    setPeers(awareness.getPeers());
    return awareness.onPeers(setPeers);
  }, [awareness]);

  if (!awareness) return null;
  const selfId = awareness.clientId;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {peers.map((p) => (
        <span
          key={p.clientId}
          title={p.user.id}
          style={{
            background: p.user.color,
            color: "#fff",
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 10,
            border: p.clientId === selfId ? "2px solid #fff" : "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {p.user.name}
          {p.clientId === selfId ? " (you)" : ""}
        </span>
      ))}
    </div>
  );
};
