import { useEffect, useMemo, type CSSProperties, type ReactElement } from "react";
import {
  defaultActionRegistry,
  formatHotkey,
  isMac,
  type Action,
  type ActionCategory,
  type ActionRegistry,
  type HotkeyMatcher,
} from "@oh-just-another/state";
import { HELP_DIALOG_MAX_WIDTH_PX } from "./constants.js";

/**
 * Help dialog — a cheatsheet of every Action's hotkey. Opens on "?" by
 * default; hosts can also drive `open` via state.
 *
 * Pulls Actions from `defaultActionRegistry` (or a host-supplied
 * registry), groups them by `category`, formats the hotkey labels
 * for the current platform (⌘⇧Z on macOS, Ctrl+Shift+Z elsewhere)
 * via `formatHotkey` from @state/platform.
 *
 * Reference: https://github.com/standard/standard/blob/master/packages/standard/components/HelpDialog.tsx
 */

export interface HelpDialogProps {
  /** Override the registry — defaults to the package's shared default. */
  readonly registry?: ActionRegistry;
  /**
   * Open / close control. Hosts that wire their own bindings pass these;
   * the bundled `?` listener flips them via `useHelpDialogHotkey`.
   */
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly extraSections?: readonly HelpSection[];
}

export interface HelpSection {
  readonly title: string;
  readonly rows: readonly HelpRow[];
}

export interface HelpRow {
  readonly label: string;
  readonly shortcut: string;
}

const CATEGORY_TITLES: Record<ActionCategory, string> = {
  history: "History",
  selection: "Selection",
  clipboard: "Clipboard",
  "z-order": "Z-order",
  grouping: "Grouping",
  zoom: "Zoom",
  mode: "Tools",
  layout: "Layout",
  edit: "Editing",
  other: "Other",
};

const CATEGORY_ORDER: ActionCategory[] = [
  "mode",
  "edit",
  "selection",
  "clipboard",
  "history",
  "z-order",
  "grouping",
  "layout",
  "zoom",
  "other",
];

/**
 * Hook that flips `open` when the user presses `?`. Wire in app shell:
 *
 * ```tsx
 * const [help, setHelp] = useState(false);
 * useHelpDialogHotkey(() => setHelp(true));
 * <HelpDialog open={help} onClose={() => setHelp(false)} />
 * ```
 *
 * "?" is Shift+/ on the typical keyboard — the listener checks for both
 * `event.key === "?"` and `Shift + /`. Inputs and textareas are exempt
 * so the user can still type a literal "?" into a text field.
 */
export const useHelpDialogHotkey = (open: () => void): void => {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      const t = ev.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const isQuestion = ev.key === "?" || (ev.shiftKey && ev.key === "/");
      if (!isQuestion) return;
      ev.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
};

/**
 * Format the first hotkey on the action for display. Returns "—" when
 * the action has no hotkey assigned (toolbar-only actions).
 */
const actionShortcut = (action: Action): string => {
  if (!action.hotkey) return "—";
  const first = Array.isArray(action.hotkey) ? action.hotkey[0] : action.hotkey;
  return first ? formatHotkey(first as HotkeyMatcher) : "—";
};

export const HelpDialog = ({
  registry = defaultActionRegistry,
  open,
  onClose,
  title = "Keyboard shortcuts",
  extraSections,
}: HelpDialogProps): ReactElement | null => {
  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sections = useMemo<HelpSection[]>(() => {
    const byCategory = new Map<ActionCategory, HelpRow[]>();
    for (const action of registry.getAll()) {
      if (!action.label) continue;
      const cat = action.category ?? "other";
      const list = byCategory.get(cat) ?? [];
      list.push({ label: action.label, shortcut: actionShortcut(action) });
      byCategory.set(cat, list);
    }
    const out: HelpSection[] = [];
    for (const cat of CATEGORY_ORDER) {
      const rows = byCategory.get(cat);
      if (!rows || rows.length === 0) continue;
      out.push({ title: CATEGORY_TITLES[cat], rows });
    }
    if (extraSections) out.push(...extraSections);
    return out;
  }, [registry, extraSections]);

  if (!open) return null;

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };
  const dialogStyle: CSSProperties = {
    background: "var(--panel, #1a1a1a)",
    color: "var(--text, #ddd)",
    border: "1px solid var(--border, #2a2a2a)",
    borderRadius: 8,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
    maxWidth: HELP_DIALOG_MAX_WIDTH_PX,
    width: "calc(100vw - 64px)",
    maxHeight: "calc(100vh - 64px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
  const headerStyle: CSSProperties = {
    padding: "16px 20px",
    borderBottom: "1px solid var(--border, #2a2a2a)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };
  const bodyStyle: CSSProperties = {
    padding: "12px 20px 20px",
    overflowY: "auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px 32px",
  };
  const platformBadge: CSSProperties = {
    fontSize: 11,
    color: "var(--muted, #888)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={overlayStyle}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div style={dialogStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={platformBadge}>{isMac ? "macOS" : "Win / Linux"}</span>
            <button
              type="button"
              aria-label="Close help"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text, #ddd)",
                cursor: "pointer",
                fontSize: 20,
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={bodyStyle}>
          {sections.map((section) => (
            <section key={section.title}>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--muted, #888)",
                }}
              >
                {section.title}
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.label}>
                      <td
                        style={{
                          padding: "4px 0",
                          color: "var(--text, #ddd)",
                          fontSize: 13,
                        }}
                      >
                        {row.label}
                      </td>
                      <td
                        style={{
                          padding: "4px 0",
                          textAlign: "right",
                          fontFamily:
                            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                          fontSize: 12,
                          color: "var(--text-strong, #fff)",
                        }}
                      >
                        {row.shortcut}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
