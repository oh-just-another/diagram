import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { MENU_VIEWPORT_PADDING_PX, MARK_ICON } from "../core/constants.js";
import { cssPx } from "../primitives/css-var.js";
import { floatPanel } from "../primitives/float-panel.js";
import type { Vec2 } from "@oh-just-another/types";
import type { Editor } from "@oh-just-another/state";
import {
  defaultActionRegistry,
  formatHotkey,
  type HotkeyMatcher,
  type WheelMode,
} from "@oh-just-another/state";
import { useDiagramOptional } from "../core/hooks.js";
import { useContextMenuController } from "./context-menu-controller.js";
import { usePortalContainer } from "../core/portal-container.js";

/**
 * Declarative menu entry. `divider` paints a separator; everything else
 * is a clickable row.
 *
 * The `visible` / `disabled` predicates run against the *current* editor
 * snapshot when the menu opens. They can read selection, mode, history
 * state, anything on the editor.
 */
export type ContextMenuItem =
  | { readonly kind: "divider" }
  | {
      readonly kind: "action";
      readonly id: string;
      readonly label: ReactNode;
      readonly shortcut?: string;
      readonly visible?: (editor: Editor, ctx: ContextMenuContext) => boolean;
      readonly disabled?: (editor: Editor, ctx: ContextMenuContext) => boolean;
      /** Toggle / radio row: renders a check mark in the leading gutter when `true`. */
      readonly checked?: (editor: Editor, ctx: ContextMenuContext) => boolean;
      readonly onClick: (editor: Editor, ctx: ContextMenuContext) => void;
    }
  | {
      /**
       * Nested group: a row that opens `items` in a child panel beside it
       * (hover or click). Hidden when none of its items is visible.
       */
      readonly kind: "submenu";
      readonly id: string;
      readonly label: ReactNode;
      readonly items: readonly ContextMenuItem[];
      readonly visible?: (editor: Editor, ctx: ContextMenuContext) => boolean;
    };

/** Per-open snapshot the menu hands to predicates and click handlers. */
export interface ContextMenuContext {
  /** World-space pointer position where the menu opened. */
  readonly worldPoint: Vec2;
  /** Screen-space pointer position (CSS pixels). */
  readonly screenPoint: Vec2;
}

interface OpenState {
  readonly screenPoint: Vec2;
  readonly worldPoint: Vec2;
}

/**
 * Render-prop helper that listens for `contextmenu` on the wrapped
 * element, opens a positioned menu, and dispatches the chosen item's
 * `onClick` against the live editor. Drop it as a sibling of the canvas
 * surface inside `<DiagramRoot>`.
 */
export interface ContextMenuProps {
  readonly items: readonly ContextMenuItem[];
  readonly style?: CSSProperties;
  readonly className?: string;
}

