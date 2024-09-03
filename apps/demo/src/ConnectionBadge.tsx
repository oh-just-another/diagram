import type { ConnectionStatus } from "./collab";

interface StatusVisual {
  readonly dot: string;
  readonly label: string;
  readonly title: string;
}

const VISUALS: Record<ConnectionStatus, StatusVisual> = {
  local: {
    dot: "#9ca3af",
    label: "local channel",
    title: "BroadcastChannel — same-origin tabs only",
  },
  connecting: {
    dot: "#f59e0b",
    label: "connecting…",
    title: "Opening WebSocket to the relay",
  },
  open: {
    dot: "#10b981",
    label: "connected",
    title: "Live — peer updates flow in real time",
  },
  reconnecting: {
    dot: "#ef4444",
    label: "reconnecting…",
    title: "Connection dropped — exponential back-off in progress",
  },
  closed: {
    dot: "#6b7280",
    label: "offline",
    title: "Session ended",
  },
};

export const ConnectionBadge = ({ status }: { readonly status: ConnectionStatus }) => {
  const v = VISUALS[status];
  return (
    <div
      title={v.title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        fontSize: 11,
        color: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--button-bg)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: v.dot,
        }}
      />
      {v.label}
    </div>
  );
};
