import type { CSSProperties, ReactNode } from "react";
import {
  Circle,
  Frame,
  Hand,
  Image as ImageIcon,
  Lock,
  MousePointer2,
  PenLine,
  Redo2,
  Slash,
  Square,
  Type,
  Undo2,
} from "lucide-react";
import type { Editor, Mode } from "@oh-just-another/state";
import { formatHotkey } from "@oh-just-another/state";
import { useEditorSelector } from "./context.js";
import { useDiagramOptional, useHistory, useMode } from "./hooks.js";
import { TOOLBAR_SEPARATOR_HEIGHT } from "./constants.js";
import { Tooltip } from "./tooltip.js";

/**
 * Pixel size for icons rendered inside `du-icon-button` (32-px
 * inside-group footprint). Lucide draws crisp at 16 px stroke-width
 * 1.75.
 */
const TOOLBAR_ICON_SIZE = 16;
const TOOLBAR_ICON_STROKE = 1.75;
const iconProps = { size: TOOLBAR_ICON_SIZE, strokeWidth: TOOLBAR_ICON_STROKE } as const;

/**
 * Platform-correct zoom hotkey labels — ⌘ glyphs on macOS, "Ctrl+…"
 * elsewhere. Descriptors mirror the bound zoom hotkeys; display uses the
 * minus/plus glyphs.
 */
const HK_ZOOM_OUT = formatHotkey({ meta: true, key: "−" });
const HK_ZOOM_IN = formatHotkey({ meta: true, key: "+" });
const HK_ZOOM_RESET = formatHotkey({ meta: true, key: "0" });
const HK_ZOOM_FIT = formatHotkey({ meta: true, key: "1" });

/**
 * Single toolbar item. Builtin `mode` items wire to `editor.setMode`;
 * `action` items receive the live editor and decide what to do; `divider`
 * draws a thin vertical separator. The `zoom-*` kinds let hosts place
 * individual zoom controls anywhere in the toolbar; `zoom` packs all
 * four into a single compact widget (− / % / + / Fit).
 */
export type ToolbarItem =
  | {
      readonly kind: "mode";
      readonly mode: Mode;
      readonly label: ReactNode;
      readonly title?: string;
    }
  | {
      readonly kind: "action";
      readonly id: string;
      readonly label: ReactNode;
      readonly title?: string;
      readonly disabled?: boolean;
      /** Render the button in its pressed/active state (e.g. a toggle). */
      readonly active?: boolean;
      readonly onClick: (editor: Editor) => void;
    }
  | { readonly kind: "divider" }
  | { readonly kind: "undo"; readonly label?: ReactNode }
  | { readonly kind: "redo"; readonly label?: ReactNode }
  | { readonly kind: "zoom" }
  | { readonly kind: "zoom-in"; readonly label?: ReactNode }
  | { readonly kind: "zoom-out"; readonly label?: ReactNode }
  | { readonly kind: "zoom-reset"; readonly label?: ReactNode }
  | { readonly kind: "zoom-fit"; readonly label?: ReactNode }
  | { readonly kind: "zoom-display" }
  | {
      /**
       * Tool-lock toggle. Renders a pressed-when-locked button; click flips
       * `editor.toolLocked`. When locked, draw modes (rectangle / ellipse /
       * edge / brush) persist after each create instead of reverting to
       * select.
       */
      readonly kind: "tool-lock";
      readonly label?: ReactNode;
      readonly title?: string;
    };

/**
 * Open an OS file picker for image(s) and insert them at the viewport
 * centre via the editor's file-drop pipeline (same path as drag-and-drop,
 * so sizing / GIF animation / Scene.files registration all apply).
 * Multi-select supported — each file dispatched independently.
 *
 * Lives in the UI layer rather than the L2 `state` package because it
 * touches the DOM (`<input type=file>`). Exported so hosts can wire it to
 * a hotkey or a custom button.
 */
export const openImageFilePicker = (editor: Editor): void => {
  if (typeof document === "undefined") return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.addEventListener("change", () => {
    const files = input.files;
    if (!files || files.length === 0) return;
    // Toolbar / hotkey invocation has no cursor position — land the
    // image(s) at the viewport centre in world coords.
    const vp = editor.scene.viewport;
    const world = editor.screenToWorld({
      x: vp.size.width / 2,
      y: vp.size.height / 2,
    });
    for (const file of Array.from(files)) {
      void editor.dispatchFileDrop(file, world);
    }
  });
  input.click();
};

