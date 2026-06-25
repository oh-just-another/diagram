import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { Vec2 } from "@oh-just-another/types";
import type { Editor } from "@oh-just-another/state";
import { defaultActionRegistry, formatHotkey, type HotkeyMatcher } from "@oh-just-another/state";
import { useDiagramOptional } from "./hooks.js";
import { useContextMenuController } from "./context-menu-controller.js";

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
  const [open, setOpen] = useState<OpenState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
      if (menuRef.current?.contains(ev.target as Node)) return;
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

  if (!editor || !open) return null;

  const ctx: ContextMenuContext = {
    worldPoint: open.worldPoint,
    screenPoint: open.screenPoint,
  };

  // Filter visibility once per open — items that compute `visible` against
  // the editor still see a consistent snapshot.
  const visibleItems = items.filter(
    (item) => item.kind === "divider" || item.visible?.(editor, ctx) !== false,
  );
  // Collapse adjacent dividers + leading/trailing dividers.
  const cleanedItems = collapseDividers(visibleItems);
  if (cleanedItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        zIndex: 1000,
        top: open.screenPoint.y,
        left: open.screenPoint.x,
        background: "var(--menu-bg, #1a1a1a)",
        color: "var(--menu-text, #ddd)",
        border: "1px solid var(--menu-border, #333)",
        borderRadius: 6,
        padding: "4px 0",
        minWidth: 180,
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        font: "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        ...style,
      }}
      className={className}
    >
      {cleanedItems.map((item, i) =>
        item.kind === "divider" ? (
          <hr
            key={`d-${i}`}
            style={{
              border: 0,
              borderTop: "1px solid var(--menu-divider, #2a2a2a)",
              margin: "4px 0",
            }}
          />
        ) : (
          <ContextMenuRow
            key={item.id}
            item={item}
            editor={editor}
            ctx={ctx}
            onActivate={() => {
              close();
              item.onClick(editor, ctx);
            }}
          />
        ),
      )}
    </div>
  );
};

const ContextMenuRow = ({
  item,
  editor,
  ctx,
  onActivate,
}: {
  readonly item: Extract<ContextMenuItem, { kind: "action" }>;
  readonly editor: Editor;
  readonly ctx: ContextMenuContext;
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
        all: "unset",
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        width: "100%",
        boxSizing: "border-box",
      }}
      onMouseEnter={(ev) => {
        if (!disabled) ev.currentTarget.style.background = "#2a2a2a";
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
  const visible = opts?.visible ?? (pred ? (editor: Editor) => pred({ editor }) : undefined);
  return {
    kind: "action",
    id: actionId,
    label: opts?.label ?? action?.label ?? actionId,
    ...(first ? { shortcut: formatHotkey(first) } : {}),
    ...(visible ? { visible } : {}),
    onClick: (editor: Editor) => {
      defaultActionRegistry.dispatch(actionId, { editor });
    },
  };
};

export const DEFAULT_CONTEXT_MENU: readonly ContextMenuItem[] = [
  // --- Annotation pin actions (only when right-click landed on a pin) ---
  {
    kind: "action",
    id: "annotation-open",
    label: "Open thread",
    visible: (e, ctx) => e.hitAnnotation(ctx.worldPoint) !== null,
    onClick: (e, ctx) => {
      const id = e.hitAnnotation(ctx.worldPoint);
      if (id) e.setSelectedAnnotation(id);
    },
  },
  {
    kind: "action",
    id: "annotation-toggle-resolved",
    label: "Toggle resolved",
    visible: (e, ctx) => e.hitAnnotation(ctx.worldPoint) !== null,
    onClick: (e, ctx) => {
      const id = e.hitAnnotation(ctx.worldPoint);
      if (id) e.toggleAnnotationResolved(id);
    },
  },
  {
    kind: "action",
    id: "annotation-delete",
    label: "Delete annotation",
    visible: (e, ctx) => e.hitAnnotation(ctx.worldPoint) !== null,
    onClick: (e, ctx) => {
      const id = e.hitAnnotation(ctx.worldPoint);
      if (id) e.removeAnnotation(id);
    },
  },
  {
    kind: "divider",
  },
  // --- Selection ops (registry-backed) ---
  actionMenuItem("delete-selection", { label: "Delete" }),
  actionMenuItem("duplicate-selection", { label: "Duplicate" }),
  actionMenuItem("copy"),
  actionMenuItem("cut"),
  actionMenuItem("paste"),
  actionMenuItem("copy-style", { label: "Copy style" }),
  actionMenuItem("paste-style", { label: "Paste style" }),
  actionMenuItem("select-all"),
  { kind: "divider" },
  // --- Grouping + arrange (registry-backed) ---
  actionMenuItem("group-selection", { label: "Group" }),
  actionMenuItem("ungroup-selection", { label: "Ungroup" }),
  actionMenuItem("flip-horizontal", { label: "Flip horizontal" }),
  actionMenuItem("flip-vertical", { label: "Flip vertical" }),
  actionMenuItem("align-left", { label: "Align left" }),
  actionMenuItem("align-h-center", { label: "Align horizontal centres" }),
  actionMenuItem("align-right", { label: "Align right" }),
  actionMenuItem("align-top", { label: "Align top" }),
  actionMenuItem("align-v-center", { label: "Align vertical centres" }),
  actionMenuItem("align-bottom", { label: "Align bottom" }),
  actionMenuItem("distribute-horizontal", { label: "Distribute horizontally" }),
  actionMenuItem("distribute-vertical", { label: "Distribute vertically" }),
  actionMenuItem("arrange-grid"),
  actionMenuItem("arrange-stack-h"),
  actionMenuItem("arrange-stack-v"),
  actionMenuItem("auto-arrange"),
  actionMenuItem("compact-z-order"),
  { kind: "divider" },
  // --- Z-order (single-selection scope; registry-backed, visibility
  //     narrowed to a single selection) ---
  actionMenuItem("bring-to-front", { visible: (e) => e.selection.size === 1 }),
  actionMenuItem("send-to-back", { visible: (e) => e.selection.size === 1 }),
  {
    kind: "action",
    id: "move-to-layer",
    label: "Move to layer…",
    visible: (e) => e.selection.size > 0 && e.scene.layers.size > 1,
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
  // --- Annotation actions (when right-click hits a pin) ---
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
  // --- Viewport (registry-backed) ---
  actionMenuItem("zoom-in"),
  actionMenuItem("zoom-out"),
  actionMenuItem("zoom-reset", { label: "Reset zoom (100%)" }),
  actionMenuItem("zoom-to-fit", {
    label: "Fit to screen",
    visible: (e) => e.scene.elements.size > 0,
  }),
];
