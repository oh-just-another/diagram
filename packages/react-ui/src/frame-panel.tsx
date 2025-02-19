import { useMemo, type CSSProperties } from "react";
import type { ShapeId } from "@oh-just-another/types";
import { type FrameShape } from "@oh-just-another/scene";
import { useDiagramOptional, useScene } from "./hooks.js";

/**
 * Sidebar panel listing every `FrameShape` in the scene. Each row
 * shows the frame's name and size and exposes two actions:
 *
 *   • Select — sets the editor's selection to the frame (host can
 *     then trigger zoom-to-fit, double-click to drill in, etc.).
 *   • Export — fires `onExport(frameId)`; the host decides what to
 *     do (call `exportPng`/`exportPdf` from `@oh-just-another/exporter`
 *     with `{ frameId }`, then save / share / download).
 *
 * Renders nothing when there are no frames.
 */
export interface FramePanelProps {
  /** Host-side export callback. Invoked per-frame on the action click. */
  readonly onExport?: (frameId: ShapeId, frame: FrameShape) => void;
  readonly style?: CSSProperties;
}

export const FramePanel = ({ onExport, style }: FramePanelProps) => {
  const editor = useDiagramOptional();
  const scene = useScene();

  const frames = useMemo<readonly FrameShape[]>(() => {
    const out: FrameShape[] = [];
    for (const s of scene.shapes.values()) {
      if (s.type === "frame") out.push(s as FrameShape);
    }
    out.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    return out;
  }, [scene]);

  if (frames.length === 0) return null;

  return (
    <aside
      data-panel="frames"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        fontSize: 12,
        ...style,
      }}
    >
      <h2
        style={{
          margin: 0,
          padding: "10px 12px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--muted)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        Frames
        <span style={{ textTransform: "none", color: "var(--faint)" }}>{frames.length}</span>
      </h2>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          flex: "1 1 auto",
          overflowY: "auto",
        }}
      >
        {frames.map((frame) => (
          <li key={frame.id}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderBottom: "1px solid var(--divider, transparent)",
              }}
            >
              <button
                type="button"
                onClick={() => editor?.setSelection([frame.id])}
                style={{
                  flex: "1 1 auto",
                  textAlign: "left",
                  background: "transparent",
                  color: "var(--text)",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  font: "inherit",
                }}
                title="Select this frame on canvas"
              >
                <div style={{ fontWeight: 500 }}>{frame.name ?? "Untitled frame"}</div>
                <div style={{ color: "var(--faint)", fontSize: 10 }}>
                  {Math.round(frame.width)} × {Math.round(frame.height)}
                </div>
              </button>
              {onExport ? (
                <button
                  type="button"
                  onClick={() => onExport(frame.id, frame)}
                  style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    border: "1px solid var(--border, #2a2a2a)",
                    borderRadius: 3,
                    background: "var(--button-bg, #2a2a2a)",
                    color: "var(--text, #ddd)",
                    cursor: "pointer",
                  }}
                  title="Export only this frame's content"
                >
                  Export
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
};
