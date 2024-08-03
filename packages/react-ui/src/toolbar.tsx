import type { CSSProperties, ReactNode } from "react";
import type { Editor, Mode } from "@oh-just-another/state";
import { useDiagramOptional, useHistory, useMode } from "./hooks.js";

/**
 * Single toolbar item. Builtin `mode` items wire to `editor.setMode`;
 * `action` items receive the live editor and decide what to do; `divider`
 * draws a thin vertical separator.
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
  | { readonly kind: "redo"; readonly label?: ReactNode };

/** Convenience default — Select / Rectangle / Ellipse / divider / Undo / Redo. */
export const DEFAULT_TOOLBAR: readonly ToolbarItem[] = [
  { kind: "mode", mode: "select", label: "Select" },
  { kind: "mode", mode: "draw-rect", label: "Rectangle" },
  { kind: "mode", mode: "draw-ellipse", label: "Ellipse" },
  { kind: "divider" },
  { kind: "undo", label: "Undo" },
  { kind: "redo", label: "Redo" },
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
        }
      })}
    </div>
  );
};

// --- internal building blocks ---

interface ToolbarButtonProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly title?: string;
}

const ToolbarButton = ({ children, onClick, active, disabled, title }: ToolbarButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-pressed={active}
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
    }}
  >
    {children}
  </button>
);

const ToolbarDivider = () => (
  <span style={{ width: 1, height: 20, background: "#333", margin: "0 4px" }} />
);
