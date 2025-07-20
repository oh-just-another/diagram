import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describe as describePatch } from "@oh-just-another/history";
import {
  apply,
  emptyScene,
  getShapeWorldBounds,
  orderBetween,
  type Edge,
  type Patch,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import type { Editor } from "@oh-just-another/state";
import { defaultRegistry, type Template, type TemplateContext } from "@oh-just-another/templates";
import { edgeId, shapeId, type EdgeId, type LayerId, type ShapeId } from "@oh-just-another/types";

/**
 * Bottom-drawer debug panel. Mounted by `apps/diagram` only — not
 * part of the shipped library. Four tabs:
 *
 *   • Inspector  — JSON dump of currently selected shape(s) with
 *                  AABB / metadata / parent relationship.
 *   • State      — editor / scene / viewport / history summary.
 *   • History    — past + future patches, newest first, each
 *                  described via `@oh-just-another/history`'s `describe`.
 *   • Generators — buttons / forms that produce shapes in bulk:
 *                  single add, grid, stack, timed add, pixel
 *                  mosaic from an image. Intended for stress
 *                  testing and exploring layouts.
 *
 * Hotkey: Cmd/Ctrl + Shift + D toggles visibility. Hidden by
 * default. Doesn't block canvas interaction when open — non-modal.
 *
 * Hotkey detection uses `event.code === "KeyD"` so it works on
 * non-Latin keyboard layouts (Cyrillic / Greek / CJK), matching
 * the project's matchKey convention for action hotkeys.
 */
export const DebugPanel = ({ editor }: { editor: Editor | null }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("inspector");

  // Toggle hotkey — Cmd/Ctrl+Shift+D. Layout-independent via
  // `event.code` (works on Cyrillic etc.). Suppressed while a
  // text input has focus so the user can type "D" freely.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const inText =
        ev.target instanceof HTMLInputElement ||
        ev.target instanceof HTMLTextAreaElement ||
        (ev.target as HTMLElement | null)?.isContentEditable;
      if (inText) return;
      const meta = ev.metaKey || ev.ctrlKey;
      if (!meta || !ev.shiftKey) return;
      if (ev.code !== "KeyD") return;
      ev.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Force re-render on every editor mutation. The four tabs read
  // ephemeral fields off the editor — scene, selection, history,
  // mode — that all flow through `notify()`. Subscribing once is
  // cheaper than wiring four separate `editor.on(slice, …)` hooks.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    return editor.subscribe(() => force((v) => v + 1));
  }, [editor]);

  if (!open) return null;
  if (!editor) {
    return (
      <Drawer onClose={() => setOpen(false)} tab={tab} setTab={setTab}>
        <div style={{ padding: 16, color: "var(--muted)" }}>Editor not ready.</div>
      </Drawer>
    );
  }

  return (
    <Drawer onClose={() => setOpen(false)} tab={tab} setTab={setTab}>
      {tab === "inspector" && <InspectorTab editor={editor} />}
      {tab === "state" && <StateTab editor={editor} />}
      {tab === "history" && <HistoryTab editor={editor} />}
      {tab === "generators" && <GeneratorsTab editor={editor} />}
    </Drawer>
  );
};

type TabId = "inspector" | "state" | "history" | "generators";

const TABS: readonly { id: TabId; label: string }[] = [
  { id: "inspector", label: "Inspector" },
  { id: "state", label: "State" },
  { id: "history", label: "History" },
  { id: "generators", label: "Generators" },
];

// ─────────────────────────────────────────────────────────────────
// Drawer chrome
// ─────────────────────────────────────────────────────────────────

