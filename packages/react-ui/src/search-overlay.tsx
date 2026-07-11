import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { defaultActionRegistry, searchScene, type SceneSearchMatch } from "@oh-just-another/state";
import type { ElementId, LinkId } from "@oh-just-another/types";
import { useDiagramOptional, useScene } from "./hooks.js";
import { SEARCH_ZOOM_PADDING_PX } from "./constants.js";

/**
 * Text-search overlay (`⌘F`). A slim floating bar over the canvas: type a
 * substring and it finds every text shape / frame name / edge label that
 * contains it, selecting and framing the current match. `Enter` /
 * `↓` / `⇧Enter` / `↑` walk the results (wrap-around); `Esc` closes.
 *
 * Self-contained like the command palette: manages its own open state and
 * registers the `open-search` action so `⌘F` routes through the shared
 * registry and shows in the help dialog. Mount once per host. Read-only
 * safe (`viewMode`) — search never mutates the scene.
 *
 * The match index lives in `@oh-just-another/state` (`searchScene`), a pure
 * function unit-tested on its own; this component only drives the UI and
 * the select/zoom navigation.
 */
export const SearchOverlay = (): ReactElement | null => {
  const editor = useDiagramOptional();
  const scene = useScene();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    defaultActionRegistry.replace({
      id: "open-search",
      label: "Find text",
      category: "other",
      viewMode: true,
      hotkey: { key: "f", meta: true },
      perform: () => {
        setOpen(true);
      },
    });
    return () => {
      defaultActionRegistry.unregister("open-search");
    };
  }, []);

  const matches = useMemo<SceneSearchMatch[]>(
    () => (query.trim() ? searchScene(scene, query) : []),
    [scene, query],
  );

  // Focus (select + frame) the active match. Keyed on `active` / `query`
  // only — NOT on `matches` — so the viewport change it causes (which mints
  // a new scene → new `matches` array) can't loop the effect. Latest matches
  // are read through a ref.
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  useEffect(() => {
    if (!open || !editor) return;
    const match = matchesRef.current[active];
    if (!match) return;
    if (match.kind === "element") {
      editor.setSelection([match.id as ElementId]);
    } else {
      editor.selectLink(match.id as LinkId);
    }
    // Reveal (center) the match without filling the screen — a small hit stays
    // small and just gets centered; zoom only drops to fit an oversized match.
    editor.revealSelection(SEARCH_ZOOM_PADDING_PX);
  }, [open, active, query, editor]);

  // Reset transient state and focus the field whenever the bar opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
    };
  }, [open]);

  if (!open) return null;

  const close = (): void => {
    // Reset the query/active index on close so reopening starts empty. Without
    // this the retained non-empty query makes the reveal effect jump straight
    // to the previous match on open — before the user types anything.
    setQuery("");
    setActive(0);
    setOpen(false);
  };

  const step = (delta: number): void => {
    if (matches.length === 0) return;
    setActive((i) => (i + delta + matches.length) % matches.length);
  };

  const onInputKey = (ev: ReactKeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      step(ev.shiftKey ? -1 : 1);
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      step(1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      step(-1);
    }
  };

  const counter =
    matches.length === 0
      ? query.trim()
        ? "No results"
        : ""
      : `${String(active + 1)} of ${String(matches.length)}`;

  return (
    <div style={BAR_STYLE} role="search">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onInputKey}
        placeholder="Find in diagram…"
        aria-label="Find text in diagram"
        style={INPUT_STYLE}
      />
      <span style={COUNTER_STYLE} aria-live="polite">
        {counter}
      </span>
      <button
        type="button"
        className="du-icon-button"
        aria-label="Previous match"
        title="Previous (⇧⏎)"
        disabled={matches.length === 0}
        onClick={() => {
          step(-1);
        }}
        style={NAV_BUTTON_STYLE}
      >
        ↑
      </button>
      <button
        type="button"
        className="du-icon-button"
        aria-label="Next match"
        title="Next (⏎)"
        disabled={matches.length === 0}
        onClick={() => {
          step(1);
        }}
        style={NAV_BUTTON_STYLE}
      >
        ↓
      </button>
      <button
        type="button"
        className="du-icon-button"
        aria-label="Close search"
        title="Close (Esc)"
        onClick={close}
        style={NAV_BUTTON_STYLE}
      >
        ✕
      </button>
    </div>
  );
};

const BAR_STYLE: CSSProperties = {
  position: "absolute",
  top: 64,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 8px",
  borderRadius: 10,
  background: "var(--du-ui-bg-solid)",
  border: "1px solid var(--du-ui-border)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
  color: "var(--du-text)",
  zIndex: 80,
  pointerEvents: "auto",
};
const INPUT_STYLE: CSSProperties = {
  border: "none",
  outline: "none",
  padding: "4px 8px",
  fontSize: 14,
  minWidth: 180,
  background: "transparent",
  color: "inherit",
};
const COUNTER_STYLE: CSSProperties = {
  fontSize: 12,
  color: "var(--du-text-muted)",
  minWidth: 56,
  textAlign: "right",
  whiteSpace: "nowrap",
};
const NAV_BUTTON_STYLE: CSSProperties = {
  minWidth: 28,
  height: 28,
};