export const ContextMenu = ({ items, style, className }: ContextMenuProps) => {
  const editor = useDiagramOptional();
  const controller = useContextMenuController();
  const portalContainer = usePortalContainer();
  const [open, setOpen] = useState<OpenState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Every open panel (root + submenus, each in its own portal) — a press
  // inside any of them is "inside the menu" for the dismiss listener.
  const panelsRef = useRef(new Set<HTMLElement>());

  // Register an imperative opener so UI outside the canvas (e.g. the
  // "⋯" button in the selection floating panel) can open this same
  // menu at a chosen point.
  useEffect(() => {
    if (!controller) return undefined;
    return controller.register(({ screenPoint, worldPoint }) => {
      setOpen({ screenPoint, worldPoint });
    });
  }, [controller]);

  // Open the menu from the editor's single gesture channel: `onLongPress`
  // fires for a clean right-click (Editor.endPanGesture) AND for touch
  // long-press, scoped to the editor host by the pointer-binding. We do NOT
  // attach our own `contextmenu` DOM listener — a document/window-level one
  // opens the menu (and preventDefault's the native one) for right-clicks
  // anywhere on the page, which is wrong when the editor is embedded in a
  // larger document. Coords arrive host-relative; convert to viewport for
  // fixed-position placement.
  useEffect(() => {
    if (!editor) return undefined;
    return editor.onLongPress(({ screenPoint, worldPoint }) => {
      const rect = editor.hostElement.getBoundingClientRect();
      setOpen({
        screenPoint: { x: screenPoint.x + rect.left, y: screenPoint.y + rect.top },
        worldPoint,
      });
    });
  }, [editor]);

  // Dismiss on click outside / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (ev: PointerEvent): void => {
      const t = ev.target as Node;
      for (const panel of panelsRef.current) if (panel.contains(t)) return;
      setOpen(null);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") setOpen(null);
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(null);
  }, []);

  // Anchor the panel at the press point but keep it inside the WINDOW:
  // flip above the point when there is no room below, shift along the
  // edges by `MENU_VIEWPORT_PADDING_PX`, and cap the height (scrolling)
  // when the window is shorter than the menu. The viewport is the bound —
  // an embedded canvas may be overhung, like the floating toolbars do.
  useLayoutEffect(() => {
    const panel = menuRef.current;
    if (!open || !panel) return undefined;
    const { x, y } = open.screenPoint;
    const anchor = {
      getBoundingClientRect: () => ({
        x,
        y,
        width: 0,
        height: 0,
        top: y,
        left: x,
        right: x,
        bottom: y,
      }),
    };
    panelsRef.current.add(panel);
    const stop = floatPanel(anchor, panel, {
      placement: "bottom-start",
      padding: MENU_VIEWPORT_PADDING_PX,
      strategy: "fixed",
      clampHeight: true,
    });
    return () => {
      stop();
      panelsRef.current.delete(panel);
    };
  }, [open]);

  if (!editor || !open) return null;

  const ctx: ContextMenuContext = {
    worldPoint: open.worldPoint,
    screenPoint: open.screenPoint,
  };

  // Filter visibility once per open — items that compute `visible` against
  // the editor still see a consistent snapshot.
  const cleanedItems = resolveItems(items, editor, ctx);
  if (cleanedItems.length === 0) return null;

  // Portal into the themed container so the menu inherits the app theme — when
  // rendered inline it can escape the editor root and pick up the stylesheet's
  // OS `prefers-color-scheme` fallback instead. Fallbacks forward to the `--du-*`
  // theme chain (light-leaning) so it never defaults to a dark surface.
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={`du-menu-panel${className ? ` ${className}` : ""}`}
      style={{
        // `transform` is set by `floatPanel`; the pre-position paint at
        // (0,0) lasts one layout pass.
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: "var(--du-z-context-menu, 1700)",
        ...style,
      }}
    >
      <MenuRows
        items={cleanedItems}
        editor={editor}
        ctx={ctx}
        close={close}
        panels={panelsRef.current}
      />
    </div>,
    portalContainer,
  );
};

/**
 * Panel padding (`--du-menu-pad`, 6) + border (1): offset so a submenu's
 * first row aligns with its parent row. Chrome itself comes from the
 * shared `.du-menu-panel` / `.du-menu-row` classes (styles.css).
 */
/**
 * Submenu geometry read from the live panel so it follows the CSS tokens:
 * `align` = padding + border (undone on the cross axis so the first child
 * row lines up with its parent row), `gap` = the same clearance plus
 * `--du-submenu-gap` on the main axis.
 */
const submenuGeometry = (panel: HTMLElement): { align: number; gap: number } => {
  const cs = getComputedStyle(panel);
  const align = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
  return { align, gap: align + cssPx(panel, "--du-submenu-gap") };
};

/**
 * Drop hidden items (recursively — a submenu with nothing visible goes too),
 * then collapse adjacent / leading / trailing dividers.
 */