const Drawer = ({
  children,
  onClose,
  tab,
  setTab,
}: {
  children: React.ReactNode;
  onClose: () => void;
  tab: TabId;
  setTab: (t: TabId) => void;
}) => (
  <div
    role="dialog"
    aria-label="Debug panel"
    style={{
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      // Bottom-drawer carving roughly the lower 40% of viewport.
      // Tall enough for History scroll, short enough that the
      // canvas above stays usable.
      maxHeight: "42vh",
      minHeight: 220,
      background: "var(--du-ui-bg-solid, #ffffff)",
      color: "var(--du-text, #1a1a1a)",
      borderTop: "1px solid var(--du-ui-border, rgba(0,0,0,0.08))",
      boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.12)",
      zIndex: 1500,
      display: "flex",
      flexDirection: "column",
      fontSize: 12,
      fontFamily: "system-ui, sans-serif",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 8px 0 8px",
        borderBottom: "1px solid var(--du-ui-border, rgba(0,0,0,0.08))",
      }}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          style={{
            background: tab === t.id ? "var(--du-selected-bg, #e6e7ff)" : "transparent",
            color: tab === t.id ? "var(--du-selected-fg, #5753c6)" : "var(--du-text, #1a1a1a)",
            border: "none",
            borderRadius: "6px 6px 0 0",
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ color: "var(--du-text-muted, #6b6b6b)", fontSize: 11, marginRight: 8 }}>
        ⌘⇧D
      </span>
      <button
        type="button"
        onClick={onClose}
        title="Close (Cmd+Shift+D)"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 16,
          color: "var(--du-text-muted, #6b6b6b)",
          padding: "4px 8px",
        }}
      >
        ×
      </button>
    </div>
    <div style={{ flex: 1, overflow: "auto", padding: 12 }}>{children}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// Tab: Inspector
// ─────────────────────────────────────────────────────────────────

const InspectorTab = ({ editor }: { editor: Editor }) => {
  const ids = [...editor.selection];
  const edgeId = editor.selectedEdge;

  if (ids.length === 0 && !edgeId) {
    return <Hint>Select one or more shapes (or an edge) to see details.</Hint>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {ids.map((id) => {
        const shape = editor.scene.shapes.get(id);
        if (!shape) return null;
        return <ShapeCard key={id} shape={shape} />;
      })}
      {edgeId
        ? (() => {
            const edge = editor.scene.edges.get(edgeId);
            return edge ? <EdgeCard key={edgeId} edge={edge} /> : null;
          })()
        : null}
    </div>
  );
};

const ShapeCard = ({ shape }: { shape: Shape }) => {
  let aabb: ReturnType<typeof getShapeWorldBounds> | null = null;
  try {
    aabb = getShapeWorldBounds(shape);
  } catch {
    aabb = null;
  }
  return (
    <Card>
      <Row label="id">
        <Code>{shape.id}</Code>
      </Row>
      <Row label="type">
        <Code>{shape.type}</Code>
      </Row>
      <Row label="position">
        <Code>
          ({fmt(shape.position.x)}, {fmt(shape.position.y)})
        </Code>
      </Row>
      {aabb && (
        <Row label="aabb (world)">
          <Code>
            ({fmt(aabb.x)}, {fmt(aabb.y)}) {fmt(aabb.width)}×{fmt(aabb.height)}
          </Code>
        </Row>
      )}
      <Row label="rotation">
        <Code>{shape.rotation.toFixed(3)} rad</Code>
      </Row>
      <Row label="scale">
        <Code>
          ({shape.scale.x}, {shape.scale.y})
        </Code>
      </Row>
      <Row label="order">
        <Code>{String(shape.order)}</Code>
      </Row>
      {shape.parentId ? (
        <Row label="parent">
          <Code>{shape.parentId}</Code>
        </Row>
      ) : null}
      <Row label="style">
        <pre style={preStyle}>{JSON.stringify(shape.style, null, 2)}</pre>
      </Row>
      {shape.metadata ? (
        <Row label="metadata">
          <pre style={preStyle}>{JSON.stringify(shape.metadata, null, 2)}</pre>
        </Row>
      ) : null}
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: "pointer", color: "var(--du-text-muted, #6b6b6b)" }}>
          full JSON
        </summary>
        <pre style={preStyle}>{stringify(shape)}</pre>
      </details>
    </Card>
  );
};

const EdgeCard = ({ edge }: { edge: import("@oh-just-another/scene").Edge }) => (
  <Card>
    <Row label="id">
      <Code>{edge.id}</Code>
    </Row>
    <Row label="type">
      <Code>edge</Code>
    </Row>
    <Row label="from">
      <pre style={preStyle}>{JSON.stringify(edge.from, null, 2)}</pre>
    </Row>
    <Row label="to">
      <pre style={preStyle}>{JSON.stringify(edge.to, null, 2)}</pre>
    </Row>
    <Row label="style">
      <pre style={preStyle}>{JSON.stringify(edge.style, null, 2)}</pre>
    </Row>
    <details style={{ marginTop: 4 }}>
      <summary style={{ cursor: "pointer", color: "var(--du-text-muted, #6b6b6b)" }}>
        full JSON
      </summary>
      <pre style={preStyle}>{stringify(edge)}</pre>
    </details>
  </Card>
);

