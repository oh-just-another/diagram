import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Composable top-left dropdown menu. The root `<MainMenu>` renders a
 * "hamburger" button; clicking it opens a panel populated by the
 * children — usually `MainMenu.Item`, `MainMenu.ItemLink`,
 * `MainMenu.Separator`, `MainMenu.Group`. Hosts compose freely:
 *
 *   <MainMenu>
 *     <MainMenu.Item onClick={save}>Save</MainMenu.Item>
 *     <MainMenu.Separator />
 *     <MainMenu.Group title="Theme">
 *       <MainMenu.Item onClick={() => setTheme("light")}>Light</MainMenu.Item>
 *       <MainMenu.Item onClick={() => setTheme("dark")}>Dark</MainMenu.Item>
 *     </MainMenu.Group>
 *   </MainMenu>
 *
 * Closes on Esc / click-outside.
 */

interface MenuContext {
  readonly close: () => void;
}

const Ctx = createContext<MenuContext | null>(null);

const useMenuCtx = (): MenuContext => {
  const ctx = useContext(Ctx);
  return ctx ?? { close: () => {} };
};

export interface MainMenuProps {
  readonly children: ReactNode;
  /** Label / icon for the trigger button. Default "≡". */
  readonly trigger?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const MainMenu = ({
  children,
  trigger = "≡",
  className,
  style,
}: MainMenuProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (ev: MouseEvent | PointerEvent): void => {
      if (!ref.current) return;
      if (ref.current.contains(ev.target as Node)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") setOpen(false);
    };
    // Listen on both `mousedown` and `pointerdown`. The canvas surface
    // captures pointer events; `mousedown` still fires on the document,
    // but for some touch / pen interactions only `pointerdown` does.
    // Subscribing to both closes the menu reliably for every input type.
    window.addEventListener("mousedown", onDown);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const containerStyle: CSSProperties = {
    position: "relative",
    display: "inline-block",
    ...style,
  };

  const triggerStyle: CSSProperties = {
    background: open ? "var(--accent, #1a73e8)" : "var(--button-bg, #2a2a2a)",
    color: open ? "var(--surface, #fff)" : "var(--text, #ddd)",
    border: `1px solid ${open ? "var(--accent, #1a73e8)" : "var(--border, #3a3a3a)"}`,
    borderRadius: 4,
    padding: "6px 12px",
    cursor: "pointer",
    font: "inherit",
    fontSize: 14,
  };

  const panelStyle: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    minWidth: 200,
    background: "var(--panel, #1a1a1a)",
    color: "var(--text, #ddd)",
    border: "1px solid var(--border, #2a2a2a)",
    borderRadius: 6,
    boxShadow: "0 6px 18px rgba(0, 0, 0, 0.35)",
    padding: 4,
    zIndex: 900,
  };

  return (
    <div ref={ref} className={className} style={containerStyle}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((p) => !p)}
        style={triggerStyle}
      >
        {trigger}
      </button>
      {open ? (
        <div id={menuId} role="menu" style={panelStyle}>
          <Ctx.Provider value={{ close }}>{children}</Ctx.Provider>
        </div>
      ) : null}
    </div>
  );
};

const itemBase: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  color: "inherit",
  border: "none",
  borderRadius: 4,
  padding: "6px 10px",
  font: "inherit",
  fontSize: 13,
  cursor: "pointer",
};

const itemHoverable = (extra?: CSSProperties): CSSProperties => ({
  ...itemBase,
  ...extra,
});

export interface MainMenuItemProps {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  /**
   * Shows a leading checkmark — used by submenu items that act as a
   * radio group (theme switcher, language switcher, etc.) to signal
   * which option is currently active.
   */
  readonly active?: boolean;
}

const Item = ({ children, onClick, shortcut, disabled, active }: MainMenuItemProps) => {
  const { close } = useMenuCtx();
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick?.();
        close();
      }}
      style={{
        ...itemHoverable(),
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden
          style={{
            width: 14,
            display: "inline-block",
            color: "var(--du-accent, #1a73e8)",
          }}
        >
          {active ? "✓" : ""}
        </span>
        {children}
      </span>
      {shortcut ? (
        <span style={{ color: "var(--muted, #888)", fontSize: 11 }}>{shortcut}</span>
      ) : null}
    </button>
  );
};

export interface MainMenuItemLinkProps {
  readonly children: ReactNode;
  readonly href: string;
  readonly external?: boolean;
}

const ItemLink = ({ children, href, external }: MainMenuItemLinkProps) => {
  const { close } = useMenuCtx();
  return (
    <a
      role="menuitem"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
      onClick={close}
      style={{
        ...itemHoverable({ textDecoration: "none" }),
        color: "var(--text, #ddd)",
      }}
    >
      {children}
    </a>
  );
};

const Separator = () => (
  <hr
    style={{
      margin: "4px 6px",
      border: "none",
      borderTop: "1px solid var(--border, #2a2a2a)",
    }}
  />
);

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <div
      style={{
        padding: "6px 10px 2px",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "var(--muted, #888)",
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

MainMenu.Item = Item;
MainMenu.ItemLink = ItemLink;
MainMenu.Separator = Separator;
MainMenu.Group = Group;