const resolveItems = (
  items: readonly ContextMenuItem[],
  editor: Editor,
  ctx: ContextMenuContext,
): readonly ContextMenuItem[] => {
  const visible: ContextMenuItem[] = [];
  for (const item of items) {
    if (item.kind === "divider") {
      visible.push(item);
    } else if (item.kind === "submenu") {
      if (item.visible?.(editor, ctx) === false) continue;
      const nested = resolveItems(item.items, editor, ctx);
      if (nested.length > 0) visible.push({ ...item, items: nested });
    } else if (item.visible?.(editor, ctx) !== false) {
      visible.push(item);
    }
  }
  return collapseDividers(visible);
};

/**
 * One panel's rows. At most one submenu per level is open — hovering any
 * row (action or submenu) makes it the active one, so moving the pointer
 * to a sibling closes the previous child panel; moving into the child
 * panel itself keeps it (it is not a sibling row).
 */
const MenuRows = ({
  items,
  editor,
  ctx,
  close,
  panels,
}: {
  readonly items: readonly ContextMenuItem[];
  readonly editor: Editor;
  readonly ctx: ContextMenuContext;
  readonly close: () => void;
  readonly panels: Set<HTMLElement>;
}) => {
  const [openId, setOpenId] = useState<string | null>(null);
  // Reserve the leading gutter only when this panel has check rows — a
  // plain list keeps its labels flush with the panel edge.
  const gutter = items.some((item) => item.kind === "action" && item.checked !== undefined);
  return (
    <>
      {items.map((item, i) =>
        item.kind === "divider" ? (
          <hr key={`d-${i}`} className="du-menu-sep" />
        ) : item.kind === "submenu" ? (
          <ContextSubmenuRow
            key={item.id}
            item={item}
            editor={editor}
            ctx={ctx}
            close={close}
            panels={panels}
            gutter={gutter}
            open={openId === item.id}
            onOpen={() => {
              setOpenId(item.id);
            }}
            onToggle={() => {
              setOpenId((cur) => (cur === item.id ? null : item.id));
            }}
          />
        ) : (
          <ContextMenuRow
            key={item.id}
            item={item}
            editor={editor}
            ctx={ctx}
            gutter={gutter}
            onHover={() => {
              setOpenId(null);
            }}
            onActivate={() => {
              close();
              item.onClick(editor, ctx);
            }}
          />
        ),
      )}
    </>
  );
};

/**
 * Submenu row: hovering (or clicking) opens the child panel beside the row
 * — to the right by default, to the left when the right side has no room,
 * shifted / height-capped like the root panel. The child renders in its
 * own portal (a scrolling parent would clip it) and registers itself with
 * `panels` so outside-click dismissal treats it as part of the menu.
 */
const ContextSubmenuRow = ({
  item,
  editor,
  ctx,
  close,
  panels,
  gutter,
  open,
  onOpen,
  onToggle,
}: {
  readonly item: Extract<ContextMenuItem, { kind: "submenu" }>;
  readonly editor: Editor;
  readonly ctx: ContextMenuContext;
  readonly close: () => void;
  readonly panels: Set<HTMLElement>;
  readonly gutter: boolean;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onToggle: () => void;
}) => {
  const portalContainer = usePortalContainer();
  const rowRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    const panel = panelRef.current;
    if (!open || !row || !panel) return undefined;
    panels.add(panel);
    const { align, gap } = submenuGeometry(panel);
    const stop = floatPanel(row, panel, {
      placement: "right-start",
      fallbackPlacements: ["left-start"],
      gap,
      crossAxis: -align,
      padding: MENU_VIEWPORT_PADDING_PX,
      strategy: "fixed",
      clampHeight: true,
    });
    return () => {
      stop();
      panels.delete(panel);
    };
  }, [open, panels]);
  return (
    <>
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={onOpen}
        onClick={(ev) => {
          ev.stopPropagation();
          onToggle();
        }}
        className={`du-menu-row${open ? " is-open" : ""}`}
      >
        <span className="du-menu-row-main">
          {gutter ? <span aria-hidden className="du-menu-gutter" /> : null}
          <span>{item.label}</span>
        </span>
        <span aria-hidden className="du-menu-shortcut">
          ›
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={typeof item.label === "string" ? item.label : undefined}
              className="du-menu-panel"
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: "calc(var(--du-z-context-menu, 1700) + 1)",
              }}
            >
              <MenuRows
                items={item.items}
                editor={editor}
                ctx={ctx}
                close={close}
                panels={panels}
              />
            </div>,
            portalContainer,
          )
        : null}
    </>
  );
};