// ─────────────────────────────────────────────────────────────────
// Tab: State
// ─────────────────────────────────────────────────────────────────

const StateTab = ({ editor }: { editor: Editor }) => {
  const scene = editor.scene;
  const v = scene.viewport;
  const layers = [...scene.layers.values()];
  return (
    <Card>
      <Section title="Mode">
        <Row label="mode">
          <Code>{editor.mode}</Code>
        </Row>
        <Row label="tool locked">
          <Code>{String(editor.toolLocked)}</Code>
        </Row>
      </Section>
      <Section title="Selection">
        <Row label="shapes">
          <Code>{editor.selection.size}</Code>
        </Row>
        <Row label="edge">
          <Code>{editor.selectedEdge ?? "—"}</Code>
        </Row>
      </Section>
      <Section title="Viewport">
        <Row label="zoom">
          <Code>{(v.zoom * 100).toFixed(1)}%</Code>
        </Row>
        <Row label="pan">
          <Code>
            ({fmt(v.pan.x)}, {fmt(v.pan.y)})
          </Code>
        </Row>
        <Row label="size">
          <Code>
            {v.size.width}×{v.size.height} px
          </Code>
        </Row>
        <Row label="grid">
          <Code>
            {v.gridSize ?? "none"} ({v.gridStyle ?? "lines"})
          </Code>
        </Row>
      </Section>
      <Section title="Scene">
        <Row label="shapes">
          <Code>{scene.shapes.size}</Code>
        </Row>
        <Row label="edges">
          <Code>{scene.edges.size}</Code>
        </Row>
        <Row label="layers">
          <Code>{layers.length}</Code>
        </Row>
      </Section>
      <Section title="History">
        <Row label="undo">
          <Code>{editor.history.size}</Code>
        </Row>
        <Row label="redo">
          <Code>{(editor.history.redoStack?.length ?? 0)}</Code>
        </Row>
        <Row label="canUndo / canRedo">
          <Code>
            {String(editor.canUndo)} / {String(editor.canRedo)}
          </Code>
        </Row>
      </Section>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────
// Tab: History
// ─────────────────────────────────────────────────────────────────

const HistoryTab = ({ editor }: { editor: Editor }) => {
  const past = editor.history.undoStack ?? [];
  const future = editor.history.redoStack ?? [];

  if (past.length === 0 && future.length === 0) {
    return <Hint>No history yet — mutate the scene to populate the timeline.</Hint>;
  }

  // Newest first. Past then future split by a divider.
  const pastDesc = [...past].reverse();
  const futureDesc = [...future];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {pastDesc.map((p, i) => (
        <PatchRow key={`past-${i}`} patch={p} index={past.length - 1 - i} active={i === 0} side="past" />
      ))}
      {futureDesc.length > 0 ? (
        <>
          <div
            style={{
              borderTop: "1px dashed var(--du-ui-border, rgba(0,0,0,0.08))",
              margin: "6px 0",
              color: "var(--du-text-muted, #6b6b6b)",
              fontSize: 11,
              textAlign: "center",
            }}
          >
            ↑ past · future ↓
          </div>
          {futureDesc.map((p, i) => (
            <PatchRow key={`future-${i}`} patch={p} index={i} active={false} side="future" />
          ))}
        </>
      ) : null}
    </div>
  );
};

const PatchRow = ({
  patch,
  index,
  active,
  side,
}: {
  patch: Patch;
  index: number;
  active: boolean;
  side: "past" | "future";
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 8px",
      background: active ? "var(--du-selected-bg, #e6e7ff)" : "transparent",
      borderRadius: 4,
      fontFamily: "ui-monospace, SF Mono, monospace",
      fontSize: 11,
      opacity: side === "future" ? 0.65 : 1,
    }}
  >
    <span style={{ width: 32, color: "var(--du-text-muted, #6b6b6b)" }}>{index}</span>
    <span style={{ flex: 1 }}>{describePatch(patch)}</span>
    <span style={{ color: "var(--du-text-muted, #6b6b6b)" }}>{patch.kind}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// Tab: Generators
// ─────────────────────────────────────────────────────────────────

const GeneratorsTab = ({ editor }: { editor: Editor }) => {
  const templates = useMemo(() => defaultRegistry.list(), []);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const template = templates.find((t) => t.id === templateId) ?? templates[0];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      <Card>
        <Section title="Shape template">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={selectStyle}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.id})
              </option>
            ))}
          </select>
          <Hint compact>Used by every generator below. Live registry from defaultRegistry.</Hint>
        </Section>
        <SingleAddSection editor={editor} template={template} />
        <GridSection editor={editor} template={template} />
        <StackSection editor={editor} template={template} />
        <TimerSection editor={editor} template={template} />
      </Card>
      <Card>
        <MosaicSection editor={editor} />
        <Section title="Danger zone">
          <button
            type="button"
            onClick={() => {
              if (!confirm("Clear ALL shapes and edges from the canvas?")) return;
              clearScene(editor);
            }}
            style={dangerButtonStyle}
          >
            Clear scene
          </button>
          <Hint compact>Wipes history too (loadScene call).</Hint>
        </Section>
      </Card>
    </div>
  );
};

