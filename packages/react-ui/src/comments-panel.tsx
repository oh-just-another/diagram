import { useState, type CSSProperties } from "react";
import { useAnnotations, useDiagramOptional, useSelectedAnnotation } from "./hooks.js";

/**
 * Side-panel listing every annotation thread in the scene. Each row is
 * a button that focuses the annotation (opens `<CommentsPopover>` and
 * highlights the pin). Resolved threads render dimmed. Hosts that want
 * a different layout can compose their own from `useAnnotations` +
 * `editor.setSelectedAnnotation`.
 */
export interface CommentsPanelProps {
  readonly style?: CSSProperties;
  readonly className?: string;
}

export const CommentsPanel = ({ style, className }: CommentsPanelProps) => {
  const editor = useDiagramOptional();
  const annotations = useAnnotations();
  const selectedId = useSelectedAnnotation();

  return (
    <aside
      className={className}
      style={{
        flex: "0 0 240px",
        background: "var(--panel, #161616)",
        color: "var(--text, #ddd)",
        borderLeft: "1px solid var(--border, #2a2a2a)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...style,
      }}
    >
      <header
        style={{
          padding: "8px 12px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--muted, #888)",
          borderBottom: "1px solid var(--border, #2a2a2a)",
        }}
      >
        Comments ({annotations.length})
      </header>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {annotations.length === 0 ? (
          <div style={{ padding: "16px 12px", color: "var(--faint, #555)", fontSize: 12 }}>
            No comments yet. Right-click on the canvas to add one.
          </div>
        ) : (
          annotations.map((ann) => {
            const first = ann.thread[0];
            const isOpen = ann.id === selectedId;
            return (
              <button
                key={ann.id}
                type="button"
                onClick={() => editor?.setSelectedAnnotation(ann.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  borderLeft: isOpen ? "3px solid var(--accent, #1a73e8)" : "3px solid transparent",
                  background: isOpen ? "var(--cursor-bg, rgba(26,115,232,0.12))" : "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  opacity: ann.resolved ? 0.55 : 1,
                  borderBottom: "1px solid var(--divider, #333)",
                  font: "inherit",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600 }}>{first?.authorName ?? "—"}</span>
                  {ann.thread.length > 1 ? (
                    <span style={{ color: "var(--muted, #888)" }}>+{ann.thread.length - 1}</span>
                  ) : null}
                  {ann.resolved ? (
                    <span style={{ marginLeft: "auto", color: "var(--muted, #888)" }}>
                      resolved
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    color: "var(--muted, #888)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {first?.body ?? "(empty)"}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};

/**
 * Floating thread view for the focused annotation. Renders nothing
 * when no annotation is open. Drop it as a sibling of `<DiagramSurface>`
 * inside `<DiagramRoot>` so it can position itself over the canvas.
 *
 * Composes from `useAnnotations` + `useSelectedAnnotation`; hosts that
 * want a different layout (modal, side-panel, etc.) can rebuild it.
 */
export interface CommentsPopoverProps {
  readonly style?: CSSProperties;
  readonly className?: string;
}

export const CommentsPopover = ({ style, className }: CommentsPopoverProps) => {
  const editor = useDiagramOptional();
  const annotations = useAnnotations();
  const selectedId = useSelectedAnnotation();
  const [draft, setDraft] = useState("");

  if (!editor || !selectedId) return null;
  const ann = annotations.find((a) => a.id === selectedId);
  if (!ann) return null;

  const submit = (): void => {
    const body = draft.trim();
    if (!body) return;
    editor.addComment(ann.id, body);
    setDraft("");
  };

  return (
    <div
      className={className}
      role="dialog"
      aria-label="Annotation thread"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        width: 280,
        maxHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--panel, #161616)",
        color: "var(--text, #ddd)",
        border: "1px solid var(--border, #2a2a2a)",
        borderRadius: 8,
        boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
        font: "13px system-ui, -apple-system, sans-serif",
        ...style,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid var(--divider, #333)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--muted, #888)" }}>
          {ann.resolved ? "Resolved" : "Open"}
        </span>
        <button
          type="button"
          onClick={() => editor.toggleAnnotationResolved(ann.id)}
          style={popoverButtonStyle}
        >
          {ann.resolved ? "Reopen" : "Resolve"}
        </button>
        <button
          type="button"
          onClick={() => {
            editor.removeAnnotation(ann.id);
          }}
          style={popoverButtonStyle}
          aria-label="Delete thread"
        >
          ×
        </button>
        <button
          type="button"
          onClick={() => editor.setSelectedAnnotation(null)}
          style={{ ...popoverButtonStyle, marginLeft: 4 }}
          aria-label="Close"
        >
          ⌄
        </button>
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {ann.thread.length === 0 ? (
          <div style={{ color: "var(--faint, #555)" }}>No comments yet.</div>
        ) : (
          ann.thread.map((c) => (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted, #888)",
                  marginBottom: 2,
                }}
              >
                <strong style={{ color: "var(--text, #ddd)" }}>{c.authorName}</strong>{" "}
                {formatTime(c.createdAt)}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
        style={{
          padding: "8px 10px",
          borderTop: "1px solid var(--divider, #333)",
          display: "flex",
          gap: 6,
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          placeholder="Reply…"
          style={{
            flex: 1,
            background: "var(--button-bg, #2a2a2a)",
            border: "1px solid var(--border, #2a2a2a)",
            color: "inherit",
            padding: "4px 8px",
            borderRadius: 4,
            font: "inherit",
          }}
        />
        <button type="submit" style={popoverButtonStyle} disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

const popoverButtonStyle: CSSProperties = {
  background: "var(--button-bg, #2a2a2a)",
  border: "1px solid var(--border, #2a2a2a)",
  color: "inherit",
  padding: "3px 8px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
};

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};