const ContextMenuRow = ({
  item,
  editor,
  ctx,
  gutter,
  onHover,
  onActivate,
}: {
  readonly item: Extract<ContextMenuItem, { kind: "action" }>;
  readonly editor: Editor;
  readonly ctx: ContextMenuContext;
  readonly gutter: boolean;
  readonly onHover: () => void;
  readonly onActivate: () => void;
}) => {
  const disabled = item.disabled?.(editor, ctx) ?? false;
  const checked = item.checked?.(editor, ctx) ?? false;
  const handle = (ev: ReactMouseEvent): void => {
    if (disabled) {
      ev.preventDefault();
      return;
    }
    ev.stopPropagation();
    onActivate();
  };
  return (
    <button
      type="button"
      role={item.checked ? "menuitemcheckbox" : "menuitem"}
      {...(item.checked ? { "aria-checked": checked } : {})}
      onClick={handle}
      disabled={disabled}
      className="du-menu-row"
      onMouseEnter={onHover}
    >
      <span className="du-menu-row-main">
        {gutter ? (
          <span aria-hidden className="du-menu-gutter is-accent">
            {checked ? <Check {...MARK_ICON} /> : ""}
          </span>
        ) : null}
        <span>{item.label}</span>
      </span>
      {item.shortcut ? <span className="du-menu-shortcut">{item.shortcut}</span> : null}
    </button>
  );
};

const collapseDividers = (items: readonly ContextMenuItem[]): readonly ContextMenuItem[] => {
  const out: ContextMenuItem[] = [];
  for (const item of items) {
    if (item.kind === "divider") {
      if (out.length === 0) continue;
      const last = out[out.length - 1];
      if (last?.kind === "divider") continue;
    }
    out.push(item);
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last?.kind !== "divider") break;
    out.pop();
  }
  return out;
};

/**
 * Build a context-menu row from a registered action: label, shortcut (from
 * the action's hotkey, platform-correct), visibility (the action's
 * `predicate`) and click (dispatch) all come from the registry. Position-/
 * DOM-dependent menu items (annotations, add-comment, move-to-layer) can't be
 * registry actions (the action context carries no world point) and stay
 * inline below.
 *
 * `opts.label` / `opts.visible` override when the menu needs different
 * text or visibility than the action's defaults (e.g. z-order entries
 * shown only for a single selection).
 */
/**
 * Confirm-then-wipe the whole canvas. Destructive and not undoable (it clears
 * history), so it always asks first. Shared by the right-click entry and the
 * `clear-canvas` shortcut.
 */
export const clearCanvasWithConfirm = (editor: Editor): void => {
  if (window.confirm("Clear the canvas? Every shape is removed and this can't be undone.")) {
    editor.clear();
  }
};

const actionMenuItem = (
  actionId: string,
  opts?: {
    readonly label?: ReactNode;
    readonly visible?: (editor: Editor, ctx: ContextMenuContext) => boolean;
    readonly checked?: (editor: Editor, ctx: ContextMenuContext) => boolean;
  },
): ContextMenuItem => {
  const action = defaultActionRegistry.get(actionId);
  const pred = action?.predicate;
  const matchers: readonly HotkeyMatcher[] = !action?.hotkey
    ? []
    : Array.isArray(action.hotkey)
      ? action.hotkey
      : [action.hotkey];
  const first = matchers[0];
  const baseVisible = opts?.visible ?? (pred ? (editor: Editor) => pred({ editor }) : undefined);
  // In read-only / view mode only `viewMode`-flagged actions (zoom / select /
  // copy) stay in the menu — every mutating entry is hidden, mirroring the
  // hotkey gate (`isReadOnlyBlocked`) so panel and keyboard agree.
  const visible = (editor: Editor, ctx: ContextMenuContext): boolean =>
    (!editor.readOnly || action?.viewMode === true) && (baseVisible?.(editor, ctx) ?? true);
  return {
    kind: "action",
    id: actionId,
    label: opts?.label ?? action?.label ?? actionId,
    ...(first ? { shortcut: formatHotkey(first) } : {}),
    visible,
    ...(opts?.checked ? { checked: opts.checked } : {}),
    onClick: (editor: Editor) => {
      defaultActionRegistry.dispatch(actionId, { editor });
    },
  };
};