const SingleAddSection = ({
  editor,
  template,
}: {
  editor: Editor;
  template: Template | undefined;
}) => {
  if (!template) return null;
  return (
    <Section title="Single add">
      <button
        type="button"
        onClick={() => {
          const shape = buildOne(editor, template, viewportCenter(editor));
          editor.addShape(shape);
        }}
        style={primaryButtonStyle}
      >
        + Add 1 at viewport center
      </button>
    </Section>
  );
};

const GridSection = ({
  editor,
  template,
}: {
  editor: Editor;
  template: Template | undefined;
}) => {
  const [count, setCount] = useState(50);
  const [cols, setCols] = useState(10);
  const [gap, setGap] = useState(20);
  const [rainbow, setRainbow] = useState(false);
  const [connect, setConnect] = useState(false);
  if (!template) return null;
  return (
    <Section title="Grid">
      <Field label="Count">
        <NumberInput value={count} onChange={setCount} min={1} max={20000} />
      </Field>
      <Field label="Cols">
        <NumberInput value={cols} onChange={setCols} min={1} max={200} />
      </Field>
      <Field label="Gap">
        <NumberInput value={gap} onChange={setGap} min={0} max={500} />
      </Field>
      <CheckboxRow checked={rainbow} onChange={setRainbow} label="Rainbow fill" />
      <CheckboxRow
        checked={connect}
        onChange={setConnect}
        label="Connect first → each"
      />
      <button
        type="button"
        onClick={() =>
          runBatch(editor, () =>
            buildGrid(editor, template, {
              count,
              cols,
              gap,
              rainbow,
              connect,
              origin: viewportTopLeftWithMargin(editor),
            }),
          )
        }
        style={primaryButtonStyle}
      >
        Generate grid
      </button>
    </Section>
  );
};

const StackSection = ({
  editor,
  template,
}: {
  editor: Editor;
  template: Template | undefined;
}) => {
  const [count, setCount] = useState(20);
  const [direction, setDirection] = useState<"horizontal" | "vertical">("horizontal");
  const [gap, setGap] = useState(10);
  if (!template) return null;
  return (
    <Section title="Stack">
      <Field label="Count">
        <NumberInput value={count} onChange={setCount} min={1} max={2000} />
      </Field>
      <Field label="Direction">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "horizontal" | "vertical")}
          style={selectStyle}
        >
          <option value="horizontal">horizontal</option>
          <option value="vertical">vertical</option>
        </select>
      </Field>
      <Field label="Gap">
        <NumberInput value={gap} onChange={setGap} min={0} max={500} />
      </Field>
      <button
        type="button"
        onClick={() =>
          runBatch(editor, () =>
            buildStack(editor, template, {
              count,
              direction,
              gap,
              origin: viewportTopLeftWithMargin(editor),
            }),
          )
        }
        style={primaryButtonStyle}
      >
        Generate stack
      </button>
    </Section>
  );
};