/** Convenience default — modes + tool-lock + undo/redo + zoom widget. */
export const DEFAULT_TOOLBAR: readonly ToolbarItem[] = [
  { kind: "mode", mode: "select", label: <MousePointer2 {...iconProps} />, title: "Select (V)" },
  { kind: "mode", mode: "hand", label: <Hand {...iconProps} />, title: "Pan (H)" },
  { kind: "mode", mode: "draw-rect", label: <Square {...iconProps} />, title: "Rectangle (R)" },
  { kind: "mode", mode: "draw-ellipse", label: <Circle {...iconProps} />, title: "Ellipse (E)" },
  { kind: "mode", mode: "draw-text", label: <Type {...iconProps} />, title: "Text (T)" },
  { kind: "mode", mode: "draw-edge", label: <Slash {...iconProps} />, title: "Link (L)" },
  { kind: "mode", mode: "brush", label: <PenLine {...iconProps} />, title: "Brush (B)" },
  { kind: "mode", mode: "draw-frame", label: <Frame {...iconProps} />, title: "Frame (F)" },
  {
    kind: "action",
    id: "insert-image",
    label: <ImageIcon {...iconProps} />,
    title: "Insert image (I)",
    onClick: (editor) => { openImageFilePicker(editor); },
  },
  { kind: "tool-lock", label: <Lock {...iconProps} />, title: "Lock current tool (stay in mode after each create)" },
  { kind: "divider" },
  { kind: "undo", label: <Undo2 {...iconProps} /> },
  { kind: "redo", label: <Redo2 {...iconProps} /> },
  { kind: "divider" },
];

/**
 * Creation-tool set for the vertical left dock. Just the creation tools +
 * the tool-lock toggle — no undo/redo/zoom (those live in the menu /
 * bottom-left). Hosts prepend their own leading items (e.g. a
 * templates-library toggle) and render with
 * `<Toolbar orientation="vertical" />`.
 */
export const DEFAULT_VERTICAL_TOOLBAR: readonly ToolbarItem[] = [
  { kind: "mode", mode: "select", label: <MousePointer2 {...iconProps} />, title: "Select (V)" },
  { kind: "mode", mode: "hand", label: <Hand {...iconProps} />, title: "Pan (H)" },
  { kind: "divider" },
  { kind: "mode", mode: "draw-rect", label: <Square {...iconProps} />, title: "Rectangle (R)" },
  { kind: "mode", mode: "draw-ellipse", label: <Circle {...iconProps} />, title: "Ellipse (E)" },
  { kind: "mode", mode: "draw-text", label: <Type {...iconProps} />, title: "Text (T)" },
  { kind: "mode", mode: "draw-edge", label: <Slash {...iconProps} />, title: "Link (L)" },
  { kind: "mode", mode: "brush", label: <PenLine {...iconProps} />, title: "Brush (B)" },
  { kind: "mode", mode: "draw-frame", label: <Frame {...iconProps} />, title: "Frame (F)" },
  {
    kind: "action",
    id: "insert-image",
    label: <ImageIcon {...iconProps} />,
    title: "Insert image (I)",
    onClick: (editor) => { openImageFilePicker(editor); },
  },
  { kind: "divider" },
  { kind: "tool-lock", label: <Lock {...iconProps} />, title: "Lock current tool (stay in mode after each create)" },
];

export interface ToolbarProps {
  readonly items?: readonly ToolbarItem[];
  readonly style?: CSSProperties;
  readonly className?: string;
  /**
   * Lay the toolbar out as a horizontal row (default) or a vertical
   * column (the left creation dock). Vertical flips the button-group
   * flex direction and draws horizontal dividers.
   */
  readonly orientation?: "horizontal" | "vertical";
}

