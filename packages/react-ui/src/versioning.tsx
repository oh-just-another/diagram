import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  captureFromEditor,
  diffScenes,
  restoreSnapshot,
  type Branch,
  type Snapshot,
  type SnapshotStore,
  type VersionId,
} from "@oh-just-another/versioning";
import { useDiagramOptional } from "./hooks.js";

interface StoreSnapshot {
  readonly branches: readonly Branch[];
  readonly snapshots: readonly Snapshot[];
  readonly currentBranchId: Branch["id"];
}

/**
 * Subscribe to a `SnapshotStore` and return reactive lists of branches +
 * snapshots + the currently-active branch. Pass `null` for hosts that
 * haven't wired versioning — the hook returns empty arrays.
 */
export const useSnapshotStore = (store: SnapshotStore | null): StoreSnapshot => {
  const [state, setState] = useState<StoreSnapshot>(() =>
    store
      ? {
          branches: store.branches(),
          snapshots: store.list(),
          currentBranchId: store.currentBranchId,
        }
      : {
          branches: [],
          snapshots: [],
          currentBranchId: "main" as Branch["id"],
        },
  );

  useEffect(() => {
    if (!store) return undefined;
    const sync = (): void => {
      setState({
        branches: store.branches(),
        snapshots: store.list(),
        currentBranchId: store.currentBranchId,
      });
    };
    sync();
    return store.subscribe(sync);
  }, [store]);

  return state;
};

export interface VersionPanelProps {
  /** Required — host owns the store's lifecycle. */
  readonly store: SnapshotStore;
  /** Author identity used when capturing snapshots. */
  readonly author: { id: string; name: string };
  readonly style?: CSSProperties;
  readonly className?: string;
}

/**
 * Side-panel with a tree of branches + snapshots and capture / restore /
 * branch actions. Branches are flat, snapshots nested inside each branch
 * (no DAG view).
 */
export const VersionPanel = ({ store, author, style, className }: VersionPanelProps) => {
  const editor = useDiagramOptional();
  const { branches, currentBranchId } = useSnapshotStore(store);

  const onCapture = useCallback((): void => {
    if (!editor) return;
    const message =
      typeof window === "undefined" ? "Snapshot" : (window.prompt("Snapshot message", "") ?? "");
    if (message === null) return;
    captureFromEditor(store, editor, { message: message || "Untitled snapshot", author });
  }, [editor, store, author]);

  const onRestore = useCallback(
    (id: VersionId): void => {
      if (!editor) return;
      if (
        typeof window === "undefined" ||
        window.confirm("Restore this version? Local undo history will be cleared.")
      ) {
        restoreSnapshot(store, editor, id);
      }
    },
    [editor, store],
  );

  const onBranch = useCallback(
    (id: VersionId): void => {
      const name =
        typeof window === "undefined" ? "branch" : window.prompt("New branch name", "feature");
      if (!name) return;
      const branch = store.branch({ name, fromVersion: id });
      store.setCurrentBranch(branch.id);
    },
    [store],
  );

  const onDiff = useCallback(
    (id: VersionId): void => {
      if (!editor) return;
      const snap = store.get(id);
      if (!snap) return;
      const diff = diffScenes(snap.scene, editor.scene);
      const summary = [
        `Shapes:      +${diff.shapes.added.length} / -${diff.shapes.removed.length} / ~${diff.shapes.modified.length}`,
        `Edges:       +${diff.edges.added.length} / -${diff.edges.removed.length} / ~${diff.edges.modified.length}`,
        `Layers:      +${diff.layers.added.length} / -${diff.layers.removed.length} / ~${diff.layers.modified.length}`,
        `Annotations: +${diff.annotations.added.length} / -${diff.annotations.removed.length} / ~${diff.annotations.modified.length}`,
      ].join("\n");
      if (typeof window !== "undefined")
        window.alert(`Diff (${snap.message} → current):\n\n${summary}`);
    },
    [editor, store],
  );

  return (
    <aside
      className={className}
      style={{
        flex: "0 0 240px",
        background: "var(--panel, #161616)",
        color: "var(--text, #ddd)",
        borderLeft: "1px solid var(--border, #2a2a2a)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...style,
      }}
    >
      <header
        style={{
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--muted, #888)",
          borderBottom: "1px solid var(--border, #2a2a2a)",
        }}
      >
        Versions
        <button
          type="button"
          onClick={onCapture}
          disabled={!editor}
          title="Capture current scene"
          style={{
            marginLeft: "auto",
            background: "var(--button-bg, #2a2a2a)",
            border: "1px solid var(--border, #2a2a2a)",
            color: "inherit",
            padding: "2px 8px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          + capture
        </button>
      </header>
      <div style={{ flex: 1, overflowY: "auto", fontSize: 12 }}>
        {branches.map((br) => {
          const snapshots = store.listBranch(br.id);
          return (
            <div key={br.id}>
              <button
                type="button"
                onClick={() => store.setCurrentBranch(br.id)}
                style={{
                  display: "flex",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  border: "none",
                  borderBottom: "1px solid var(--divider, #333)",
                  borderLeft:
                    br.id === currentBranchId
                      ? "3px solid var(--accent, #1a73e8)"
                      : "3px solid transparent",
                  background:
                    br.id === currentBranchId
                      ? "var(--cursor-bg, rgba(26,115,232,0.12))"
                      : "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  font: "inherit",
                  fontWeight: 600,
                }}
              >
                {br.name}
                <span style={{ marginLeft: "auto", color: "var(--muted, #888)", fontWeight: 400 }}>
                  {snapshots.length}
                </span>
              </button>
              {snapshots.length === 0 ? (
                <div style={{ padding: "6px 14px", color: "var(--faint, #555)" }}>No snapshots</div>
              ) : (
                snapshots
                  .slice()
                  .reverse()
                  .map((snap) => (
                    <div
                      key={snap.id}
                      style={{
                        display: "flex",
                        gap: 4,
                        padding: "4px 14px",
                        borderBottom: "1px solid var(--divider, #333)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {snap.message}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted, #888)" }}>
                          {snap.author.name} · {formatTime(snap.timestamp)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRestore(snap.id)}
                        style={miniButtonStyle}
                        title="Restore this version"
                      >
                        ↻
                      </button>
                      <button
                        type="button"
                        onClick={() => onDiff(snap.id)}
                        style={miniButtonStyle}
                        title="Diff with current scene"
                      >
                        Δ
                      </button>
                      <button
                        type="button"
                        onClick={() => onBranch(snap.id)}
                        style={miniButtonStyle}
                        title="Branch from here"
                      >
                        ⎇
                      </button>
                    </div>
                  ))
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

const miniButtonStyle: CSSProperties = {
  background: "var(--button-bg, #2a2a2a)",
  border: "1px solid var(--border, #2a2a2a)",
  color: "inherit",
  padding: "0 6px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 11,
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString();
};