const TimerSection = ({
  editor,
  template,
}: {
  editor: Editor;
  template: Template | undefined;
}) => {
  const [count, setCount] = useState(50);
  const [interval, setInterval] = useState(100);
  const [running, setRunning] = useState(false);
  const [added, setAdded] = useState(0);
  const timerRef = useRef<number | null>(null);
  const addedRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  }, []);

  // Cleanup on unmount or template/editor change.
  useEffect(() => () => stop(), [stop]);

  if (!template) return null;

  const start = () => {
    if (running) return;
    addedRef.current = 0;
    setAdded(0);
    setRunning(true);
    timerRef.current = window.setInterval(() => {
      if (addedRef.current >= count) {
        stop();
        return;
      }
      const shape = buildOne(editor, template, randomInViewport(editor));
      editor.addShape(shape);
      addedRef.current += 1;
      setAdded(addedRef.current);
    }, interval);
  };

  return (
    <Section title="Timer">
      <Field label="Count">
        <NumberInput value={count} onChange={setCount} min={1} max={5000} disabled={running} />
      </Field>
      <Field label="Interval (ms)">
        <NumberInput value={interval} onChange={setInterval} min={16} max={5000} disabled={running} />
      </Field>
      {running ? (
        <button type="button" onClick={stop} style={dangerButtonStyle}>
          Stop ({added}/{count})
        </button>
      ) : (
        <button type="button" onClick={start} style={primaryButtonStyle}>
          Start timed add
        </button>
      )}
    </Section>
  );
};

const MosaicSection = ({ editor }: { editor: Editor }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState("");
  const [pixelSize, setPixelSize] = useState(20);
  const [fixedCols, setFixedCols] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef(false);

  const onUpload = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImageName(file.name);
    };
    img.src = URL.createObjectURL(file);
  };

  const estimate = useMemo(() => {
    if (!image) return null;
    const cols = fixedCols ?? Math.ceil(image.width / pixelSize);
    const rows = Math.ceil((image.height / image.width) * cols);
    return { cols, rows, total: cols * rows };
  }, [image, pixelSize, fixedCols]);

  const generate = async () => {
    if (!image || progress !== null) return;
    if (estimate && estimate.total > 20000) {
      if (!confirm(`Will create ${estimate.total} shapes. Continue?`)) return;
    }
    abortRef.current = false;
    setProgress(0);
    clearScene(editor);
    await runMosaicChunks(editor, image, pixelSize, fixedCols, (p) => {
      setProgress(p);
      return !abortRef.current;
    });
    setProgress(null);
  };

  return (
    <Section title="Pixel mosaic">
      <input
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={onUpload}
        style={{ width: "100%" }}
      />
      {image && (
        <Hint compact>
          {imageName} — {image.width}×{image.height} px
          {estimate ? ` → ${estimate.total} shapes (${estimate.cols}×${estimate.rows})` : null}
        </Hint>
      )}
      <Field label="Pixel size">
        <NumberInput
          value={pixelSize}
          onChange={setPixelSize}
          min={2}
          max={200}
          disabled={progress !== null}
        />
      </Field>
      <CheckboxRow
        checked={fixedCols !== null}
        onChange={(v) => setFixedCols(v ? 50 : null)}
        label="Fixed column count"
      />
      {fixedCols !== null && (
        <Field label="Cols">
          <NumberInput
            value={fixedCols}
            onChange={setFixedCols}
            min={2}
            max={500}
            disabled={progress !== null}
          />
        </Field>
      )}
      {progress !== null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ProgressBar value={progress} />
          <button
            type="button"
            onClick={() => {
              abortRef.current = true;
            }}
            style={dangerButtonStyle}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={generate} disabled={!image} style={primaryButtonStyle}>
          Generate mosaic
        </button>
      )}
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────────
// Generator helpers
// ─────────────────────────────────────────────────────────────────

let debugIdCounter = 0;
const nextDebugId = (prefix: string): ShapeId =>
  shapeId(`debug-${prefix}-${++debugIdCounter}-${Date.now().toString(36)}`);

const activeLayerId = (editor: Editor): LayerId =>
  ([...editor.scene.layers.keys()][0] ?? ("default" as LayerId)) as LayerId;

const buildOne = (
  editor: Editor,
  template: Template,
  position: { x: number; y: number },
): Shape => {
  const ctx: TemplateContext = {
    id: nextDebugId(template.id),
    layerId: activeLayerId(editor),
    position,
    order: orderBetween(editor.scene.shapes.size > 0 ? lastOrder(editor) : null, null),
  };
  return template.factory(ctx);
};

const lastOrder = (editor: Editor): Shape["order"] | null => {
  let max: Shape["order"] | null = null;
  for (const s of editor.scene.shapes.values()) {
    if (max === null || s.order > max) max = s.order;
  }
  return max;
};

interface BuildResult {
  readonly shapes: readonly Shape[];
  readonly edges?: readonly Edge[];
}

