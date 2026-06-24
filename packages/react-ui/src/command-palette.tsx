import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import {
  defaultActionRegistry,
  formatHotkey,
  type Action,
  type HotkeyMatcher,
} from "@oh-just-another/state";
import { Modal } from "./modal.js";
import { useDiagramOptional } from "./hooks.js";

/**
 * Command palette (standard `⌘K`). A searchable list of every registered action,
 * dispatched through the same `ActionRegistry` as hotkeys / context menu — so
 * it stays in sync automatically as actions are added. Self-contained: manages
 * its own open state and registers the `open-command-palette` action (so the
 * `⌘K` shortcut also appears in the help dialog). Mount once per host.
 *
 * Predicate-gated actions whose predicate currently fails are shown disabled
 * (greyed, not runnable) so the list is stable but can't fire a no-op.
 */
export const CommandPalette = (): ReactElement | null => {
  const editor = useDiagramOptional();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Register the open action so `⌘K` (or `⌘⇧P`) routes through the registry
  // like every other hotkey (fed by the host keydown listener) and shows in the
  // help dialog. `replace` is idempotent across StrictMode / HMR.
  useEffect(() => {
    defaultActionRegistry.replace({
      id: "open-command-palette",
      label: "Command palette",
      category: "other",
      hotkey: [
        { key: "k", meta: true },
        { key: "p", meta: true, shift: true },
      ],
      perform: () => {
        setOpen(true);
      },
    });
    return () => {
      defaultActionRegistry.unregister("open-command-palette");
    };
  }, []);

  // Actions with a label, minus the palette opener itself. Built once; the
  // registry is stable for the session.
  const all = useMemo<Action[]>(
    () =>
      defaultActionRegistry
        .getAll()
        .filter((a) => a.label !== undefined && a.id !== "open-command-palette"),
    [open],
  );

  const ctx = editor ? { editor } : null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? all.filter((a) => (a.label ?? "").toLowerCase().includes(q)) : all;
    return list.map((a) => ({
      action: a,
      enabled: ctx ? (a.predicate ? a.predicate(ctx) : true) : false,
    }));
  }, [all, query, ctx]);

  // Reset transient state whenever the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    // Focus the input after the modal mounts.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const close = (): void => {
    setOpen(false);
  };

  const run = (entry: { action: Action; enabled: boolean }): void => {
    if (!entry.enabled || !ctx) return;
    close();
    defaultActionRegistry.dispatch(entry.action.id, ctx);
  };

  const onInputKey = (ev: ReactKeyboardEvent): void => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setActive((i) => Math.min(matches.length - 1, i + 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const entry = matches[active];
      if (entry) run(entry);
    }
  };

  const rowStyle = (i: number, enabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 14px",
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.4,
    background: i === active ? "var(--du-ui-hover, rgba(0,0,0,0.06))" : "transparent",
  });

  return (
    <Modal open={open} onClose={close} title="Command palette" style={MODAL_STYLE}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={onInputKey}
        placeholder="Search commands…"
        aria-label="Search commands"
        style={INPUT_STYLE}
      />
      <ul style={LIST_STYLE} role="listbox">
        {matches.length === 0 ? (
          <li style={{ padding: "12px 14px", opacity: 0.6 }}>No commands</li>
        ) : (
          matches.map((entry, i) => {
            const keys = actionHotkey(entry.action);
            return (
              <li
                key={entry.action.id}
                role="option"
                aria-selected={i === active}
                aria-disabled={!entry.enabled}
                style={rowStyle(i, entry.enabled)}
                onPointerEnter={() => {
                  setActive(i);
                }}
                onClick={() => {
                  run(entry);
                }}
              >
                <span>{entry.action.label}</span>
                {keys ? <kbd style={KBD_STYLE}>{keys}</kbd> : null}
              </li>
            );
          })
        )}
      </ul>
    </Modal>
  );
};

/** First hotkey/sequence of an action, formatted for the chip (or null). */
const actionHotkey = (action: Action): string | null => {
  if (action.hotkey) {
    const raw: readonly HotkeyMatcher[] = Array.isArray(action.hotkey)
      ? action.hotkey
      : [action.hotkey];
    const first = raw[0];
    if (first) return formatHotkey(first);
  }
  if (action.sequence && action.sequence.length > 0) {
    return action.sequence.map((k) => (k.length === 1 ? k.toUpperCase() : k)).join(" ");
  }
  return null;
};

const MODAL_STYLE: CSSProperties = {
  maxWidth: 520,
  width: "calc(100vw - 64px)",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
const INPUT_STYLE: CSSProperties = {
  border: "none",
  borderBottom: "1px solid var(--du-ui-border)",
  outline: "none",
  padding: "14px 16px",
  fontSize: 15,
  background: "transparent",
  color: "inherit",
};
const LIST_STYLE: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 4,
  maxHeight: 360,
  overflowY: "auto",
};
const KBD_STYLE: CSSProperties = {
  fontSize: 11,
  color: "var(--du-text-muted, #6b6b6b)",
  fontFamily: "inherit",
};
