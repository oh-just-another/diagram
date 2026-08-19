import { useState, type CSSProperties } from "react";
import { ChevronDown, X } from "lucide-react";
import { useAnnotations, useDiagramOptional, useSelectedAnnotation } from "../core/hooks.js";
import { formatTime } from "../utils/format-time.js";
import { Markdown } from "../primitives/markdown.js";

const GLYPH_SIZE = 16;
const GLYPH_STROKE = 1.75;
const glyph = { size: GLYPH_SIZE, strokeWidth: GLYPH_STROKE } as const;

/**
 * Side-panel listing every annotation thread in the scene. Each row is
 * a button that focuses the annotation (opens `<CommentsPopover>` and
 * highlights the pin). Resolved threads render dimmed. Hosts that want
 * a different layout can compose their own from `useAnnotations` +
 * `editor.setSelectedAnnotation`.
 *
 * Renders as a static side-panel card (`du-side-panel du-side-panel-static`).
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
      className={`du-side-panel du-side-panel-static${className ? ` ${className}` : ""}`}
      style={style}
    >
      <header className="du-side-panel-header">
        <span className="du-side-panel-title">Comments ({annotations.length})</span>
      </header>
      <div className="du-side-panel-body du-side-panel-body-flush du-panel-list">
        {annotations.length === 0 ? (
          <div className="du-panel-empty">
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
                aria-current={isOpen ? "true" : undefined}
                className={`du-panel-row du-panel-row-stack${isOpen ? " is-active" : ""}${
                  ann.resolved ? " is-muted" : ""
                }`}
              >
                <span className="du-panel-row-meta">
                  <strong>{first?.authorName ?? "—"}</strong>
                  {ann.thread.length > 1 ? <span>+{ann.thread.length - 1}</span> : null}
                  {ann.resolved ? <span className="du-panel-row-meta-end">resolved</span> : null}
                </span>
                <span className="du-panel-row-label is-muted">{first?.body ?? "(empty)"}</span>
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
 * inside `<DiagramRoot>` so it can position itself over the canvas
 * (top-right, `--du-bar-inset` from the edges; width `--du-thread-w`).
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
      className={`du-thread${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-label="Annotation thread"
      style={style}
    >
      <header className="du-thread-header">
        <span className="du-thread-status">{ann.resolved ? "Resolved" : "Open"}</span>
        <button
          type="button"
          onClick={() => {
            editor.toggleAnnotationResolved(ann.id);
          }}
          className="du-button"
        >
          {ann.resolved ? "Reopen" : "Resolve"}
        </button>
        <button
          type="button"
          onClick={() => {
            editor.removeAnnotation(ann.id);
          }}
          className="du-icon-button du-icon-button-flat"
          aria-label="Delete thread"
          title="Delete thread"
        >
          <X {...glyph} />
        </button>
        <button
          type="button"
          onClick={() => {
            editor.setSelectedAnnotation(null);
          }}
          className="du-icon-button du-icon-button-flat"
          aria-label="Close"
          title="Close"
        >
          <ChevronDown {...glyph} />
        </button>
      </header>
      <div className="du-thread-body">
        {ann.thread.length === 0 ? (
          <div className="du-panel-empty">No comments yet.</div>
        ) : (
          ann.thread.map((c) => (
            <div key={c.id} className="du-thread-item">
              <button
                type="button"
                onClick={() => {
                  editor.removeComment(ann.id, c.id);
                }}
                aria-label="Delete comment"
                title="Delete comment"
                className="du-icon-button du-icon-button-flat du-thread-item-remove"
              >
                <X {...glyph} />
              </button>
              <div className="du-thread-item-meta">
                <strong>{c.authorName}</strong> {formatTime(c.createdAt)}
              </div>
              <div className="du-thread-item-body">
                <Markdown text={c.body} />
              </div>
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
        className="du-thread-form"
      >
        <input
          type="text"
          value={draft}
          onChange={(ev) => {
            setDraft(ev.target.value);
          }}
          placeholder="Reply…"
          aria-label="Reply"
          className="du-panel-input"
        />
        <button type="submit" className="du-button du-button-primary" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};