// Build a batch of shapes (and optional edges) in-scene without
// going through Editor (so one history entry per generator call).
// Uses `editor.loadScene` which clears history — sensible for bulk
// debug generators. Selection also clears.
const runBatch = (editor: Editor, build: () => BuildResult) => {
  const { shapes, edges = [] } = build();
  if (shapes.length === 0 && edges.length === 0) return;
  let scene = editor.scene;
  for (const sh of shapes) {
    scene = apply(scene, {
      kind: "shape",
      id: sh.id,
      before: null,
      after: sh,
    } satisfies Patch);
  }
  for (const e of edges) {
    scene = apply(scene, {
      kind: "edge",
      id: e.id,
      before: null,
      after: e,
    } satisfies Patch);
  }
  editor.loadScene(scene);
};

const clearScene = (editor: Editor) => {
  // Preserve viewport (zoom/pan/grid) — only blow away shapes/edges.
  const v = editor.scene.viewport;
  let s = emptyScene();
  s = { ...s, viewport: v };
  editor.loadScene(s);
};

interface GridOptions {
  readonly count: number;
  readonly cols: number;
  readonly gap: number;
  readonly rainbow: boolean;
  readonly connect: boolean;
  readonly origin: { x: number; y: number };
}

const buildGrid = (
  editor: Editor,
  template: Template,
  opts: GridOptions,
): BuildResult => {
  const shapes: Shape[] = [];
  const layerId = activeLayerId(editor);
  // Build first instance to measure the cell size (templates have
  // different intrinsic sizes — rectangle is 140×80, sticky is
  // 120×100, etc.).
  const probe = template.factory({
    id: nextDebugId(`${template.id}-probe`),
    layerId,
    position: { x: 0, y: 0 },
    order: orderBetween(null, null),
  });
  const probeBounds = safeBounds(probe);
  const cellW = probeBounds.width;
  const cellH = probeBounds.height;
  const strideX = cellW + opts.gap;
  const strideY = cellH + opts.gap;

  let order: Shape["order"] = orderBetween(lastOrder(editor), null);
  for (let i = 0; i < opts.count; i++) {
    const col = i % opts.cols;
    const row = Math.floor(i / opts.cols);
    const x = opts.origin.x + col * strideX;
    const y = opts.origin.y + row * strideY;
    const shape = template.factory({
      id: nextDebugId(template.id),
      layerId,
      position: { x, y },
      order,
    });
    shapes.push(opts.rainbow ? withFill(shape, rainbow(i, opts.count)) : shape);
    order = orderBetween(order, null);
  }

  if (!opts.connect || shapes.length < 2) {
    return { shapes };
  }
  // Edges from the first shape to every other, bound by named
  // "center" anchor on both ends — so moving any shape later still
  // keeps the edge attached (the renderer re-resolves the anchor
  // each frame). Good for stress-testing edge routing under
  // movement.
  const edges: Edge[] = [];
  const head = shapes[0]!;
  let edgeOrder: Edge["order"] = orderBetween(null, null);
  for (let i = 1; i < shapes.length; i++) {
    const target = shapes[i]!;
    edges.push({
      id: nextDebugEdgeId(`grid-${i}`),
      layerId,
      from: {
        kind: "anchor",
        shapeId: head.id,
        anchor: { kind: "named", name: "center" },
      },
      to: {
        kind: "anchor",
        shapeId: target.id,
        anchor: { kind: "named", name: "center" },
      },
      order: edgeOrder,
      style: { stroke: "#888888", strokeWidth: 1 },
      arrowheads: { to: "triangle" },
    });
    edgeOrder = orderBetween(edgeOrder, null);
  }
  return { shapes, edges };
};

let debugEdgeCounter = 0;
const nextDebugEdgeId = (prefix: string): EdgeId =>
  edgeId(`debug-edge-${prefix}-${++debugEdgeCounter}-${Date.now().toString(36)}`);

interface StackOptions {
  readonly count: number;
  readonly direction: "horizontal" | "vertical";
  readonly gap: number;
  readonly origin: { x: number; y: number };
}

const buildStack = (
  editor: Editor,
  template: Template,
  opts: StackOptions,
): BuildResult => {
  const shapes: Shape[] = [];
  const layerId = activeLayerId(editor);
  let cursorX = opts.origin.x;
  let cursorY = opts.origin.y;
  let order: Shape["order"] = orderBetween(lastOrder(editor), null);
  for (let i = 0; i < opts.count; i++) {
    const shape = template.factory({
      id: nextDebugId(template.id),
      layerId,
      position: { x: cursorX, y: cursorY },
      order,
    });
    shapes.push(shape);
    const b = safeBounds(shape);
    if (opts.direction === "horizontal") cursorX += b.width + opts.gap;
    else cursorY += b.height + opts.gap;
    order = orderBetween(order, null);
  }
  return { shapes };
};

