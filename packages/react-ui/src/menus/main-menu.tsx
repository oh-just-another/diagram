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
import { Check, ChevronRight, Menu as MenuIcon } from "lucide-react";

/** Pixel size for the trigger icon — matches the toolbar tool buttons. */
const TRIGGER_ICON_SIZE = 16;
const TRIGGER_ICON_STROKE = 1.75;

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
  return (
    ctx ?? {
      close: () => {
        /* no-op: fallback when used outside a MainMenu provider */
      },
    }
  );
};

export interface MainMenuProps {
  readonly children: ReactNode;
  /** Label / icon for the trigger button. Default "≡". */
  readonly trigger?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Accessible name + tooltip of the trigger button. Default `"Main menu"`. */
  readonly ariaLabel?: string;
  /** Class / style for the trigger button (default: flat icon button). */
  readonly triggerClassName?: string;
  readonly triggerStyle?: CSSProperties;
  /**
   * Where the panel opens relative to the trigger. `"bottom-start"`
   * (default) hangs below, left-aligned; `"top-end"` rises above,
   * right-aligned — for menus in a bottom bar.
   */
  readonly placement?: "bottom-start" | "top-end";
}

export const MainMenu = ({
  children,
  trigger = <MenuIcon size={TRIGGER_ICON_SIZE} strokeWidth={TRIGGER_ICON_STROKE} />,
  className,
  style,
  ariaLabel = "Main menu",
  triggerClassName,
  triggerStyle,
  placement = "bottom-start",
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

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const containerStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    ...style,
  };

  const panelStyle: CSSProperties = {
    position: "absolute",
    ...(placement === "top-end"
      ? { bottom: "calc(100% + 6px)", right: 0 }
      : { top: "calc(100% + 6px)", left: 0 }),
    zIndex: 900,
  };

  return (
    <div ref={ref} className={className} style={containerStyle}>
      <button
        type="button"
        className={`${triggerClassName ?? "du-icon-button du-icon-button-flat"}${open ? " is-active" : ""}`}
        style={triggerStyle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => {
          setOpen((p) => !p);
        }}
      >
        {trigger}
      </button>
      {open ? (
        <div id={menuId} role="menu" className="du-menu-panel" style={panelStyle}>
          <Ctx.Provider value={{ close }}>{children}</Ctx.Provider>
        </div>
      ) : null}
    </div>
  );
};

/** Gutter content: check mark when active, else the icon (or nothing). */
const Gutter = ({ active, icon }: { readonly active?: boolean; readonly icon?: ReactNode }) => (
  <span aria-hidden className={`du-menu-gutter${active ? " is-accent" : ""}`}>
    {active ? <Check size={14} strokeWidth={2.25} /> : (icon ?? "")}
  </span>
);

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
  /**
   * Optional leading icon rendered before the label. Sized to the same
   * 14×14 footprint as the active-check column so the columns stay
   * aligned across mixed icon / no-icon items.
   */
  readonly icon?: ReactNode;
  /** Trailing control on the right (e.g. a `Switch`); rendered instead of `shortcut`. */
  readonly trailing?: ReactNode;
  /**
   * Keep the menu open after a click — for checkbox-style items (export
   * content switches, etc.) where the user toggles several in a row.
   */
  readonly keepOpen?: boolean;
}

const Item = ({
  children,
  onClick,
  shortcut,
  disabled,
  active,
  icon,
  trailing,
  keepOpen,
}: MainMenuItemProps) => {
  const { close } = useMenuCtx();
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick?.();
        if (!keepOpen) close();
      }}
      className="du-menu-row"
    >
      <span className="du-menu-row-main">
        <Gutter active={active === true} icon={icon} />
        {children}
      </span>
      {trailing ?? (shortcut ? <span className="du-menu-shortcut">{shortcut}</span> : null)}
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
      className="du-menu-row"
      style={{ textDecoration: "none" }}
    >
      <span className="du-menu-row-main">
        <Gutter />
        {children}
      </span>
    </a>
  );
};

