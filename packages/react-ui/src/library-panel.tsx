import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Search, Upload, X } from "lucide-react";
import { Palette } from "./palette.js";
import { IconButton } from "./icon-button.js";

const SIDE_PANEL_ICON_SIZE = 14;
const SIDE_PANEL_ICON_STROKE = 1.75;

/**
 * Slide-in side library panel. Opened by a host button, closed by the
 * panel's own ✕ — it does NOT auto-close on canvas clicks. A floating
 * overlay (no dock / pin). Header carries:
 *
 *   • a live search input that filters templates by name / category /
 *     tags (case-insensitive substring);
 *   • optional Import button + Close.
 *
 * Default `side="right"`; hosts that prefer a left layout override.
 */
export interface LibraryPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Side the panel anchors to. Default `"right"`. */
  readonly side?: "left" | "right";
  /**
   * Sheet mode: render as plain flex content that fills its parent
   * (no fixed floating-pill chrome) — for hosting inside a `BottomSheet`
   * on mobile. The parent provides the surface / position.
   */
  readonly sheet?: boolean;
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
  sheet = false,
  onImport,
  style,
}: LibraryPanelProps) => {
  // Search query, cleared when the panel closes. Passed to the Palette,
  // which switches to flat-match mode.
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Focus the search input on open so the user can start typing immediately.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (!open) return null;
  // Sheet mode fills its parent (BottomSheet) — no side anchoring / pill chrome.
  const variantClass = sheet
    ? "du-side-panel-sheet"
    : side === "right"
      ? "du-side-panel-right"
      : "du-side-panel-left";
  return (
    <aside className={`du-side-panel ${variantClass}`} style={style}>
      <header className="du-side-panel-header">
        <div style={{ display: "inline-flex", gap: 4 }}>
          {onImport ? (
            <IconButton label="Import templates" size="sm" onClick={onImport}>
              <Upload size={SIDE_PANEL_ICON_SIZE} strokeWidth={SIDE_PANEL_ICON_STROKE} />
            </IconButton>
          ) : null}
          <IconButton label="Close library" size="sm" onClick={onClose}>
            <X size={SIDE_PANEL_ICON_SIZE} strokeWidth={SIDE_PANEL_ICON_STROKE} />
          </IconButton>
        </div>
      </header>
      <div className="du-side-panel-search">
        <Search
          size={SIDE_PANEL_ICON_SIZE}
          strokeWidth={SIDE_PANEL_ICON_STROKE}
          className="du-side-panel-search-icon"
          aria-hidden
        />
        <input
          ref={searchRef}
          type="search"
          value={search}
          placeholder="Search templates…"
          aria-label="Search templates"
          onChange={(ev) => { setSearch(ev.target.value); }}
          onKeyDown={(ev) => {
            if (ev.key === "Escape" && search) {
              ev.stopPropagation();
              setSearch("");
            }
          }}
        />
      </div>
      <div className="du-side-panel-body du-side-panel-body-flush">
        <Palette searchQuery={search} layout="list" />
      </div>
    </aside>
  );
};