/**
 * "Canvas" context: the right-click landed on empty canvas (the press
 * routing has already cleared the selection) and not on an annotation pin.
 * Canvas-only entries (add text / sticky, start view, grid & snap toggles,
 * wheel mode, show all) are gated on this.
 */
const onCanvas = (e: Editor, ctx: ContextMenuContext): boolean =>
  e.selection.size === 0 && e.selectedLinks.size === 0 && e.hitAnnotation(ctx.worldPoint) === null;

const WHEEL_MODES: readonly { readonly mode: WheelMode; readonly label: string }[] = [
  { mode: "auto", label: "Auto-detect" },
  { mode: "mouse", label: "Mouse" },
  { mode: "trackpad", label: "Trackpad" },
];

/** Toggle row bound to one boolean editor preference. */
const preferenceToggle = (
  key: "snapObjects" | "showObjectSize" | "suggestObjectSize",
  label: string,
): ContextMenuItem => ({
  kind: "action",
  id: key,
  label,
  visible: onCanvas,
  checked: (e) => e.preferences[key],
  onClick: (e) => {
    e.setPreferences({ [key]: !e.preferences[key] });
  },
});

export const DEFAULT_CONTEXT_MENU: readonly ContextMenuItem[] = [
  // --- Clipboard / duplication ---
  actionMenuItem("copy"),
  actionMenuItem("cut"),
  actionMenuItem("paste"),
  actionMenuItem("duplicate-selection", { label: "Duplicate" }),
  {
    kind: "action",
    id: "unlock-all",
    label: "Unlock all",
    visible: (e, ctx) =>
      !e.readOnly &&
      onCanvas(e, ctx) &&
      [...e.scene.elements.values()].some((s) => s.locked === true),
    onClick: (e) => {
      e.unlockAll();
    },
  },
  { kind: "divider" },
  // Clipboard copies of the selection as an asset. The actions are
  // registered by the host package (`@oh-just-another/editor`); the rows
  // hide when the host didn't register them.
  ...(["copy-as-png", "copy-as-svg", "copy-as-text"] as const).map((id) =>
    actionMenuItem(id, {
      label:
        id === "copy-as-png"
          ? "Copy as PNG"
          : id === "copy-as-svg"
            ? "Copy as SVG"
            : "Copy as text",
      visible: (e) => e.selection.size > 0 && defaultActionRegistry.get(id) !== undefined,
    }),
  ),
  { kind: "divider" },
  actionMenuItem("copy-style", { label: "Copy style" }),
  actionMenuItem("paste-style", { label: "Paste style" }),
  { kind: "divider" },
  // --- Comments (annotation-pin ops win when the click hit a pin) ---
  {
    kind: "action",
    id: "open-thread",
    label: "Open thread",
    visible: (e, ctx) => e.hitAnnotation(ctx.worldPoint) !== null,
    onClick: (e, ctx) => {
      const ann = e.hitAnnotation(ctx.worldPoint);
      if (ann) e.setSelectedAnnotation(ann);
    },
  },
  {
    kind: "action",
    id: "resolve-annotation",
    label: "Toggle resolved",
    visible: (e, ctx) => e.hitAnnotation(ctx.worldPoint) !== null,
    onClick: (e, ctx) => {
      const ann = e.hitAnnotation(ctx.worldPoint);
      if (ann) e.toggleAnnotationResolved(ann);
    },
  },
  {
    kind: "action",
    id: "remove-annotation",
    label: "Delete annotation",
    visible: (e, ctx) => e.hitAnnotation(ctx.worldPoint) !== null,
    onClick: (e, ctx) => {
      const ann = e.hitAnnotation(ctx.worldPoint);
      if (ann) e.removeAnnotation(ann);
    },
  },
  {
    kind: "action",
    id: "add-text",
    label: "Add text",
    visible: (e, ctx) => !e.readOnly && onCanvas(e, ctx),
    onClick: (e, ctx) => {
      e.createTextAt(ctx.worldPoint);
    },
  },
  {
    kind: "action",
    id: "add-sticky",
    label: "Add sticky note",
    visible: (e, ctx) => !e.readOnly && onCanvas(e, ctx),
    onClick: (e, ctx) => {
      e.createStickyAt(ctx.worldPoint);
    },
  },
  {
    kind: "action",
    id: "add-comment",
    label: "Add comment",
    visible: (e, ctx) => e.hitAnnotation(ctx.worldPoint) === null,
    onClick: (e, ctx) => {
      const elementUnder = [...e.scene.elements.values()].reverse().find((s) => {
        const pos = s.position;
        const w = "width" in s && typeof s.width === "number" ? s.width : 0;
        const h = "height" in s && typeof s.height === "number" ? s.height : 0;
        return (
          ctx.worldPoint.x >= pos.x &&
          ctx.worldPoint.y >= pos.y &&
          ctx.worldPoint.x <= pos.x + w &&
          ctx.worldPoint.y <= pos.y + h
        );
      });
      const position = elementUnder
        ? {
            x: ctx.worldPoint.x - elementUnder.position.x,
            y: ctx.worldPoint.y - elementUnder.position.y,
          }
        : ctx.worldPoint;
      e.addAnnotation({ position, elementId: elementUnder?.id ?? null });
    },
  },
  { kind: "divider" },
  // --- Canvas: start view ---
  {
    kind: "action",
    id: "go-to-start-view",
    label: "Set start view",
    visible: (e, ctx) => onCanvas(e, ctx) && e.startView !== null,
    onClick: (e) => {
      e.goToStartView();
    },
  },
  {
    kind: "action",
    id: "set-current-view-as-start",
    label: "Set current view as start",
    visible: (e, ctx) => !e.readOnly && onCanvas(e, ctx),
    onClick: (e) => {
      e.setCurrentViewAsStart();
    },
  },
  { kind: "divider" },
  // --- Canvas: grid, snapping and size assists (check rows) ---
  actionMenuItem("toggle-grid", {
    label: "Show grid",
    visible: onCanvas,
    checked: (e) => e.gridEnabled,
  }),
  {
    kind: "action",
    id: "snap-to-grid",
    label: "Snap to grid",
    visible: onCanvas,
    checked: (e) => e.gridEnabled && e.snapToGridEnabled,
    onClick: (e) => {
      // Snapping needs a visible grid: enabling it also shows the grid.
      const next = !(e.gridEnabled && e.snapToGridEnabled);
      if (next && !e.gridEnabled) e.setGridVisible(true);
      e.setSnapToGrid(next);
    },
  },
  preferenceToggle("snapObjects", "Snap objects"),
  preferenceToggle("showObjectSize", "Show object size"),
  preferenceToggle("suggestObjectSize", "Suggest object size"),
  { kind: "divider" },
  // --- Canvas: wheel routing (radio submenu) + show all ---
  {
    kind: "submenu",
    id: "wheel-mode",
    label: "Mouse or trackpad",
    visible: onCanvas,
    items: WHEEL_MODES.map(({ mode, label }) => ({
      kind: "action",
      id: `wheel-mode-${mode}`,
      label,
      checked: (e) => e.preferences.wheelMode === mode,
      onClick: (e) => {
        e.setPreferences({ wheelMode: mode });
      },
    })),
  },
  actionMenuItem("zoom-to-fit", {
    label: "Show all",
    visible: (e, ctx) => onCanvas(e, ctx) && e.scene.elements.size > 0,
  }),
  { kind: "divider" },
  // --- Arrange / Align / Layout submenus + layers ---
  // Arrange: stacking order and mirroring.
  {
    kind: "submenu",
    id: "arrange",
    label: "Arrange",
    items: [
      actionMenuItem("bring-to-front", { visible: (e) => e.selection.size === 1 }),
      actionMenuItem("bring-forward", {
        label: "Bring forward",
        visible: (e) => e.selection.size === 1,
      }),
      actionMenuItem("send-backward", {
        label: "Send backward",
        visible: (e) => e.selection.size === 1,
      }),
      actionMenuItem("send-to-back", { visible: (e) => e.selection.size === 1 }),
      { kind: "divider" },
      actionMenuItem("flip-horizontal", { label: "Flip horizontal" }),
      actionMenuItem("flip-vertical", { label: "Flip vertical" }),
    ],
  },
  // Align: edge / centre alignment (2+), then even spacing (3+).
  {
    kind: "submenu",
    id: "align",
    label: "Align",
    items: [
      actionMenuItem("align-left", { label: "Align left" }),
      actionMenuItem("align-h-center", { label: "Align horizontal centres" }),
      actionMenuItem("align-right", { label: "Align right" }),
      { kind: "divider" },
      actionMenuItem("align-top", { label: "Align top" }),
      actionMenuItem("align-v-center", { label: "Align vertical centres" }),
      actionMenuItem("align-bottom", { label: "Align bottom" }),
      { kind: "divider" },
      actionMenuItem("distribute-horizontal", { label: "Distribute horizontally" }),
      actionMenuItem("distribute-vertical", { label: "Distribute vertically" }),
    ],
  },
  // Layout: re-place the selection as a whole (grid / stacks / container).
  {
    kind: "submenu",
    id: "layout",
    label: "Layout",
    items: [
      actionMenuItem("arrange-grid"),
      actionMenuItem("arrange-stack-h"),
      actionMenuItem("arrange-stack-v"),
      { kind: "divider" },
      actionMenuItem("auto-arrange"),
    ],
  },
  {
    kind: "action",
    id: "move-to-layer",
    label: "Move to layer…",
    visible: (e) => !e.readOnly && e.selection.size > 0 && e.scene.layers.size > 1,
    onClick: (e) => {
      if (typeof window === "undefined") return;
      const layers = [...e.scene.layers.values()];
      const names = layers.map((l, i) => `${i + 1}. ${l.name}`).join("\n");
      const choice = window.prompt(`Move selection to layer (1-${layers.length}):\n${names}`);
      if (!choice) return;
      const idx = parseInt(choice, 10) - 1;
      const target = layers[idx];
      if (target) e.moveSelectionToLayer(target.id);
    },
  },
  { kind: "divider" },
  // --- Selection / grouping ---
  actionMenuItem("select-all"),
  actionMenuItem("group-selection", { label: "Group" }),
  actionMenuItem("ungroup-selection", { label: "Ungroup" }),
  { kind: "divider" },
  // --- Lock ---
  actionMenuItem("toggle-lock", { label: "Lock" }),
  // Locked shapes are click-through, so the regular selection path can't
  // reach them — Unlock resolves the shape under the right-click point via
  // the dedicated locked-aware lookup instead.
  {
    kind: "action",
    id: "unlock-element",
    label: "Unlock",
    visible: (e, ctx) => !e.readOnly && e.lockedElementAt(ctx.worldPoint) !== null,
    onClick: (e, ctx) => {
      const shape = e.lockedElementAt(ctx.worldPoint);
      if (shape) e.unlockElement(shape.id);
    },
  },
  { kind: "divider" },
  // --- Delete last. Viewport (zoom) and clear-canvas are NOT here: the
  //     static zoom bar / main menu already carry them. ---
  actionMenuItem("delete-selection", { label: "Delete" }),
];
