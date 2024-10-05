import type { CSSProperties, ReactNode } from "react";
import type { Editor, Mode } from "@oh-just-another/state";
import { useEditorSelector } from "./context.js";
import { useDiagramOptional, useHistory, useMode } from "./hooks.js";
import { TOOLBAR_SEPARATOR_HEIGHT } from "./constants.js";

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
  | { readonly kind: "zoom-display" };

/** Convenience default — modes + undo/redo + zoom widget. */
export const DEFAULT_TOOLBAR: readonly ToolbarItem[] = [
  { kind: "mode", mode: "select", label: "Select" },
  { kind: "mode", mode: "draw-rect", label: "Rectangle" },
  { kind: "mode", mode: "draw-ellipse", label: "Ellipse" },
  { kind: "mode", mode: "draw-edge", label: "Edge" },
  { kind: "divider" },
  { kind: "undo", label: "Undo" },
  { kind: "redo", label: "Redo" },
  { kind: "divider" },
  { kind: "zoom" },
];

export interface ToolbarProps {
  readonly items?: readonly ToolbarItem[];
  readonly style?: CSSProperties;
  readonly className?: string;
}

export const Toolbar = ({ items = DEFAULT_TOOLBAR, style, className }: ToolbarProps) => {
  const editor = useDiagramOptional();
  const mode = useMode();
  const { canUndo, canRedo, undo, redo } = useHistory();

  const containerStyle: CSSProperties = {
    display: "flex",
    gap: 6,
    alignItems: "center",
    ...style,
  };

  return (
    <div role="toolbar" className={className} style={containerStyle}>
      {items.map((item, i) => {
        switch (item.kind) {
          case "divider":
            return <ToolbarDivider key={i} />;
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
          case "zoom":
            return <ZoomWidget key={i} />;
          case "zoom-in":
            return <ZoomInButton key={i} label={item.label} />;
          case "zoom-out":
            return <ZoomOutButton key={i} label={item.label} />;
          case "zoom-reset":
            return <ResetZoomButton key={i} label={item.label} />;
          case "zoom-fit":
            return <ZoomToFitButton key={i} label={item.label} />;
          case "zoom-display":
            return <ZoomDisplay key={i} />;
        }
      })}
    </div>
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
  title = "Zoom out (⌘−)",
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
  title = "Zoom in (⌘+)",
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
  title = "Reset zoom to 100% (⌘0)",
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
  title = "Fit content to viewport (⌘1)",
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
      title="Reset zoom to 100% (⌘0)"
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
}: ToolbarButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-pressed={active}
    className={className}
    style={{
      background: active ? "#1a3d6e" : "#2a2a2a",
      color: "#ddd",
      border: `1px solid ${active ? "#1a73e8" : "#3a3a3a"}`,
      borderRadius: 4,
      padding: "6px 12px",
      font: "inherit",
      fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      ...style,
    }}
  >
    {children}
  </button>
);

const ToolbarDivider = () => (
  <span
    style={{ width: 1, height: TOOLBAR_SEPARATOR_HEIGHT, background: "#333", margin: "0 4px" }}
  />
);
