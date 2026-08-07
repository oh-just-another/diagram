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
import { MENU_VIEWPORT_PADDING_PX } from "../core/constants.js";
import { floatPanel } from "../primitives/float-panel.js";
import type { Vec2 } from "@oh-just-another/types";
import type { Editor } from "@oh-just-another/state";
import { defaultActionRegistry, formatHotkey, type HotkeyMatcher } from "@oh-just-another/state";
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
      style={{
        ...MENU_PANEL_STYLE,
        // `transform` is set by `floatPanel`; the pre-position paint at
        // (0,0) lasts one layout pass.
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 1000,
        ...style,
      }}
      className={className}
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

/** Shared chrome for the root panel and every submenu panel. */
const MENU_PANEL_STYLE: CSSProperties = {
  background: "var(--menu-bg, var(--du-ui-bg-solid, #fff))",
  color: "var(--menu-text, var(--du-text, #1a1a1a))",
  border: "1px solid var(--menu-border, var(--du-ui-border, rgba(0,0,0,0.08)))",
  borderRadius: 6,
  padding: "4px 0",
  minWidth: 180,
  boxShadow: "var(--du-ui-shadow, 0 4px 16px rgba(0,0,0,0.18))",
  font: "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};

/** Panel padding (4) + border (1): offset so a submenu's first row aligns with its parent row. */
const SUBMENU_ALIGN_PX = 5;

const ROW_STYLE: CSSProperties = {
  all: "unset",
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 12px",
  width: "100%",
  boxSizing: "border-box",
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
  return (
    <>
      {items.map((item, i) =>
        item.kind === "divider" ? (
          <hr
            key={`d-${i}`}
            style={{
              border: 0,
              borderTop: "1px solid var(--menu-divider, var(--du-ui-border, rgba(0,0,0,0.08)))",
              margin: "4px 0",
            }}
          />
        ) : item.kind === "submenu" ? (
          <ContextSubmenuRow
            key={item.id}
            item={item}
            editor={editor}
            ctx={ctx}
            close={close}
            panels={panels}
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
  open,
  onOpen,
  onToggle,
}: {
  readonly item: Extract<ContextMenuItem, { kind: "submenu" }>;
  readonly editor: Editor;
  readonly ctx: ContextMenuContext;
  readonly close: () => void;
  readonly panels: Set<HTMLElement>;
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
    const stop = floatPanel(row, panel, {
      placement: "right-start",
      fallbackPlacements: ["left-start"],
      // Align the first child row with this row: undo the panel padding + border.
      crossAxis: -SUBMENU_ALIGN_PX,
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
        style={{
          ...ROW_STYLE,
          cursor: "pointer",
          background: open ? "var(--du-hover-overlay, rgba(0,0,0,0.05))" : "transparent",
        }}
      >
        <span>{item.label}</span>
        <span aria-hidden style={{ marginLeft: 16, opacity: 0.6 }}>
          ›
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={typeof item.label === "string" ? item.label : undefined}
              style={{ ...MENU_PANEL_STYLE, position: "fixed", top: 0, left: 0, zIndex: 1001 }}
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
  onHover,
  onActivate,
}: {
  readonly item: Extract<ContextMenuItem, { kind: "action" }>;
  readonly editor: Editor;
  readonly ctx: ContextMenuContext;
  readonly onHover: () => void;
  readonly onActivate: () => void;
}) => {
  const disabled = item.disabled?.(editor, ctx) ?? false;
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
      role="menuitem"
      onClick={handle}
      disabled={disabled}
      style={{
        ...ROW_STYLE,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(ev) => {
        onHover();
        if (!disabled)
          ev.currentTarget.style.background = "var(--du-hover-overlay, rgba(0,0,0,0.05))";
      }}
      onMouseLeave={(ev) => {
        ev.currentTarget.style.background = "transparent";
      }}
    >
      <span>{item.label}</span>
      {item.shortcut ? (
        <span style={{ marginLeft: 16, opacity: 0.6, fontSize: 11 }}>{item.shortcut}</span>
      ) : null}
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
    onClick: (editor: Editor) => {
      defaultActionRegistry.dispatch(actionId, { editor });
    },
  };
};

export const DEFAULT_CONTEXT_MENU: readonly ContextMenuItem[] = [
  // --- Clipboard / duplication ---
  actionMenuItem("copy"),
  actionMenuItem("cut"),
  actionMenuItem("paste"),
  actionMenuItem("duplicate-selection", { label: "Duplicate" }),
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
  // --- Delete last among the mutating ops ---
  actionMenuItem("delete-selection", { label: "Delete" }),
  { kind: "divider" },
  // --- Viewport (registry-backed) ---
  actionMenuItem("zoom-in"),
  actionMenuItem("zoom-out"),
  actionMenuItem("zoom-reset", { label: "Reset zoom (100%)" }),
  actionMenuItem("zoom-to-fit", {
    label: "Fit to screen",
    visible: (e) => e.scene.elements.size > 0,
  }),
  { kind: "divider" },
  {
    kind: "action",
    id: "clear-canvas",
    label: "Clear canvas",
    visible: (e) => !e.readOnly && (e.scene.elements.size > 0 || e.scene.links.size > 0),
    onClick: (e) => {
      clearCanvasWithConfirm(e);
    },
  },
];
