import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * First-run overlay shown until the user makes a selection / draws
 * a shape / explicitly dismisses. Mounted over the canvas so it
 * doesn't displace toolbars. standard's WelcomeScreen is the
 * inspiration — keep this minimal and let hosts override `children`
 * for branded onboarding.
 *
 * Dismiss behaviour:
 *   - Click anywhere on the overlay → hide.
 *   - Press Esc → hide.
 *   - `localStorage` key (configurable) — once dismissed, stays
 *     dismissed across reloads.
 */

export interface WelcomeScreenProps {
  /**
   * Persisted dismissal key. When this key exists in `localStorage`
   * the component renders nothing on mount. Default
   * `"oh-just-another-welcome-dismissed"`.
   */
  readonly storageKey?: string;
  /** Optional custom body — defaults to a generic hint list. */
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
}

const DEFAULT_KEY = "oh-just-another-welcome-dismissed";

const readDismissed = (key: string): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return true;
  }
};

const persistDismissed = (key: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Ignore quota / private-mode errors — non-essential persistence.
  }
};

export const WelcomeScreen = ({
  storageKey = DEFAULT_KEY,
  children,
  style,
}: WelcomeScreenProps) => {
  const [hidden, setHidden] = useState<boolean>(() => readDismissed(storageKey));

  useEffect(() => {
    if (hidden) return undefined;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        setHidden(true);
        persistDismissed(storageKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, storageKey]);

  if (hidden) return null;

  const overlayStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.35)",
    pointerEvents: "auto",
    zIndex: 50,
    cursor: "pointer",
    ...style,
  };

  const cardStyle: CSSProperties = {
    maxWidth: 420,
    padding: "24px 28px",
    background: "var(--panel, #1a1a1a)",
    color: "var(--text, #ddd)",
    border: "1px solid var(--border, #2a2a2a)",
    borderRadius: 8,
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
    cursor: "default",
  };

  return (
    <div
      role="presentation"
      style={overlayStyle}
      onClick={() => {
        setHidden(true);
        persistDismissed(storageKey);
      }}
    >
      <div style={cardStyle} onClick={(ev) => ev.stopPropagation()}>
        {children ?? <DefaultWelcomeBody />}
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => {
              setHidden(true);
              persistDismissed(storageKey);
            }}
            style={{
              background: "var(--accent, #1a73e8)",
              color: "var(--surface, #fff)",
              border: "none",
              padding: "6px 14px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

const DefaultWelcomeBody = () => (
  <>
    <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Welcome</h2>
    <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.45 }}>
      Press <kbd>?</kbd> any time to see the keyboard shortcuts. Drag from the
      palette to drop a shape; press <kbd>R</kbd> / <kbd>E</kbd> /{" "}
      <kbd>L</kbd> / <kbd>F</kbd> to switch tools.
    </p>
    <ul
      style={{
        margin: 0,
        paddingLeft: 18,
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--muted, #aaa)",
      }}
    >
      <li>
        Drop an image file onto the canvas — appears as an{" "}
        <code>ImageShape</code>.
      </li>
      <li>Drag a "Frame" tool to wrap a region of shapes.</li>
      <li>Double-click a group to enter isolation; Esc exits.</li>
    </ul>
  </>
);