export const Toolbar = ({
  items = DEFAULT_TOOLBAR,
  style,
  className,
  orientation = "horizontal",
}: ToolbarProps) => {
  const editor = useDiagramOptional();
  const mode = useMode();
  const { canUndo, canRedo, undo, redo } = useHistory();
  const vertical = orientation === "vertical";

  return (
    <div
      role="toolbar"
      aria-orientation={orientation}
      className={`du-button-group${vertical ? " du-button-group-vertical" : ""} ${className ?? ""}`.trim()}
      style={style}
    >
      {items.map((item, i) => {
        switch (item.kind) {
          case "divider":
            return <ToolbarDivider key={i} vertical={vertical} />;
          case "mode": {
            const active = mode === item.mode;
            return (
              <ToolbarButton
                key={i}
                {...(item.title !== undefined ? { title: item.title } : {})}
                disabled={!editor}
                active={active}
                onClick={() => editor?.setMode(item.mode)}
              >
                {item.label}
              </ToolbarButton>
            );
          }
          case "action":
            return (
              <ToolbarButton
                key={i}
                {...(item.title !== undefined ? { title: item.title } : {})}
                disabled={item.disabled ?? !editor}
                active={item.active}
                onClick={() => {
                  if (editor) item.onClick(editor);
                }}
              >
                {item.label}
              </ToolbarButton>
            );
          case "undo":
            return (
              <ToolbarButton key={i} disabled={!canUndo} onClick={undo}>
                {item.label ?? "Undo"}
              </ToolbarButton>
            );
          case "redo":
            return (
              <ToolbarButton key={i} disabled={!canRedo} onClick={redo}>
                {item.label ?? "Redo"}
              </ToolbarButton>
            );
          case "tool-lock":
            return (
              <ToolLockButton
                key={i}
                {...(item.label !== undefined ? { label: item.label } : {})}
                {...(item.title !== undefined ? { title: item.title } : {})}
              />
            );
        }
      })}
    </div>
  );
};

/**
 * Pressable tool-lock affordance. Reads `editor.toolLocked` reactively so
 * the active state stays in sync when the user toggles via hotkey or
 * context menu.
 */
export const ToolLockButton = ({
  label = "🔒",
  title = "Lock current tool",
}: {
  readonly label?: ReactNode;
  readonly title?: string;
}) => {
  const editor = useDiagramOptional();
  const locked = useEditorSelector((e) => e.toolLocked, false);
  return (
    <ToolbarButton
      disabled={!editor}
      title={title}
      active={locked}
      onClick={() => editor?.setToolLocked(!locked)}
    >
      {label}
    </ToolbarButton>
  );
};

// ---------------------------------------------------------------------------
// Standalone zoom controls
//
// Each component is independently usable outside the Toolbar — hosts can drop
// them into custom layouts (e.g. a corner overlay, a side panel) and still
// get the same behaviour as the bundled widget. All four read the live
// editor via useDiagramOptional, so they disable themselves gracefully when
// there is no editor in context.
// ---------------------------------------------------------------------------

