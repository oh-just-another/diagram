import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { defaultActionRegistry } from "@oh-just-another/state";

/**
 * Zen-mode state — a boolean flag plus setters. When on, the host chrome
 * (toolbar, top/bottom bars, side panels) hides so the canvas fills the
 * surface for focused work. Orthogonal to read-only: zen hides the UI,
 * read-only forbids edits — either can be on independently.
 */
export interface ZenModeApi {
  readonly zen: boolean;
  readonly setZen: (on: boolean) => void;
  readonly toggle: () => void;
}

const ZenModeContext = createContext<ZenModeApi | null>(null);

/**
 * Provides zen-mode state to descendants and wires its hotkeys. `⌥Z`
 * toggles; `Esc` exits (only while zen is active, so it doesn't swallow
 * Escape elsewhere). Registers the toggle on the shared action registry
 * (like the command palette) so it routes through hotkey dispatch and
 * shows in the help dialog; `viewMode` keeps it live in read-only.
 *
 * Wrap the editor chrome in this provider and read {@link useZenMode} in
 * the shell to hide UI when `zen` is true.
 */
export const ZenModeProvider = ({ children }: { readonly children: ReactNode }) => {
  const [zen, setZen] = useState(false);
  const toggle = useCallback(() => {
    setZen((v) => !v);
  }, []);

  useEffect(() => {
    defaultActionRegistry.replace({
      id: "toggle-zen-mode",
      label: "Zen mode",
      category: "other",
      viewMode: true,
      hotkey: { key: "z", alt: true },
      perform: () => {
        setZen((v) => !v);
      },
    });
    return () => {
      defaultActionRegistry.unregister("toggle-zen-mode");
    };
  }, []);

  // Escape leaves zen. Bound only while active so it never competes with
  // other Escape handlers (cancel gesture, clear selection) otherwise.
  useEffect(() => {
    if (!zen) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setZen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [zen]);

  const api = useMemo<ZenModeApi>(() => ({ zen, setZen, toggle }), [zen, toggle]);
  return <ZenModeContext.Provider value={api}>{children}</ZenModeContext.Provider>;
};

/** Read zen-mode state. Throws outside a {@link ZenModeProvider}. */
export const useZenMode = (): ZenModeApi => {
  const ctx = useContext(ZenModeContext);
  if (!ctx) {
    throw new Error("@oh-just-another/react-ui: useZenMode called outside <ZenModeProvider>.");
  }
  return ctx;
};

/** Forgiving variant — returns `null` when no {@link ZenModeProvider} is above. */
export const useZenModeOptional = (): ZenModeApi | null => useContext(ZenModeContext);