const safeBounds = (shape: Shape) => {
  try {
    return getShapeWorldBounds(shape);
  } catch {
    return { x: 0, y: 0, width: 80, height: 60 };
  }
};

const withFill = (shape: Shape, fill: string): Shape =>
  ({ ...shape, style: { ...shape.style, fill } }) as Shape;

// The project's color parser (packages/math/src/color.ts) accepts only
// hex / rgb / rgba / a small named set — `hsl()` falls back to opaque
// black + a dev-time warn. So convert HSL → hex inline.
const rainbow = (i: number, total: number): string => {
  const hue = (i / Math.max(total, 1)) * 360;
  return hslToHex(hue, 70, 80);
};

const hslToHex = (h: number, s: number, l: number): string => {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = ln - c / 2;
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round((v + m) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r1)}${to(g1)}${to(b1)}`;
};

const viewportCenter = (editor: Editor): { x: number; y: number } => {
  const v = editor.scene.viewport;
  return {
    x: v.pan.x + v.size.width / (2 * v.zoom),
    y: v.pan.y + v.size.height / (2 * v.zoom),
  };
};

const viewportTopLeftWithMargin = (editor: Editor): { x: number; y: number } => {
  const v = editor.scene.viewport;
  return { x: v.pan.x + 40 / v.zoom, y: v.pan.y + 40 / v.zoom };
};

const randomInViewport = (editor: Editor): { x: number; y: number } => {
  const v = editor.scene.viewport;
  return {
    x: v.pan.x + Math.random() * (v.size.width / v.zoom),
    y: v.pan.y + Math.random() * (v.size.height / v.zoom),
  };
};

// Mosaic generation. Async chunking via requestAnimationFrame so
// the browser doesn't lock on large images. `onProgress` returns
// false to abort.
const runMosaicChunks = async (
  editor: Editor,
  image: HTMLImageElement,
  pixelSize: number,
  fixedCols: number | null,
  onProgress: (p: number) => boolean,
): Promise<void> => {
  // Sample image pixels via an offscreen 2D canvas.
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height);

  const cols = fixedCols ?? Math.ceil(image.width / pixelSize);
  const rows = Math.ceil((image.height / image.width) * cols);
  const sampleW = image.width / cols;
  const sampleH = image.height / rows;

  const layerId = activeLayerId(editor);
  let scene = editor.scene;
  let order: Shape["order"] = orderBetween(null, null);
  const origin = viewportTopLeftWithMargin(editor);

  const total = cols * rows;
  const CHUNK = 500;
  let done = 0;

  while (done < total) {
    if (!onProgress(Math.round((done / total) * 100))) {
      return; // aborted
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const end = Math.min(done + CHUNK, total);
    for (let i = done; i < end; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const sampleX = Math.floor(col * sampleW);
      const sampleY = Math.floor(row * sampleH);
      const color = averagePixel(
        data,
        sampleX,
        sampleY,
        Math.max(1, Math.floor(sampleW)),
        Math.max(1, Math.floor(sampleH)),
        image.width,
      );
      const shape: Shape = {
        id: nextDebugId(`mosaic-${i}`),
        layerId,
        type: "rectangle",
        position: {
          x: origin.x + col * pixelSize,
          y: origin.y + row * pixelSize,
        },
        rotation: 0,
        scale: { x: 1, y: 1 },
        order,
        style: { fill: color, stroke: color, strokeWidth: 0 },
        width: pixelSize,
        height: pixelSize,
      };
      scene = apply(scene, {
        kind: "shape",
        id: shape.id,
        before: null,
        after: shape,
      } satisfies Patch);
      order = orderBetween(order, null);
    }
    done = end;
    // Push the partial scene to the editor on every chunk so the
    // user sees the mosaic build up progressively.
    editor.loadScene(scene);
  }
  onProgress(100);
};

const averagePixel = (
  data: ImageData,
  x0: number,
  y0: number,
  w: number,
  h: number,
  imgW: number,
): string => {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const x1 = Math.min(x0 + w, data.width);
  const y1 = Math.min(y0 + h, data.height);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * imgW + x) * 4;
      r += data.data[i] ?? 0;
      g += data.data[i + 1] ?? 0;
      b += data.data[i + 2] ?? 0;
      n++;
    }
  }
  if (n === 0) return "#ffffff";
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
};

// ─────────────────────────────────────────────────────────────────
// Small UI primitives
// ─────────────────────────────────────────────────────────────────

const Card = ({ children }: { children: React.ReactNode }) => (
  <section
    style={{
      background: "var(--du-ui-bg, rgba(255,255,255,0.95))",
      border: "1px solid var(--du-ui-border, rgba(0,0,0,0.08))",
      borderRadius: 8,
      padding: 10,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minWidth: 0,
    }}
  >
    {children}
  </section>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <h3
      style={{
        margin: 0,
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "var(--du-text-muted, #6b6b6b)",
      }}
    >
      {title}
    </h3>
    {children}
  </div>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "120px 1fr",
      gap: 8,
      alignItems: "start",
      fontSize: 11,
    }}
  >
    <span style={{ color: "var(--du-text-muted, #6b6b6b)" }}>{label}</span>
    <div style={{ minWidth: 0 }}>{children}</div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
    <span style={{ width: 90, color: "var(--du-text-muted, #6b6b6b)" }}>{label}</span>
    <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
  </label>
);

const NumberInput = ({
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) => (
  <input
    type="number"
    value={value}
    onChange={(e) => {
      const v = Number(e.target.value);
      if (!Number.isNaN(v)) onChange(v);
    }}
    min={min}
    max={max}
    disabled={disabled}
    style={{
      width: "100%",
      height: 24,
      padding: "0 6px",
      fontSize: 11,
      border: "1px solid var(--du-ui-border, rgba(0,0,0,0.08))",
      borderRadius: 4,
      background: "var(--du-ui-bg-solid, #ffffff)",
      color: "var(--du-text, #1a1a1a)",
      boxSizing: "border-box",
    }}
  />
);

const CheckboxRow = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) => (
  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const Hint = ({ children, compact }: { children: React.ReactNode; compact?: boolean }) => (
  <div
    style={{
      fontSize: 11,
      color: "var(--du-text-muted, #6b6b6b)",
      fontStyle: "italic",
      padding: compact ? 0 : 24,
      textAlign: compact ? "left" : "center",
    }}
  >
    {children}
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code
    style={{
      fontFamily: "ui-monospace, SF Mono, monospace",
      fontSize: 11,
      color: "var(--du-text, #1a1a1a)",
      wordBreak: "break-all",
    }}
  >
    {children}
  </code>
);

const ProgressBar = ({ value }: { value: number }) => (
  <div
    style={{
      flex: 1,
      height: 6,
      background: "var(--du-ui-border, rgba(0,0,0,0.08))",
      borderRadius: 3,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        width: `${Math.max(0, Math.min(100, value))}%`,
        height: "100%",
        background: "var(--du-accent, #5b5bd6)",
        transition: "width 0.1s linear",
      }}
    />
  </div>
);

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: "4px 6px",
  background: "var(--du-ui-bg, rgba(0,0,0,0.04))",
  border: "1px solid var(--du-ui-border, rgba(0,0,0,0.06))",
  borderRadius: 4,
  fontFamily: "ui-monospace, SF Mono, monospace",
  fontSize: 10,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: 160,
  overflow: "auto",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  height: 24,
  fontSize: 11,
  border: "1px solid var(--du-ui-border, rgba(0,0,0,0.08))",
  borderRadius: 4,
  background: "var(--du-ui-bg-solid, #ffffff)",
  color: "var(--du-text, #1a1a1a)",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 12px",
  background: "var(--du-selected-bg, #e6e7ff)",
  color: "var(--du-selected-fg, #5753c6)",
  border: "1px solid var(--du-ui-border, rgba(0,0,0,0.08))",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  height: 28,
  padding: "0 12px",
  background: "transparent",
  color: "var(--du-danger, #e54d2e)",
  border: "1px solid var(--du-danger, #e54d2e)",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};

const fmt = (n: number): string =>
  Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(1);

// Custom JSON stringify that handles Map / Set fields gracefully —
// scene fields like `shapes` / `edges` are Maps and would print as
// "{}" with plain JSON.stringify.
const stringify = (v: unknown): string =>
  JSON.stringify(
    v,
    (_key, value) => {
      if (value instanceof Map) return Object.fromEntries(value);
      if (value instanceof Set) return [...value];
      return value;
    },
    2,
  );
