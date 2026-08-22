import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Menu as MenuIcon } from "lucide-react";
import { Switch } from "../primitives/switch.js";
import { floatPanel } from "../primitives/float-panel.js";
import { cssPx } from "../primitives/css-var.js";
import { usePortalContainer } from "../core/portal-container.js";
import { MARK_ICON, MENU_VIEWPORT_PADDING_PX } from "../core/constants.js";

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

/**
 * Every open panel of one menu (root + nested), portaled to the portal
 * container so they stack above the UI layer (`--du-z-popover`) — the
 * click-outside handler treats a press inside any of them as "inside".
 */
const PanelsCtx = createContext<Set<HTMLElement> | null>(null);

/**
 * One panel's submenu coordinator: at most ONE submenu per level is open.
 * Hovering a submenu row opens it at once and closes the previous sibling
 * immediately (no overlapping panels); leaving a row / its panel, or
 * hovering a plain item, closes after `SUBMENU_CLOSE_DELAY_MS` so a
 * diagonal move into the child panel survives.
 */
interface LevelContext {
  readonly openId: string | null;
  readonly open: (id: string) => void;
  readonly toggle: (id: string) => void;
  readonly scheduleClose: (id: string) => void;
  readonly closeSoon: () => void;
  readonly cancelClose: () => void;
}
const LevelCtx = createContext<LevelContext | null>(null);

const SUBMENU_CLOSE_DELAY_MS = 120;

const MenuLevel = ({ children }: { readonly children: ReactNode }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const cancelClose = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const closeSoon = useCallback(() => {
    cancelClose();
    timer.current = window.setTimeout(() => {
      setOpenId(null);
      timer.current = null;
    }, SUBMENU_CLOSE_DELAY_MS);
  }, [cancelClose]);
  const scheduleClose = useCallback(
    (id: string) => {
      cancelClose();
      timer.current = window.setTimeout(() => {
        setOpenId((cur) => (cur === id ? null : cur));
        timer.current = null;
      }, SUBMENU_CLOSE_DELAY_MS);
    },
    [cancelClose],
  );
  const open = useCallback(
    (id: string) => {
      cancelClose();
      setOpenId(id);
    },
    [cancelClose],
  );
  const toggle = useCallback(
    (id: string) => {
      cancelClose();
      setOpenId((cur) => (cur === id ? null : id));
    },
    [cancelClose],
  );
  useEffect(() => cancelClose, [cancelClose]);
  const value = useMemo(
    () => ({ openId, open, toggle, scheduleClose, closeSoon, cancelClose }),
    [openId, open, toggle, scheduleClose, closeSoon, cancelClose],
  );
  return <LevelCtx.Provider value={value}>{children}</LevelCtx.Provider>;
};

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panels = useRef(new Set<HTMLElement>()).current;
  const portalContainer = usePortalContainer();
  const menuId = useId();

  // Float the panel off the trigger: clear the bar group's inset + border,
  // then keep `--du-flyout-gap` between the bar and the panel; flip / shift
  // inside the viewport like the context menu.
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!open || !trigger || !panel) return undefined;
    panels.add(panel);
    const gap = cssPx(panel, "--du-pad-sm") + 1 + cssPx(panel, "--du-flyout-gap");
    const stop = floatPanel(trigger, panel, {
      placement,
      gap,
      padding: MENU_VIEWPORT_PADDING_PX,
      strategy: "fixed",
      clampHeight: true,
    });
    return () => {
      stop();
      panels.delete(panel);
    };
  }, [open, placement, panels]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (ev: MouseEvent | PointerEvent): void => {
      const t = ev.target as Node;
      if (ref.current?.contains(t)) return;
      for (const panel of panels) if (panel.contains(t)) return;
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
  }, [open, panels]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const containerStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    ...style,
  };

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: "var(--du-z-popover)",
  };

  return (
    <div ref={ref} className={className} style={containerStyle}>
      <button
        ref={triggerRef}
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
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              role="menu"
              aria-label={ariaLabel}
              className="du-menu-panel"
              style={panelStyle}
            >
              <Ctx.Provider value={{ close }}>
                <PanelsCtx.Provider value={panels}>
                  <MenuLevel>{children}</MenuLevel>
                </PanelsCtx.Provider>
              </Ctx.Provider>
            </div>,
            portalContainer,
          )
        : null}
    </div>
  );
};

