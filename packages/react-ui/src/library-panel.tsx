import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Search, Upload, X } from "lucide-react";
import { Palette } from "./palette.js";
import { IconButton } from "./icon-button.js";

const SIDE_PANEL_ICON_SIZE = 14;
const SIDE_PANEL_ICON_STROKE = 1.75;

/**
 * Slide-in side library panel. Opened by a host button, closed by
 * the panel's own ✕ — it does NOT auto-close on canvas clicks.
 * Header carries:
 *
 *   • a live search input that filters templates by name / category /
 *     tags (case-insensitive substring);
 *   • an optional dock toggle for hosts that want the panel to
 *     sit beside the canvas instead of overlaying it (visual
 *     state only — the host owns the actual layout flip via
 *     `onDockChange`);
 *   • optional Import button + Close.
 *
 * Default `side="right"`; hosts that prefer a left layout override.
 *
 * Dock state is persisted to localStorage (`du:library:docked`)
 * when `persist` is truthy — survives page reloads. Hosts can
 * suppress persistence by setting `persist={false}`.
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
  /**
   * Controlled docked flag. Pure UI toggle here — host must wire
   * `onDockedChange` to actually reflow the layout (e.g. mount the
   * panel as a sibling of `<DiagramSurface>` instead of an overlay
   * on the UI layer). Uncontrolled mode uses internal state.
   */
  readonly docked?: boolean;
  readonly onDockedChange?: (docked: boolean) => void;
  /** Skip localStorage persistence when `false`. Default `true`. */
  readonly persist?: boolean;
}

const DOCKED_KEY = "du:library:docked";

const readBoolStorage = (key: string): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const writeBoolStorage = (key: string, value: boolean): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* private mode / quota — silently no-op */
  }
};

export const LibraryPanel = ({
  open,
  onClose,
  side = "right",
  onImport,
  style,
  docked: dockedProp,
  onDockedChange,
  persist = true,
}: LibraryPanelProps) => {
  // Dock — controlled when host supplies the prop, otherwise
  // self-managed; persists to localStorage when `persist` is on.
  const [internalDocked, setInternalDocked] = useState<boolean>(() =>
    persist ? readBoolStorage(DOCKED_KEY) : false,
  );
  const docked = dockedProp ?? internalDocked;

  const toggleDocked = (): void => {
    const next = !docked;
    if (dockedProp === undefined) setInternalDocked(next);
    if (persist) writeBoolStorage(DOCKED_KEY, next);
    onDockedChange?.(next);
  };

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

  // The panel closes only via its ✕ button — no auto-close on canvas
  // clicks. (Open is driven by the host's toolbar toggle.)
  const panelRef = useRef<HTMLElement>(null);

  if (!open) return null;
  const sideClass = side === "right" ? "du-side-panel-right" : "du-side-panel-left";
  const dockClass = docked ? " du-side-panel-docked" : "";
  return (
    <aside
      ref={panelRef}
      className={`du-side-panel ${sideClass}${dockClass}`}
      style={style}
    >
      <header className="du-side-panel-header">
        <div style={{ display: "inline-flex", gap: 4 }}>
          {onDockedChange !== undefined || dockedProp !== undefined ? (
            <IconButton
              label={docked ? "Undock library" : "Dock library beside canvas"}
              size="sm"
              active={docked}
              onClick={toggleDocked}
            >
              <DockIcon />
            </IconButton>
          ) : null}
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
          onChange={(ev) => setSearch(ev.target.value)}
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

/**
 * Lightweight dock-icon glyph — Lucide doesn't ship a "panel-
 * pinned-right" that reads cleanly at 14 px, so we draw a
 * minimal two-rectangle SVG instead. Renders inside IconButton's
 * 16 px slot.
 */
const DockIcon = () => (
  <svg
    width={SIDE_PANEL_ICON_SIZE}
    height={SIDE_PANEL_ICON_SIZE}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={SIDE_PANEL_ICON_STROKE}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x={1.5} y={2.5} width={13} height={11} rx={1.5} />
    <line x1={10} y1={2.5} x2={10} y2={13.5} />
  </svg>
);
