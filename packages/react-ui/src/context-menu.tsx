import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { Editor } from "@oh-just-another/state";
import { useDiagramOptional } from "./hooks.js";

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
  readonly worldPoint: { readonly x: number; readonly y: number };
  /** Screen-space pointer position (CSS pixels). */
  readonly screenPoint: { readonly x: number; readonly y: number };
}

interface OpenState {
  readonly screenPoint: { readonly x: number; readonly y: number };
  readonly worldPoint: { readonly x: number; readonly y: number };
}

/**
 * Render-prop helper that listens for `contextmenu` on the wrapped
 * element, opens a positioned menu, and dispatches the chosen item's
 * `onClick` against the live editor. Drop it as a sibling of the canvas
 * surface inside `<DiagramRoot>`.
 */
export interface ContextMenuProps {
  readonly items: readonly ContextMenuItem[];
  /**
   * Target element to attach the `contextmenu` listener to. Defaults to
   * the element the trigger is rendered into.
   */
  readonly target?: HTMLElement | null;
  readonly style?: CSSProperties;
  readonly className?: string;
}

export const ContextMenu = ({ items, target, style, className }: ContextMenuProps) => {
  const editor = useDiagramOptional();
  const [open, setOpen] = useState<OpenState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Wire the contextmenu listener (mouse right-click) AND long-press
  // (touch). Both end up calling `setOpen` with viewport-relative
  // screen coords.
  useEffect(() => {
    if (!editor) return undefined;
    const root: HTMLElement | Window = target ?? window;
    const onContext = (ev: Event): void => {
      const me = ev as MouseEvent;
      me.preventDefault();
      const screenPoint = { x: me.clientX, y: me.clientY };
      const rect = editor.hostElement.getBoundingClientRect();
      const worldPoint = editor.screenToWorld({
        x: screenPoint.x - rect.left,
        y: screenPoint.y - rect.top,
      });
      setOpen({ screenPoint, worldPoint });
    };
    root.addEventListener("contextmenu", onContext);
    // Touch fallback: editor fires onLongPress with host-relative
    // coords; the menu needs viewport-relative for positioning.
    const unsubscribeLongPress = editor.onLongPress(({ screenPoint, worldPoint }) => {
      const rect = editor.hostElement.getBoundingClientRect();
      setOpen({
        screenPoint: { x: screenPoint.x + rect.left, y: screenPoint.y + rect.top },
        worldPoint,
      });
    });
    return () => {
      root.removeEventListener("contextmenu", onContext);
      unsubscribeLongPress();
    };
  }, [editor, target]);

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

  const close = useCallback(() => setOpen(null), []);

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
      if (out[out.length - 1]!.kind === "divider") continue;
    }
    out.push(item);
  }
  while (out.length > 0 && out[out.length - 1]!.kind === "divider") out.pop();
  return out;
};

/**
 * Default menu — sensible starting set. Hosts compose this with their
 * own custom items.
 */
export const DEFAULT_CONTEXT_MENU: readonly ContextMenuItem[] = [
  // --- Selection ops (when there's a selection) ---
  {
    kind: "action",
    id: "delete",
    label: "Delete",
    shortcut: "Del",
    visible: (e) => e.selection.size > 0,
    onClick: (e) => e.deleteSelected(),
  },
  {
    kind: "action",
    id: "duplicate",
    label: "Duplicate",
    shortcut: "⌘D",
    visible: (e) => e.selection.size > 0,
    onClick: (e) => e.duplicateSelected(),
  },
  {
    kind: "action",
    id: "copy",
    label: "Copy",
    shortcut: "⌘C",
    visible: (e) => e.selection.size > 0,
    onClick: (e) => e.copySelected(),
  },
  {
    kind: "action",
    id: "cut",
    label: "Cut",
    shortcut: "⌘X",
    visible: (e) => e.selection.size > 0,
    onClick: (e) => e.cutSelected(),
  },
  {
    kind: "action",
    id: "paste",
    label: "Paste",
    shortcut: "⌘V",
    onClick: (e) => e.paste(),
  },
  {
    kind: "action",
    id: "select-all",
    label: "Select all",
    shortcut: "⌘A",
    onClick: (e) => e.selectAll(),
  },
  { kind: "divider" },
  // --- Z-order (single-selection scope) ---
  {
    kind: "action",
    id: "bring-to-front",
    label: "Bring to front",
    shortcut: "⌘]",
    visible: (e) => e.selection.size === 1,
    onClick: (e) => e.bringToFront(),
  },
  {
    kind: "action",
    id: "send-to-back",
    label: "Send to back",
    shortcut: "⌘[",
    visible: (e) => e.selection.size === 1,
    onClick: (e) => e.sendToBack(),
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
      const shapeUnder = [...e.scene.shapes.values()].reverse().find((s) => {
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
      const position = shapeUnder
        ? {
            x: ctx.worldPoint.x - shapeUnder.position.x,
            y: ctx.worldPoint.y - shapeUnder.position.y,
          }
        : ctx.worldPoint;
      e.addAnnotation({ position, shapeId: shapeUnder?.id ?? null });
    },
  },
  { kind: "divider" },
  // --- Viewport ---
  {
    kind: "action",
    id: "zoom-in",
    label: "Zoom in",
    shortcut: "⌘+",
    onClick: (e) => e.zoomIn(),
  },
  {
    kind: "action",
    id: "zoom-out",
    label: "Zoom out",
    shortcut: "⌘−",
    onClick: (e) => e.zoomOut(),
  },
  {
    kind: "action",
    id: "reset-zoom",
    label: "Reset zoom (100%)",
    shortcut: "⌘0",
    onClick: (e) => e.resetZoom(),
  },
  {
    kind: "action",
    id: "fit-zoom",
    label: "Fit to screen",
    shortcut: "⌘1",
    visible: (e) => e.scene.shapes.size > 0,
    onClick: (e) => e.zoomToFit(),
  },
  { kind: "divider" },
  // --- Scene-wide ---
  {
    kind: "action",
    id: "clear",
    label: "Clear scene",
    visible: (e) => e.scene.shapes.size > 0,
    onClick: (e) => {
      if (typeof window === "undefined" || window.confirm("Clear the whole scene?")) e.clear();
    },
  },
];
