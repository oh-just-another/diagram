import type { CSSProperties } from "react";
import { Palette } from "./palette.js";
import { IconButton } from "./icon-button.js";

/**
 * Slide-in left-side library panel — modern-style replacement
 * for the old fixed-sidebar Palette. Contains the same template
 * grid (wraps `<Palette>`) plus an "Import" action slot for hosts
 * that ship custom template loading.
 *
 * Visibility is controlled by `open` so hosts can toggle it from a
 * button in the top bar. Closed = panel doesn't render at all
 * (saves the click-through area for canvas pointer events).
 */
export interface LibraryPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /**
   * Called when the user clicks "Import". Hosts wire this to a file
   * picker / OS dialog. Skipped when omitted (button hidden).
   */
  readonly onImport?: () => void;
  /** Override panel width (default 240 px via CSS). */
  readonly style?: CSSProperties;
}

export const LibraryPanel = ({ open, onClose, onImport, style }: LibraryPanelProps) => {
  if (!open) return null;
  return (
    <aside className="du-side-panel du-side-panel-left" style={style}>
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
