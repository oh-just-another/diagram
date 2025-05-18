import type { CSSProperties } from "react";
import { Palette } from "./palette.js";
import { IconButton } from "./icon-button.js";

/**
 * Slide-in side library panel — modern-style replacement for the
 * old fixed-sidebar Palette. Contains the same template grid (wraps
 * `<Palette>`) plus an optional "Import" action slot.
 *
 * Default `side="right"` matches standard's layout where the
 * Library toggle lives in the top-right and the panel slides in
 * from that edge. Hosts that prefer a left layout can override.
 */
export interface LibraryPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Side the panel anchors to. Default `"right"`. */
  readonly side?: "left" | "right";
  /**
   * Called when the user clicks "Import". Hosts wire this to a file
   * picker / OS dialog. Skipped when omitted (button hidden).
   */
  readonly onImport?: () => void;
  /** Override panel width (default 240 px via CSS). */
  readonly style?: CSSProperties;
}

export const LibraryPanel = ({
  open,
  onClose,
  side = "right",
  onImport,
  style,
}: LibraryPanelProps) => {
  if (!open) return null;
  const sideClass = side === "right" ? "du-side-panel-right" : "du-side-panel-left";
  return (
    <aside className={`du-side-panel ${sideClass}`} style={style}>
      <header className="du-side-panel-header">
        <span>Library</span>
        <div style={{ display: "inline-flex", gap: 4 }}>
          {onImport ? (
            <IconButton label="Import templates" size="sm" onClick={onImport}>
              ↥
            </IconButton>
          ) : null}
          <IconButton label="Close library" size="sm" onClick={onClose}>
            ×
          </IconButton>
        </div>
      </header>
      <div className="du-side-panel-body">
        <Palette style={{ background: "transparent", border: "none", padding: 0 }} />
      </div>
    </aside>
  );
};
