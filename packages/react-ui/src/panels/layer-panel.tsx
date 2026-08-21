import { useState, type CSSProperties } from "react";
import { Eye, EyeOff, Lock, Plus, Trash2, Unlock } from "lucide-react";
import type { Layer } from "@oh-just-another/scene";
import type { LayerId } from "@oh-just-another/types";
import { useActiveLayerId, useDiagramOptional, useLayers } from "../core/hooks.js";
import { CONTROL_ICON } from "../core/constants.js";

const glyph = CONTROL_ICON;

/**
 * Read-write list of scene layers. Click a row to make it active; click
 * the eye / lock icons to toggle visibility / lock; double-click the
 * name to rename; trash to delete (the panel guards against removing
 * the last layer). "+" in the header creates a new layer.
 *
 * Renders as a static side-panel card (`du-side-panel du-side-panel-static`);
 * hosts place it in their own layout. Sizing and colours come from the
 * `--du-*` design tokens.
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

  return (
    <aside
      className={`du-side-panel du-side-panel-static${className ? ` ${className}` : ""}`}
      style={style}
    >
      <header className="du-side-panel-header">
        <span className="du-side-panel-title">Layers</span>
        <button
          type="button"
          title="New layer"
          aria-label="New layer"
          disabled={!editor}
          onClick={() => editor?.createLayer(`Layer ${layers.length + 1}`)}
          className="du-icon-button du-icon-button-flat"
        >
          <Plus {...glyph} />
        </button>
      </header>
      <div className="du-side-panel-body du-side-panel-body-flush du-panel-list">
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
            onStartRename={() => {
              setRenamingId(layer.id);
            }}
            onCommitRename={(name) => {
              editor?.renameLayer(layer.id, name);
              setRenamingId(null);
            }}
            onCancelRename={() => {
              setRenamingId(null);
            }}
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
      className={`du-panel-row${active ? " is-active" : ""}`}
      aria-current={active ? "true" : undefined}
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
        {layer.visible ? <Eye {...glyph} /> : <EyeOff {...glyph} />}
      </IconBtn>
      <IconBtn
        title={layer.locked ? "Unlock layer" : "Lock layer"}
        onClick={(ev) => {
          ev.stopPropagation();
          onToggleLock();
        }}
        muted={!layer.locked}
      >
        {layer.locked ? <Lock {...glyph} /> : <Unlock {...glyph} />}
      </IconBtn>
      {renaming ? (
        <input
          autoFocus
          defaultValue={layer.name}
          aria-label="Layer name"
          className="du-panel-input"
          onClick={(ev) => {
            ev.stopPropagation();
          }}
          onBlur={(ev) => {
            onCommitRename(ev.currentTarget.value);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") onCommitRename((ev.target as HTMLInputElement).value);
            else if (ev.key === "Escape") onCancelRename();
          }}
        />
      ) : (
        <span
          className={`du-panel-row-label${layer.visible ? "" : " is-muted"}`}
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
          <Trash2 {...glyph} />
        </IconBtn>
      ) : null}
    </div>
  );
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
    aria-label={title}
    onClick={onClick}
    className={`du-icon-button du-icon-button-flat${muted ? " is-muted" : ""}`}
  >
    {children}
  </button>
);
