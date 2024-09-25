import { useState, type CSSProperties } from "react";
import type { Layer } from "@oh-just-another/scene";
import type { LayerId } from "@oh-just-another/types";
import { useActiveLayerId, useDiagramOptional, useLayers } from "./hooks.js";
import {
  LAYER_PANEL_WIDTH,
  LAYER_SWATCH_SIZE,
  LAYER_TOGGLE_ICON_SIZE,
} from "./constants.js";

/**
 * Read-write list of scene layers. Click a row to make it active; click
 * the eye / lock icons to toggle visibility / lock; double-click the
 * name to rename; trash to delete (the panel guards against removing
 * the last layer). "+" at the top creates a new layer.
 */
export interface LayerPanelProps {
  readonly style?: CSSProperties;
  readonly className?: string;
}

export const LayerPanel = ({ style, className }: LayerPanelProps) => {
  const editor = useDiagramOptional();
  const layers = useLayers();
  const activeId = useActiveLayerId();
  const [renamingId, setRenamingId] = useState<LayerId | null>(null);

  const containerStyle: CSSProperties = {
    width: LAYER_PANEL_WIDTH,
    padding: 0,
    background: "var(--panel, #161616)",
    color: "var(--text, #ddd)",
    borderLeft: "1px solid var(--border, #2a2a2a)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    fontSize: 12,
    ...style,
  };

  return (
    <aside className={className} style={containerStyle}>
      <header
        style={{
          margin: 0,
          padding: "10px 12px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--muted, #888)",
          borderBottom: "1px solid var(--border, #2a2a2a)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Layers</span>
        <button
          type="button"
          title="New layer"
          disabled={!editor}
          onClick={() => editor?.createLayer(`Layer ${layers.length + 1}`)}
          style={iconButtonStyle}
        >
          +
        </button>
      </header>
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "4px 0" }}>
        {/* Top-of-stack first */}
        {[...layers].reverse().map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            active={layer.id === activeId}
            renaming={renamingId === layer.id}
            onActivate={() => editor?.setActiveLayer(layer.id)}
            onToggleVisible={() => editor?.toggleLayerVisibility(layer.id)}
            onToggleLock={() => editor?.toggleLayerLock(layer.id)}
            onStartRename={() => setRenamingId(layer.id)}
            onCommitRename={(name) => {
              editor?.renameLayer(layer.id, name);
              setRenamingId(null);
            }}
            onCancelRename={() => setRenamingId(null)}
            onDelete={
              layers.length > 1
                ? () => {
                    if (window.confirm(`Delete layer "${layer.name}" and everything in it?`)) {
                      editor?.removeLayer(layer.id);
                    }
                  }
                : null
            }
          />
        ))}
      </div>
    </aside>
  );
};

interface LayerRowProps {
  readonly layer: Layer;
  readonly active: boolean;
  readonly renaming: boolean;
  readonly onActivate: () => void;
  readonly onToggleVisible: () => void;
  readonly onToggleLock: () => void;
  readonly onStartRename: () => void;
  readonly onCommitRename: (name: string) => void;
  readonly onCancelRename: () => void;
  readonly onDelete: (() => void) | null;
}

const LayerRow = ({
  layer,
  active,
  renaming,
  onActivate,
  onToggleVisible,
  onToggleLock,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: LayerRowProps) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        background: active ? "var(--cursor-bg, rgba(26,115,232,0.14))" : "transparent",
        borderLeft: `3px solid ${active ? "var(--accent, #1a73e8)" : "transparent"}`,
        cursor: "pointer",
      }}
      onClick={onActivate}
    >
      <IconBtn
        title={layer.visible ? "Hide layer" : "Show layer"}
        onClick={(ev) => {
          ev.stopPropagation();
          onToggleVisible();
        }}
        muted={!layer.visible}
      >
        {layer.visible ? "👁" : "—"}
      </IconBtn>
      <IconBtn
        title={layer.locked ? "Unlock layer" : "Lock layer"}
        onClick={(ev) => {
          ev.stopPropagation();
          onToggleLock();
        }}
        muted={!layer.locked}
      >
        {layer.locked ? "🔒" : "🔓"}
      </IconBtn>
      {renaming ? (
        <input
          autoFocus
          defaultValue={layer.name}
          onClick={(ev) => ev.stopPropagation()}
          onBlur={(ev) => onCommitRename(ev.currentTarget.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") onCommitRename((ev.target as HTMLInputElement).value);
            else if (ev.key === "Escape") onCancelRename();
          }}
          style={{
            flex: 1,
            background: "var(--button-bg, #2a2a2a)",
            color: "var(--text, #ddd)",
            border: "1px solid var(--accent, #1a73e8)",
            borderRadius: 3,
            padding: "2px 4px",
            font: "inherit",
            minWidth: 0,
          }}
        />
      ) : (
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: layer.visible ? 1 : 0.5,
          }}
          onDoubleClick={(ev) => {
            ev.stopPropagation();
            onStartRename();
          }}
        >
          {layer.name}
        </span>
      )}
      {onDelete ? (
        <IconBtn
          title="Delete layer"
          onClick={(ev) => {
            ev.stopPropagation();
            onDelete();
          }}
        >
          ×
        </IconBtn>
      ) : null}
    </div>
  );
};

const iconButtonStyle: CSSProperties = {
  background: "transparent",
  color: "var(--text, #ddd)",
  border: "1px solid var(--border, #2a2a2a)",
  borderRadius: 3,
  width: LAYER_TOGGLE_ICON_SIZE,
  height: LAYER_TOGGLE_ICON_SIZE,
  cursor: "pointer",
  font: "inherit",
  fontSize: 12,
  padding: 0,
};

const IconBtn = ({
  title,
  onClick,
  children,
  muted,
}: {
  readonly title: string;
  readonly onClick: (ev: React.MouseEvent) => void;
  readonly children: React.ReactNode;
  readonly muted?: boolean;
}) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    style={{
      ...iconButtonStyle,
      opacity: muted ? 0.4 : 1,
      width: LAYER_SWATCH_SIZE,
      height: LAYER_SWATCH_SIZE,
    }}
  >
    {children}
  </button>
);