const Separator = () => <hr className="du-menu-sep" />;

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <div className="du-menu-group-title">{title}</div>
    {children}
  </div>
);

/**
 * Horizontal segmented control inside a menu — a theme / language
 * toggle. Renders `options` as a pill, highlighting the active one with
 * the accent colour. The menu stays open after a click so the user can
 * try several values without re-opening the dropdown.
 */
interface MainMenuToggleProps<T extends string> {
  readonly value: T;
  readonly onChange: (next: T) => void;
  readonly options: readonly { value: T; label: string; icon?: ReactNode }[];
}

const Toggle = <T extends string>({ value, onChange, options }: MainMenuToggleProps<T>) => {
  return (
    <div
      role="radiogroup"
      style={{
        display: "flex",
        margin: "var(--du-menu-sep) var(--du-menu-row-pad-x)",
        background: "var(--menu-divider, #2a2a2a)",
        borderRadius: 6,
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.label}
            aria-label={opt.label}
            onClick={() => {
              onChange(opt.value);
            }}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              minHeight: 26,
              padding: "0 8px",
              background: active ? "var(--menu-bg, #1a1a1a)" : "transparent",
              color: active ? "var(--text, #ddd)" : "var(--muted, #888)",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.15)" : "none",
              transition: "background 0.12s ease, color 0.12s ease",
            }}
          >
            {opt.icon ?? opt.label}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Nested submenu — opens a child panel to the right of the parent item
 * on hover (with a small close-delay so a mouse moving diagonally toward
 * the child doesn't accidentally collapse the panel). Also opens on
 * click for touch / keyboard activation.
 *
 * Children are typically `MainMenu.Item`s. The submenu inherits the
 * parent menu's `close()` context, so child item clicks collapse the
 * whole menu chain.
 *
 *   <MainMenu.Submenu icon={<Download/>} label="Export…">
 *     <MainMenu.Item onClick={exportPng}>PNG</MainMenu.Item>
 *     <MainMenu.Item onClick={exportSvg}>SVG</MainMenu.Item>
 *   </MainMenu.Submenu>
 *
 * Positioning is fixed to "right of trigger, top-aligned with the
 * trigger row".
 */
const SUBMENU_CLOSE_DELAY_MS = 120;

export interface MainMenuSubmenuProps {
  readonly children: ReactNode;
  /** Trigger row label. Same render style as `MainMenu.Item`. */
  readonly label: ReactNode;
  /** Optional leading icon — same sizing rules as `MainMenu.Item`. */
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

const Submenu = ({ children, label, icon, disabled }: MainMenuSubmenuProps) => {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const cancelClose = useCallback((): void => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback((): void => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, SUBMENU_CLOSE_DELAY_MS);
  }, [cancelClose]);

  // Clear a pending close-timer on unmount so it doesn't fire on a
  // detached component.
  useEffect(() => cancelClose, [cancelClose]);

  // `top` undoes the panel padding + border so the first child row aligns
  // with this row (see `--du-menu-pad`).
  const panelStyle: CSSProperties = {
    position: "absolute",
    top: "calc(-1 * var(--du-menu-pad) - 1px)",
    left: "100%",
    marginLeft: 4,
    zIndex: 1000,
  };

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => {
        if (disabled) return;
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          cancelClose();
          setOpen((p) => !p);
        }}
        className={`du-menu-row${open ? " is-open" : ""}`}
      >
        <span className="du-menu-row-main">
          <Gutter icon={icon} />
          {label}
        </span>
        <span className="du-menu-shortcut">
          <ChevronRight size={12} strokeWidth={2.25} aria-hidden />
        </span>
      </button>
      {open ? (
        <div role="menu" className="du-menu-panel" style={panelStyle}>
          {children}
        </div>
      ) : null}
    </div>
  );
};

MainMenu.Item = Item;
MainMenu.ItemLink = ItemLink;
MainMenu.Separator = Separator;
MainMenu.Group = Group;
MainMenu.Toggle = Toggle;
MainMenu.Submenu = Submenu;