/** Gutter content: check mark when active, else the icon (or nothing). */
const Gutter = ({ active, icon }: { readonly active?: boolean; readonly icon?: ReactNode }) => (
  <span aria-hidden className={`du-menu-gutter${active ? " is-accent" : ""}`}>
    {active ? <Check {...MARK_ICON} /> : (icon ?? "")}
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
  /** Trailing content on the right (non-interactive); rendered instead of `shortcut`. */
  readonly trailing?: ReactNode;
  /**
   * On/off setting row: renders as `menuitemcheckbox` with a trailing
   * switch that mirrors `checked`. The row itself is the control —
   * `onClick` toggles the value — so the switch is decorative (nested
   * buttons are invalid HTML). Implies `keepOpen`.
   */
  readonly checked?: boolean;
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
  checked,
  keepOpen,
}: MainMenuItemProps) => {
  const { close } = useMenuCtx();
  const level = useContext(LevelCtx);
  const isCheckbox = checked !== undefined;
  return (
    <button
      type="button"
      role={isCheckbox ? "menuitemcheckbox" : "menuitem"}
      aria-checked={isCheckbox ? checked : undefined}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick?.();
        if (!keepOpen && !isCheckbox) close();
      }}
      onMouseEnter={() => level?.closeSoon()}
      className="du-menu-row"
    >
      <span className="du-menu-row-main">
        <Gutter active={active === true} icon={icon} />
        {children}
      </span>
      {isCheckbox ? (
        <Switch checked={checked} presentational />
      ) : (
        (trailing ?? (shortcut ? <span className="du-menu-shortcut">{shortcut}</span> : null))
      )}
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

export interface MainMenuSubmenuProps {
  readonly children: ReactNode;
  /** Trigger row label. Same render style as `MainMenu.Item`. */
  readonly label: ReactNode;
  /** Optional leading icon — same sizing rules as `MainMenu.Item`. */
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

const Submenu = ({ children, label, icon, disabled }: MainMenuSubmenuProps) => {
  const id = useId();
  const level = useContext(LevelCtx);
  const panels = useContext(PanelsCtx);
  const portalContainer = usePortalContainer();
  const open = level?.openId === id;
  const rowRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Beside the row (left when the right side has no room), first child row
  // aligned with this row: the cross-axis shift undoes the panel padding +
  // border, the main-axis gap clears the parent column and adds
  // `--du-submenu-gap`. Portaled like the root panel so it stacks above
  // the UI layer and is never clipped by a scrolling parent.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const panel = panelRef.current;
    if (!open || !row || !panel) return undefined;
    panels?.add(panel);
    const align = cssPx(panel, "--du-menu-pad") + 1;
    const stop = floatPanel(row, panel, {
      placement: "right-start",
      fallbackPlacements: ["left-start"],
      gap: align + cssPx(panel, "--du-submenu-gap"),
      crossAxis: -align,
      padding: MENU_VIEWPORT_PADDING_PX,
      strategy: "fixed",
      clampHeight: true,
    });
    return () => {
      stop();
      panels?.delete(panel);
    };
  }, [open, panels]);

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: "calc(var(--du-z-popover) + 1)",
  };

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={() => {
          if (disabled) return;
          level?.open(id);
        }}
        onMouseLeave={() => {
          level?.scheduleClose(id);
        }}
        onClick={() => {
          if (disabled) return;
          level?.toggle(id);
        }}
        className={`du-menu-row${open ? " is-open" : ""}`}
      >
        <span className="du-menu-row-main">
          <Gutter icon={icon} />
          {label}
        </span>
        <span className="du-menu-shortcut">
          <ChevronRight {...MARK_ICON} aria-hidden />
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              className="du-menu-panel du-menu-submenu"
              style={panelStyle}
              onMouseEnter={() => {
                level.cancelClose();
              }}
              onMouseLeave={() => {
                level.scheduleClose(id);
              }}
            >
              <MenuLevel>{children}</MenuLevel>
            </div>,
            portalContainer,
          )
        : null}
    </>
  );
};

MainMenu.Item = Item;
MainMenu.ItemLink = ItemLink;
MainMenu.Separator = Separator;
MainMenu.Group = Group;
MainMenu.Toggle = Toggle;
MainMenu.Submenu = Submenu;