export interface ZoomButtonProps {
  readonly label?: ReactNode;
  readonly title?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** "−" — calls `editor.zoomOut()`. */
export const ZoomOutButton = ({
  label = "−",
  title = `Zoom out (${HK_ZOOM_OUT})`,
  className,
  style,
}: ZoomButtonProps) => {
  const editor = useDiagramOptional();
  return (
    <ToolbarButton
      disabled={!editor}
      title={title}
      className={className}
      style={style}
      onClick={() => editor?.zoomOut()}
    >
      {label}
    </ToolbarButton>
  );
};

/** "+" — calls `editor.zoomIn()`. */
export const ZoomInButton = ({
  label = "+",
  title = `Zoom in (${HK_ZOOM_IN})`,
  className,
  style,
}: ZoomButtonProps) => {
  const editor = useDiagramOptional();
  return (
    <ToolbarButton
      disabled={!editor}
      title={title}
      className={className}
      style={style}
      onClick={() => editor?.zoomIn()}
    >
      {label}
    </ToolbarButton>
  );
};

/** "100%" / "Reset" — calls `editor.resetZoom()`. */
export const ResetZoomButton = ({
  label = "100%",
  title = `Reset zoom to 100% (${HK_ZOOM_RESET})`,
  className,
  style,
}: ZoomButtonProps) => {
  const editor = useDiagramOptional();
  return (
    <ToolbarButton
      disabled={!editor}
      title={title}
      className={className}
      style={style}
      onClick={() => editor?.resetZoom()}
    >
      {label}
    </ToolbarButton>
  );
};

/** "Fit" — calls `editor.zoomToFit()`. */
export const ZoomToFitButton = ({
  label = "Fit",
  title = `Fit content to viewport (${HK_ZOOM_FIT})`,
  className,
  style,
}: ZoomButtonProps) => {
  const editor = useDiagramOptional();
  return (
    <ToolbarButton
      disabled={!editor}
      title={title}
      className={className}
      style={style}
      onClick={() => editor?.zoomToFit()}
    >
      {label}
    </ToolbarButton>
  );
};

/**
 * Live zoom percent. Clicks reset zoom to 100% — same UX as the percent
 * button in `ZoomWidget`.
 */
export const ZoomDisplay = ({ className, style }: { readonly className?: string; readonly style?: CSSProperties }) => {
  const editor = useDiagramOptional();
  const zoom = useEditorSelector((e) => e.scene.viewport.zoom, 1);
  const percent = `${Math.round(zoom * 100)}%`;
  return (
    <ToolbarButton
      disabled={!editor}
      title={`Reset zoom to 100% (${HK_ZOOM_RESET})`}
      className={className}
      style={style}
      onClick={() => editor?.resetZoom()}
    >
      <span style={{ minWidth: 40, display: "inline-block", textAlign: "center" }}>{percent}</span>
    </ToolbarButton>
  );
};

/**
 * Pre-composed inline zoom widget: − / current % / + / Fit. Equivalent
 * to laying the four standalone buttons + display in a row.
 */
export const ZoomWidget = ({ className, style }: { readonly className?: string; readonly style?: CSSProperties }) => (
  <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 2, ...style }}>
    <ZoomOutButton />
    <ZoomDisplay />
    <ZoomInButton />
    <ZoomToFitButton />
  </span>
);

/**
 * Floating zoom controls — bottom-right cluster with rounded shadow
 * chrome. Drops the widget into a corner so the toolbar stays free for
 * tools. Hosts that need a different position pass `style`.
 */
export const FloatingZoomControls = ({
  className,
  style,
}: {
  readonly className?: string;
  readonly style?: CSSProperties;
}) => (
  <div
    className={className}
    style={{
      position: "absolute",
      bottom: 16,
      right: 16,
      display: "inline-flex",
      alignItems: "center",
      gap: 2,
      padding: "4px 6px",
      background: "var(--toolbar-bg, #1a1a1a)",
      border: "1px solid var(--border, #2a2a2a)",
      borderRadius: 6,
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.18)",
      zIndex: 50,
      ...style,
    }}
  >
    <ZoomOutButton />
    <ZoomDisplay />
    <ZoomInButton />
    <ZoomToFitButton />
  </div>
);

// --- internal building blocks ---

interface ToolbarButtonProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly active?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly title?: string | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

const ToolbarButton = ({
  children,
  onClick,
  active,
  disabled,
  title,
  className,
  style,
}: ToolbarButtonProps) => {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      aria-pressed={active}
      className={`du-icon-button${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
      style={{
        // Toolbar items are wider than square — labels can be 1-2
        // characters or short words. Match the IconButton height but
        // let the width grow with the content.
        width: "auto",
        minWidth: "var(--du-button-size, 36px)",
        padding: "0 8px",
        ...style,
      }}
    >
      {children}
    </button>
  );
  // Wrap in Tooltip when there's text to show. Disabled / empty labels go
  // raw — the shared-state tooltip would otherwise flash an empty box.
  return title ? <Tooltip content={title}>{btn}</Tooltip> : btn;
};

const ToolbarDivider = ({ vertical = false }: { readonly vertical?: boolean }) =>
  vertical ? (
    <span
      style={{
        height: 1,
        width: "100%",
        background: "var(--du-ui-border, #333)",
        margin: "4px 0",
      }}
    />
  ) : (
    <span
      style={{
        width: 1,
        height: TOOLBAR_SEPARATOR_HEIGHT,
        background: "var(--du-ui-border, #333)",
        margin: "0 4px",
      }}
    />
  );
