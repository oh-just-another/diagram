import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pin, PinOff, Search, Upload, X } from "lucide-react";
import { Palette } from "./palette.js";
import { IconButton } from "./icon-button.js";

const SIDE_PANEL_ICON_SIZE = 14;
const SIDE_PANEL_ICON_STROKE = 1.75;

/**
 * Slide-in side library panel — modern-style replacement for
 * the old fixed-sidebar Palette. Header carries:
 *
 *   • a live search input that filters templates by name / category /
 *     tags (case-insensitive substring);
 *   • a pin toggle that disables the host's auto-close-on-canvas-
 *     click behaviour (panel still floats over the canvas);
 *   • an optional dock toggle for hosts that want the panel to
 *     sit beside the canvas instead of overlaying it (visual
 *     state only — the host owns the actual layout flip via
 *     `onDockChange`);
 *   • optional Import button + Close.
 *
 * Default `side="right"` matches standard's layout where the
 * Library toggle lives in the top-right and the panel slides in
 * from that edge. Hosts that prefer a left layout can override.
 *
 * Pin + dock states are persisted to localStorage (keys
 * `du:library:pinned` / `du:library:docked`) when `persist` is
 * truthy — survives page reloads. Hosts can suppress persistence
 * by setting `persist={false}` (e.g. embedded read-only previews).
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
   * Controlled pinned flag. When `true`, the panel asks the host
   * not to auto-close it on canvas clicks (host reads via
   * `onPinnedChange` / persisted localStorage). Uncontrolled mode
   * uses internal state seeded from localStorage.
   */
  readonly pinned?: boolean;
  readonly onPinnedChange?: (pinned: boolean) => void;
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

const PINNED_KEY = "du:library:pinned";
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
  pinned: pinnedProp,
  onPinnedChange,
  docked: dockedProp,
  onDockedChange,
  persist = true,
}: LibraryPanelProps) => {
  // Pin + dock — controlled when host supplies the prop, otherwise
  // self-managed; both persist to localStorage when `persist` is on.
  const [internalPinned, setInternalPinned] = useState<boolean>(() =>
    persist ? readBoolStorage(PINNED_KEY) : false,
  );
  const [internalDocked, setInternalDocked] = useState<boolean>(() =>
    persist ? readBoolStorage(DOCKED_KEY) : false,
  );
  const pinned = pinnedProp ?? internalPinned;
  const docked = dockedProp ?? internalDocked;

  const togglePinned = (): void => {
    const next = !pinned;
    if (pinnedProp === undefined) setInternalPinned(next);
    if (persist) writeBoolStorage(PINNED_KEY, next);
    onPinnedChange?.(next);
  };
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

  // Auto-close on canvas click — only when not pinned, not docked
  // (docked panel takes its own column), and currently open. We
  // listen on `pointerdown` (capture: false) so toolbar / menu
  // clicks aren't swallowed; check whether the event landed
  // outside the panel itself before closing.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || pinned || docked) return undefined;
    const onDown = (ev: PointerEvent): void => {
      const el = panelRef.current;
      if (!el) return;
      if (ev.target instanceof Node && el.contains(ev.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open, pinned, docked, onClose]);

  if (!open) return null;
  const sideClass = side === "right" ? "du-side-panel-right" : "du-side-panel-left";
  const dockClass = docked ? " du-side-panel-docked" : "";
  return (
    <aside
      ref={panelRef}
      className={`du-side-panel ${sideClass}${dockClass}`}
      style={style}
      data-pinned={pinned}
    >
      <header className="du-side-panel-header">
        <div style={{ display: "inline-flex", gap: 4 }}>
          <IconButton
            label={pinned ? "Unpin library" : "Pin library (stay open)"}
            size="sm"
            active={pinned}
            onClick={togglePinned}
          >
            {pinned ? (
              <PinOff size={SIDE_PANEL_ICON_SIZE} strokeWidth={SIDE_PANEL_ICON_STROKE} />
            ) : (
              <Pin size={SIDE_PANEL_ICON_SIZE} strokeWidth={SIDE_PANEL_ICON_STROKE} />
            )}
          </IconButton>
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
        <Palette searchQuery={search} />
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
