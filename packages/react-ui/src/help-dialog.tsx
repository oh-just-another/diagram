import { Fragment, useEffect, useMemo, type CSSProperties, type ReactElement } from "react";
import { X } from "lucide-react";
import {
  defaultActionRegistry,
  formatHotkeyParts,
  isMac,
  type Action,
  type ActionCategory,
  type ActionRegistry,
  type HotkeyMatcher,
} from "@oh-just-another/state";
import { HELP_DIALOG_MAX_WIDTH_PX } from "./constants.js";
import { Modal } from "./modal.js";

/**
 * Help dialog — a cheatsheet of every Action's hotkey. Opens on "?" by
 * default; hosts can also drive `open` via state.
 *
 * Shortcuts are grouped into bordered "islands"; every key is rendered
 * as its own pill `<kbd>` chip. Multiple alternative shortcuts on one
 * row are joined with "or".
 *
 * Platform-aware key labels come from `formatHotkeyParts` in
 * `@oh-just-another/state/platform`: macOS gets glyphs (⌘ ⌥ ⇧ ⌃ ⏎ ⌫),
 * other platforms get spelled-out names (Ctrl, Alt, Shift, Enter,
 * Delete). The platform badge in the header reminds the user
 * which set they're looking at.
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

/**
 * Row payload. `keys` is an array of alternative shortcut combinations;
 * each combination is a list of platform-formatted key labels (e.g.
 * `[["⌘", "Z"], ["⌃", "Z"]]`). Empty `keys` renders an "—" placeholder.
 */
export interface HelpRow {
  readonly label: string;
  readonly keys: readonly (readonly string[])[];
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
 * Resolve the action's hotkey(s) into the per-chip parts the dialog
 * renders. Single-hotkey actions return one combination; actions with
 * an array hotkey return one combination per entry. Toolbar-only
 * actions (no hotkey) return an empty array.
 */
const actionKeys = (action: Action): (readonly string[])[] => {
  if (!action.hotkey) return [];
  const raw = Array.isArray(action.hotkey) ? action.hotkey : [action.hotkey];
  return raw.map((h) => formatHotkeyParts(h as HotkeyMatcher));
};

export const HelpDialog = ({
  registry = defaultActionRegistry,
  open,
  onClose,
  title = "Keyboard shortcuts",
  extraSections,
}: HelpDialogProps): ReactElement | null => {
  // Esc / focus-trap / backdrop dismiss live on the base Modal.
  const sections = useMemo<HelpSection[]>(() => {
    const byCategory = new Map<ActionCategory, HelpRow[]>();
    for (const action of registry.getAll()) {
      if (!action.label) continue;
      const cat = action.category ?? "other";
      const list = byCategory.get(cat) ?? [];
      list.push({ label: action.label, keys: actionKeys(action) });
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

  const modalStyle: CSSProperties = {
    maxWidth: HELP_DIALOG_MAX_WIDTH_PX,
    width: "calc(100vw - 64px)",
    display: "flex",
    flexDirection: "column",
  };
  const headerStyle: CSSProperties = {
    padding: "16px 20px",
    borderBottom: "1px solid var(--du-ui-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };
  const bodyStyle: CSSProperties = {
    padding: "16px 20px 20px",
    overflowY: "auto",
  };

  return (
    <Modal open={open} onClose={onClose} title={title} style={modalStyle}>
      <div>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="du-help-platform-badge">
              {isMac ? "macOS" : "Win / Linux"}
            </span>
            <button
              type="button"
              aria-label="Close help"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--du-text)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 4,
              }}
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div style={bodyStyle}>
          <div className="du-help-islands">
            {sections.map((section) => (
              <section key={section.title} className="du-help-island">
                <h3 className="du-help-island-title">{section.title}</h3>
                <div className="du-help-island-rows">
                  {section.rows.map((row) => (
                    <div key={row.label} className="du-help-row">
                      <span className="du-help-row-label">{row.label}</span>
                      <ShortcutKeys combos={row.keys} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

/**
 * Render N alternative key combinations joined with "or". Each key
 * renders as its own pill `<kbd>` chip.
 */
const ShortcutKeys = ({ combos }: { readonly combos: readonly (readonly string[])[] }) => {
  if (combos.length === 0) {
    return <span className="du-help-keys-separator">—</span>;
  }
  return (
    <span className="du-help-keys">
      {combos.map((combo, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="du-help-keys-separator">or</span> : null}
          {combo.map((part, j) => (
            <kbd key={j} className="du-help-key">
              {part}
            </kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
};
