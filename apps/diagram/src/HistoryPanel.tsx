import { describe as describePatch } from "@oh-just-another/history";
import {
  useHistory,
  useScene,
  useDiagramOptional,
  useEditorSelector,
} from "@oh-just-another/react-ui";
import type { Editor } from "@oh-just-another/state";
import type { Patch } from "@oh-just-another/scene";

const EMPTY_STACKS = { past: [] as readonly Patch[], future: [] as readonly Patch[] };

const selectStacks = (e: Editor): { past: readonly Patch[]; future: readonly Patch[] } => ({
  past: e.history.undoStack ?? [],
  future: e.history.redoStack ?? [],
});

export const HistoryPanel = () => {
  // Subscribe so we re-render when undo/redo stacks change. `useScene`
  // serves as the proxy event source — scene mutations are the only way
  // history grows.
  void useScene();
  void useHistory();
  const editor = useDiagramOptional();
  const { past, future } = useEditorSelector<{
    past: readonly Patch[];
    future: readonly Patch[];
  }>((e) => selectStacks(e), EMPTY_STACKS);

  return (
    <aside
      style={{
        width: 220,
        padding: 0,
        background: "var(--panel)",
        color: "var(--text)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        fontSize: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          padding: "10px 12px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--muted)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        History
        <span style={{ textTransform: "none", color: "var(--faint)" }}>
          {past.length} / {past.length + future.length}
        </span>
      </h2>
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "6px 0" }}>
        {past.length === 0 && future.length === 0 ? (
          <Empty>No history yet.</Empty>
        ) : (
          <>
            {past.map((patch, i) => (
              <Item
                key={`p-${i}`}
                label={describePatch(patch)}
                kind="past"
                cursor={i === past.length - 1}
              />
            ))}
            {past.length === 0 ? <Item label="Initial" kind="past" cursor /> : null}
            {future.length > 0 ? <Divider /> : null}
            {future
              .slice()
              .reverse()
              .map((patch, i) => (
                <Item key={`f-${i}`} label={describePatch(patch)} kind="future" cursor={false} />
              ))}
          </>
        )}
      </div>
      {editor ? null : null /* unused but keeps useDiagramOptional in deps */}
    </aside>
  );
};

const Empty = ({ children }: { readonly children: React.ReactNode }) => (
  <div style={{ padding: "10px 12px", color: "var(--faint)", fontStyle: "italic" }}>{children}</div>
);

const Divider = () => (
  <hr
    style={{
      margin: "4px 12px",
      border: 0,
      borderTop: "1px dashed var(--divider)",
    }}
  />
);

const Item = ({
  label,
  kind,
  cursor,
}: {
  readonly label: string;
  readonly kind: "past" | "future";
  readonly cursor: boolean;
}) => (
  <div
    style={{
      padding: "4px 12px",
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: cursor ? "var(--cursor-bg)" : "transparent",
      color: cursor ? "var(--text-strong)" : kind === "future" ? "var(--faint)" : "var(--text)",
    }}
  >
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: cursor
          ? "var(--accent)"
          : kind === "future"
            ? "var(--divider)"
            : "var(--accent-dim)",
        boxShadow: cursor ? "0 0 0 2px var(--accent-halo)" : "none",
        flex: "0 0 auto",
      }}
    />
    <span>{label}</span>
  </div>
);
