import { useEffect, useRef, useState } from "react";
import { Check, Share2, Users } from "lucide-react";
import type { CollabAPI } from "./collab";

const SESSION_ICON_SIZE = 16;
const SESSION_ICON_STROKE = 1.75;

/**
 * "Start session" / "Active session" control. When no session is
 * active, renders a single button that mints credentials and opens
 * a popover with the shareable URL. While a session is active,
 * shows a green dot + a popover listing the URL, copy button, and
 * a "Leave" action.
 *
 * The secret AES key lives in the URL fragment, which means the URL
 * itself is the credential — anyone with it can join and decrypt.
 */
export const SessionButton = ({ collab }: { readonly collab: CollabAPI }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (ev: MouseEvent | PointerEvent): void => {
      if (!ref.current) return;
      if (ref.current.contains(ev.target as Node)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const startOrToggle = async (): Promise<void> => {
    if (collab.room) {
      setOpen((v) => !v);
      return;
    }
    setBusy(true);
    try {
      await collab.startSession();
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select + copy manually */
    }
  };

  const leave = (): void => {
    collab.leaveSession();
    setOpen(false);
  };

  const active = collab.room !== null;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className={`du-icon-button du-icon-button-flat${active ? " is-active" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active ? "Active session" : "Start session"}
        title={active ? "Active session" : "Start session"}
        onClick={() => void startOrToggle()}
        disabled={busy}
      >
        {active
          ? <Users size={SESSION_ICON_SIZE} strokeWidth={SESSION_ICON_STROKE} />
          : <Share2 size={SESSION_ICON_SIZE} strokeWidth={SESSION_ICON_STROKE} />}
      </button>
      {open && active ? (
        <div
          role="dialog"
          aria-label="Live collaboration session"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 320,
            background: "var(--menu-bg)",
            color: "var(--menu-text)",
            border: "1px solid var(--menu-border)",
            borderRadius: 8,
            boxShadow: "var(--du-ui-shadow)",
            padding: 12,
            zIndex: 900,
            fontSize: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 600 }}>Live session</div>
          <div style={{ color: "var(--muted)" }}>
            Share this URL — peers join automatically. The AES key in the
            URL fragment never reaches the server.
          </div>
          <code
            style={{
              padding: "6px 8px",
              background: "var(--button-bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              wordBreak: "break-all",
              userSelect: "all",
            }}
          >
            {location.href}
          </code>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="du-icon-button du-icon-button-flat"
              style={{ width: "auto", padding: "0 10px" }}
              onClick={() => void copy()}
            >
              {copied
                ? <><Check size={14} strokeWidth={SESSION_ICON_STROKE} /> Copied</>
                : "Copy"}
            </button>
            <button
              type="button"
              className="du-icon-button du-icon-button-flat"
              style={{ width: "auto", padding: "0 10px", color: "var(--du-danger)" }}
              onClick={leave}
            >
              Leave
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
