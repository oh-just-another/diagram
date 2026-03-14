import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describe as describePatch } from "@oh-just-another/history";
import {
  apply,
  emptyScene,
  getElementWorldBounds,
  orderBetween,
  type Link,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import type { Editor } from "@oh-just-another/state";
import { defaultRegistry, type Template, type TemplateContext } from "@oh-just-another/templates";
import { linkId, elementId, type LinkId, type LayerId, type ElementId } from "@oh-just-another/types";

/**
 * Window (ms) within which the "g d" debug-toggle sequence must
 * complete — press `g`, then `d` faster than this to toggle the panel.
 */
const DEBUG_TOGGLE_SEQUENCE_WINDOW_MS = 600;

/** Renderer backend choices surfaced in the Display tab. */
const RENDERERS = ["auto", "canvas2d", "webgl2", "offscreen"] as const;
type RendererChoice = (typeof RENDERERS)[number];

/** Current renderer override from the URL (search or hash); "auto" when absent. */
const readRendererParam = (): RendererChoice => {
  if (typeof window === "undefined") return "auto";
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const r = search.get("renderer") ?? hash.get("renderer");
  return r === "canvas2d" || r === "webgl2" || r === "offscreen" ? r : "auto";
};

/**
 * Write the renderer override to the URL search param and navigate (full
 * reload) — the backend is decided once at startup, so a switch needs a
 * reload. Strips any `renderer` left in the hash so it can't shadow the
 * search param; preserves other hash keys (e.g. the collab `room`).
 */
const applyRendererParam = (choice: RendererChoice): void => {
  const url = new URL(window.location.href);
  if (choice === "auto") url.searchParams.delete("renderer");
  else url.searchParams.set("renderer", choice);
  if (url.hash) {
    const h = new URLSearchParams(url.hash.replace(/^#/, ""));
    if (h.has("renderer")) {
      h.delete("renderer");
      const s = h.toString();
      url.hash = s ? `#${s}` : "";
    }
  }
  window.location.href = url.toString();
};

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
 * Hotkey: press `d` then `d` (a key sequence, no modifiers) toggles
 * visibility. Hidden by default. Doesn't block canvas interaction when
 * open — non-modal.
 *
 * Detection uses `event.code` (KeyD) so it works on non-Latin keyboard
 * layouts (Cyrillic / Greek / CJK), matching the project's matchKey
 * convention. The listener is on `window`, so it fires regardless of
 * focus (unless a text field is focused).
 */
export const DebugPanel = ({ editor }: { editor: Editor | null }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("inspector");

  // Toggle hotkey — the "g d" key sequence (no modifiers), global on
  // `window`. Layout-independent via `event.code`. Suppressed while a
  // text field is focused so typing isn't hijacked.
  useEffect(() => {
    let lastGAt = 0;
    const onKey = (ev: KeyboardEvent) => {
      const inText =
        ev.target instanceof HTMLInputElement ||
        ev.target instanceof HTMLTextAreaElement ||
        (ev.target as HTMLElement | null)?.isContentEditable;
      if (inText) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.code === "KeyG") {
        lastGAt = ev.timeStamp;
        return;
      }
      if (ev.code === "KeyD" && ev.timeStamp - lastGAt <= DEBUG_TOGGLE_SEQUENCE_WINDOW_MS) {
        lastGAt = 0;
        ev.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // Any other key breaks a pending sequence.
      lastGAt = 0;
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);

  // Force re-render on every editor mutation. The four tabs read
  // ephemeral fields off the editor — scene, selection, history,
  // mode — that all flow through `notify()`. Subscribing once is
  // cheaper than wiring four separate `editor.on(slice, …)` hooks.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    return editor.subscribe(() => { force((v) => v + 1); });
  }, [editor]);

  if (!open) return null;
  if (!editor) {
    return (
      <Drawer onClose={() => { setOpen(false); }} tab={tab} setTab={setTab}>
        <div style={{ padding: 16, color: "var(--muted)" }}>Editor not ready.</div>
      </Drawer>
    );
  }

  return (
    <Drawer onClose={() => { setOpen(false); }} tab={tab} setTab={setTab}>
      {tab === "inspector" && <InspectorTab editor={editor} />}
      {tab === "state" && <StateTab editor={editor} />}
      {tab === "history" && <HistoryTab editor={editor} />}
      {tab === "generators" && <GeneratorsTab editor={editor} />}
      {tab === "display" && <DisplayTab editor={editor} />}
    </Drawer>
  );
};

type TabId = "inspector" | "state" | "history" | "generators" | "display";

const TABS: readonly { id: TabId; label: string }[] = [
  { id: "inspector", label: "Inspector" },
  { id: "state", label: "State" },
  { id: "history", label: "History" },
  { id: "generators", label: "Generators" },
  { id: "display", label: "Display" },
];

/**
 * Display tab — runtime view settings: a renderer-backend switch (reloads,
 * since the backend is chosen at startup) and a debug hit-zone overlay
 * toggle (visualises the tuned mouse hit-targets for every element).
 */
const DisplayTab = ({ editor }: { editor: Editor }) => {
  const [renderer, setRenderer] = useState<RendererChoice>(() => readRendererParam());
  const [hitZones, setHitZones] = useState<boolean>(() => editor.debugHitZones);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="dbg-renderer" style={{ fontWeight: 600 }}>
          Renderer backend
        </label>
        <select
          id="dbg-renderer"
          value={renderer}
          onChange={(ev) => {
            const v = ev.target.value as RendererChoice;
            setRenderer(v);
            applyRendererParam(v);
          }}
          style={{ padding: "4px 6px" }}
        >
          {RENDERERS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--du-text-muted, #6b6b6b)", fontSize: 11 }}>
          Switching reloads the page — the backend is chosen once at startup.
        </span>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={hitZones}
          onChange={(ev) => {
            setHitZones(ev.target.checked);
            editor.setDebugHitZones(ev.target.checked);
          }}
        />
        <span>
          Show hit-zones
          <br />
          <span style={{ color: "var(--du-text-muted, #6b6b6b)", fontSize: 11 }}>
            Mouse hit-targets for every element: resize handles, edge endpoints, edge bodies.
          </span>
        </span>
      </label>
    </div>
  );
};

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
          onClick={() => { setTab(t.id); }}
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
  const linkId = editor.selectedLink;

  if (ids.length === 0 && !linkId) {
    return <Hint>Select one or more shapes (or an edge) to see details.</Hint>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {ids.map((id) => {
        const shape = editor.scene.elements.get(id);
        if (!shape) return null;
        return <ShapeCard key={id} shape={shape} />;
      })}
      {linkId
        ? (() => {
            const edge = editor.scene.links.get(linkId);
            return edge ? <LinkCard key={linkId} edge={edge} /> : null;
          })()
        : null}
    </div>
  );
};

const ShapeCard = ({ shape }: { shape: Element }) => {
  let aabb: ReturnType<typeof getElementWorldBounds> | null = null;
  try {
    aabb = getElementWorldBounds(shape);
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

const LinkCard = ({ edge }: { edge: import("@oh-just-another/scene").Link }) => (
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
          <Code>{editor.selectedLink ?? "—"}</Code>
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
          <Code>{scene.elements.size}</Code>
        </Row>
        <Row label="edges">
          <Code>{scene.links.size}</Code>
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
        <Section title="Element template">
          <select
            value={templateId}
            onChange={(e) => { setTemplateId(e.target.value); }}
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
        <FractalSection editor={editor} template={template} />
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
          editor.addElement(shape);
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
          { runBatch(editor, () =>
            buildGrid(editor, template, {
              count,
              cols,
              gap,
              rainbow,
              connect,
              origin: viewportTopLeftWithMargin(editor),
            }),
          ); }
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
          onChange={(e) => { setDirection(e.target.value as "horizontal" | "vertical"); }}
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
          { runBatch(editor, () =>
            buildStack(editor, template, {
              count,
              direction,
              gap,
              origin: viewportTopLeftWithMargin(editor),
            }),
          ); }
        }
        style={primaryButtonStyle}
      >
        Generate stack
      </button>
    </Section>
  );
};

const FRACTAL_TYPES: readonly { id: FractalType; label: string }[] = [
  { id: "tree", label: "Recursive tree" },
  { id: "mandelbrot", label: "Mandelbrot set" },
  { id: "julia", label: "Julia set" },
  { id: "dejong", label: "De Jong attractor" },
  { id: "clifford", label: "Clifford attractor" },
];

// Per-type meaning of the two numeric knobs + how to estimate the
// resulting shape count (for the cap guard).
const FRACTAL_CONFIG: Record<
  FractalType,
  {
    readonly aLabel: string; // "depth" knob
    readonly aMin: number;
    readonly aMax: number;
    readonly bLabel: string; // "detail" knob
    readonly bMin: number;
    readonly bMax: number;
    readonly estimate: (a: number, b: number) => number;
  }
> = {
  tree: {
    aLabel: "Depth",
    aMin: 1,
    aMax: 9,
    bLabel: "Branches / node",
    bMin: 1,
    bMax: 5,
    estimate: (a, b) => (b <= 1 ? a + 1 : Math.round((b ** (a + 1) - 1) / (b - 1))),
  },
  mandelbrot: {
    aLabel: "Max iterations",
    aMin: 10,
    aMax: 500,
    bLabel: "Boundary detail (subdiv depth)",
    bMin: 4,
    bMax: 11,
    // Adaptive quadtree: rough upper bound (8×8 base grid, boundary
    // cells double per level). Real count is far lower — the runtime
    // cap is authoritative; this just gates the obviously-too-big.
    estimate: (_a, b) => 64 * 2 ** b,
  },
  julia: {
    aLabel: "Max iterations",
    aMin: 10,
    aMax: 500,
    bLabel: "Boundary detail (subdiv depth)",
    bMin: 4,
    bMax: 11,
    estimate: (_a, b) => 64 * 2 ** b,
  },
  dejong: {
    aLabel: "Points (×1000)",
    aMin: 1,
    aMax: 50,
    bLabel: "Point scale %",
    bMin: 2,
    bMax: 40,
    estimate: (a) => a * 1000,
  },
  clifford: {
    aLabel: "Points (×1000)",
    aMin: 1,
    aMax: 50,
    bLabel: "Point scale %",
    bMin: 2,
    bMax: 40,
    estimate: (a) => a * 1000,
  },
};

const FractalSection = ({
  editor,
  template,
}: {
  editor: Editor;
  template: Template | undefined;
}) => {
  const [type, setType] = useState<FractalType>("mandelbrot");
  const [a, setA] = useState(120); // mandelbrot maxIter default
  const [b, setB] = useState(8); // mandelbrot subdivision-depth default
  const [colorful, setColorful] = useState(true);
  const [skipOutside, setSkipOutside] = useState(true);
  if (!template) return null;
  const isEscape = type === "mandelbrot" || type === "julia";
  const cfg = FRACTAL_CONFIG[type];
  const estimate = cfg.estimate(a, b);
  const tooBig = estimate > FRACTAL_MAX_SHAPES;
  return (
    <Section title="Fractal">
      <Field label="Type">
        <select
          value={type}
          onChange={(e) => {
            const next = e.target.value as FractalType;
            setType(next);
            // Re-seed knobs to the new type's sensible defaults so the
            // ranges (iterations vs depth) don't carry over nonsensically.
            const c = FRACTAL_CONFIG[next];
            setA(Math.min(Math.max(a, c.aMin), c.aMax));
            setB(Math.min(Math.max(b, c.bMin), c.bMax));
          }}
          style={selectStyle}
        >
          {FRACTAL_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={cfg.aLabel}>
        <NumberInput value={a} onChange={setA} min={cfg.aMin} max={cfg.aMax} />
      </Field>
      <Field label={cfg.bLabel}>
        <NumberInput value={b} onChange={setB} min={cfg.bMin} max={cfg.bMax} />
      </Field>
      <CheckboxRow checked={colorful} onChange={setColorful} label="Colorful" />
      {isEscape ? (
        <CheckboxRow
          checked={skipOutside}
          onChange={setSkipOutside}
          label="Skip far exterior (fewer shapes)"
        />
      ) : null}
      <Hint compact>
        ≈ {estimate.toLocaleString()} shapes
        {tooBig ? ` — over ${FRACTAL_MAX_SHAPES.toLocaleString()} cap, lower the knobs` : ""}
      </Hint>
      <button
        type="button"
        disabled={tooBig}
        onClick={() => {
          runBatch(editor, () =>
            buildFractal(editor, template, {
              type,
              a,
              b,
              colorful,
              skipOutside,
              origin: viewportCenter(editor),
            }),
          );
          // Frame the whole fractal — zooms out to show the macro
          // structure (≈5% for a large set) while the fine elements
          // hold detail down to deep zoom (up to 3200%). "Depth" here
          // = the scale range you can explore, not just recursion.
          editor.zoomToFit();
        }}
        style={tooBig ? disabledButtonStyle : primaryButtonStyle}
      >
        Generate fractal
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
  useEffect(() => () => { stop(); }, [stop]);

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
      editor.addElement(shape);
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
        onChange={(v) => { setFixedCols(v ? 50 : null); }}
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
const nextDebugId = (prefix: string): ElementId =>
  elementId(`debug-${prefix}-${++debugIdCounter}-${Date.now().toString(36)}`);

const activeLayerId = (editor: Editor): LayerId =>
  ([...editor.scene.layers.keys()][0] ?? ("default" as LayerId));

const buildOne = (
  editor: Editor,
  template: Template,
  position: { x: number; y: number },
): Element => {
  const ctx: TemplateContext = {
    id: nextDebugId(template.id),
    layerId: activeLayerId(editor),
    position,
    order: orderBetween(editor.scene.elements.size > 0 ? lastOrder(editor) : null, null),
  };
  return template.factory(ctx);
};

const lastOrder = (editor: Editor): Element["order"] | null => {
  let max: Element["order"] | null = null;
  for (const s of editor.scene.elements.values()) {
    if (max === null || s.order > max) max = s.order;
  }
  return max;
};

interface BuildResult {
  readonly shapes: readonly Element[];
  readonly edges?: readonly Link[];
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
      kind: "element",
      id: sh.id,
      before: null,
      after: sh,
    } satisfies Patch);
  }
  for (const e of edges) {
    scene = apply(scene, {
      kind: "link",
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
  const shapes: Element[] = [];
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

  let order: Element["order"] = orderBetween(lastOrder(editor), null);
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
  // Links from the first shape to every other, bound by named
  // "center" anchor on both ends — so moving any shape later still
  // keeps the edge attached (the renderer re-resolves the anchor
  // each frame). Good for stress-testing edge routing under
  // movement.
  const edges: Link[] = [];
  const head = shapes[0]!;
  let edgeOrder: Link["order"] = orderBetween(null, null);
  for (let i = 1; i < shapes.length; i++) {
    const target = shapes[i]!;
    edges.push({
      id: nextDebugLinkId(`grid-${i}`),
      layerId,
      from: {
        kind: "anchor",
        elementId: head.id,
        anchor: { kind: "named", name: "center" },
      },
      to: {
        kind: "anchor",
        elementId: target.id,
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

let debugLinkCounter = 0;
const nextDebugLinkId = (prefix: string): LinkId =>
  linkId(`debug-edge-${prefix}-${++debugLinkCounter}-${Date.now().toString(36)}`);

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
  const shapes: Element[] = [];
  const layerId = activeLayerId(editor);
  let cursorX = opts.origin.x;
  let cursorY = opts.origin.y;
  let order: Element["order"] = orderBetween(lastOrder(editor), null);
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

// Hard cap on generated shapes — keeps an accidental huge-resolution
// generate from locking the tab.
const FRACTAL_MAX_SHAPES = 50_000;

type FractalType = "tree" | "mandelbrot" | "julia" | "dejong" | "clifford";

interface FractalOptions {
  readonly type: FractalType;
  /** Knob A — depth (tree) / max iterations (mandel/julia) / points×1000 (attractor). */
  readonly a: number;
  /** Knob B — branches (tree) / subdiv depth (mandel/julia) / point scale % (attractor). */
  readonly b: number;
  readonly colorful: boolean;
  /** Mandelbrot/Julia: drop the far-exterior fill (fast-escaping flat cells). */
  readonly skipOutside?: boolean;
  readonly origin: { x: number; y: number };
}

/**
 * World-space size the fractals are laid out over. Deliberately large
 * (~14k px): at the editor's MIN_ZOOM (5%) a 14k fractal fills the
 * viewport, and the fine elements still hold detail when you zoom all
 * the way to MAX_ZOOM (3200%). That scale range — not recursion alone
 * — is the "depth" you explore by zooming.
 */
const FRACTAL_WORLD_SPAN = 14000;

const buildFractal = (
  editor: Editor,
  template: Template,
  opts: FractalOptions,
): BuildResult => {
  switch (opts.type) {
    case "tree":
      return buildTreeFractal(editor, template, opts);
    case "mandelbrot":
    case "julia":
      return buildEscapeFractal(editor, template, opts);
    case "dejong":
    case "clifford":
      return buildAttractorFractal(editor, template, opts);
  }
};

// A small shape placed at a world point, scaled to `scale`, optionally
// recoloured. Shared by the point/grid fractals.
const placePoint = (
  template: Template,
  layerId: LayerId,
  x: number,
  y: number,
  scale: number,
  order: Element["order"],
  fill: string | null,
): Element => {
  const base = template.factory({
    id: nextDebugId(template.id),
    layerId,
    position: { x, y },
    order,
  });
  const shape = { ...base, scale: { x: scale, y: scale } } as Element;
  return fill ? withFill(shape, fill) : shape;
};

// ── Recursive tree (IFS-style) ──────────────────────────────────────
const FRACTAL_ANGLE_SPREAD = Math.PI / 4.5; // ~40° fan
const FRACTAL_SCALE_RATIO = 0.7;

const buildTreeFractal = (
  editor: Editor,
  template: Template,
  opts: FractalOptions,
): BuildResult => {
  const depth = opts.a;
  const branches = opts.b;
  const shapes: Element[] = [];
  const layerId = activeLayerId(editor);
  const probe = template.factory({
    id: nextDebugId(`${template.id}-probe`),
    layerId,
    position: { x: 0, y: 0 },
    order: orderBetween(null, null),
  });
  const segLen = safeBounds(probe).height || 80;
  let order: Element["order"] = orderBetween(lastOrder(editor), null);

  const place = (x: number, y: number, angle: number, scale: number, level: number): void => {
    if (shapes.length >= FRACTAL_MAX_SHAPES) return;
    const base = template.factory({
      id: nextDebugId(template.id),
      layerId,
      position: { x, y },
      order,
    });
    order = orderBetween(order, null);
    let shape: Element = { ...base, rotation: angle, scale: { x: scale, y: scale } };
    if (opts.colorful) shape = withFill(shape, hslToHex((level / Math.max(depth, 1)) * 300, 70, 62));
    shapes.push(shape);
    if (level >= depth) return;
    const tipX = x + Math.sin(angle) * segLen * scale;
    const tipY = y - Math.cos(angle) * segLen * scale;
    const n = Math.max(1, branches);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      place(tipX, tipY, angle + t * FRACTAL_ANGLE_SPREAD * 2, scale * FRACTAL_SCALE_RATIO, level + 1);
    }
  };
  // Root scale sized so the tree spans ≈ FRACTAL_WORLD_SPAN: total
  // height ≈ segLen × rootScale × Σ ratioⁿ. Σ ≈ 1/(1-0.7) ≈ 3.3.
  const rootScale = FRACTAL_WORLD_SPAN / (segLen * 3.3);
  place(opts.origin.x, opts.origin.y, 0, rootScale, 0);
  return { shapes };
};

// ── Mandelbrot / Julia (escape-time, grid of points) ────────────────
const JULIA_C = { re: -0.7, im: 0.27015 }; // classic dendrite Julia constant

// Force at least this much subdivision before merging kicks in, so a
// top-down quadtree from the whole plane can't collapse the set into a
// single cell by sampling-luck. 2 → a 4×4 base before adaptive merge.
const ESCAPE_MIN_DEPTH = 2;

const buildEscapeFractal = (
  editor: Editor,
  template: Template,
  opts: FractalOptions,
): BuildResult => {
  const maxIter = opts.a;
  const maxDepth = opts.b; // quadtree subdivision depth
  const isJulia = opts.type === "julia";
  // Complex-plane window. Mandelbrot centred on the cardioid; Julia on origin.
  const [re0, re1, im0, im1] = isJulia ? [-1.6, 1.6, -1.6, 1.6] : [-2.2, 0.8, -1.4, 1.4];
  const shapes: Element[] = [];
  const layerId = activeLayerId(editor);
  const probe = template.factory({
    id: nextDebugId(`${template.id}-probe`),
    layerId,
    position: { x: 0, y: 0 },
    order: orderBetween(null, null),
  });
  const baseW = safeBounds(probe).width || 80;
  let order: Element["order"] = orderBetween(lastOrder(editor), null);
  // Below this escape-time a flat cell counts as "far exterior" — the
  // fast-escaping background. With `skipOutside` we drop those fills
  // entirely, keeping only the set interior + coloured near-boundary
  // bands. Relative to maxIter so it tracks the colour ramp.
  const outsideThreshold = Math.max(2, Math.floor(maxIter * 0.03));

  const escape = (cRe: number, cIm: number): number => {
    let zRe = isJulia ? cRe : 0;
    let zIm = isJulia ? cIm : 0;
    const kRe = isJulia ? JULIA_C.re : cRe;
    const kIm = isJulia ? JULIA_C.im : cIm;
    let iter = 0;
    while (iter < maxIter && zRe * zRe + zIm * zIm <= 4) {
      const nRe = zRe * zRe - zIm * zIm + kRe;
      zIm = 2 * zRe * zIm + kIm;
      zRe = nRe;
      iter++;
    }
    return iter;
  };

  // Place one element for a complex-plane cell, sized to the cell —
  // deep-subdivided boundary cells are tiny, flat regions stay large.
  // That size spread is the fractal "depth": zoom into an edge and the
  // recursively-smaller elements reveal more structure.
  const emit = (rx0: number, rx1: number, ry0: number, ry1: number, iterCenter: number): void => {
    const cReN = ((rx0 + rx1) / 2 - re0) / (re1 - re0); // 0..1
    const cImN = ((ry0 + ry1) / 2 - im0) / (im1 - im0);
    const cellW = ((rx1 - rx0) / (re1 - re0)) * FRACTAL_WORLD_SPAN;
    const px = opts.origin.x + (cReN - 0.5) * FRACTAL_WORLD_SPAN;
    const py = opts.origin.y + (cImN - 0.5) * FRACTAL_WORLD_SPAN;
    const inSet = iterCenter >= maxIter;
    const fill = !opts.colorful
      ? null
      : inSet
        ? "#111111"
        : hslToHex((iterCenter / maxIter) * 360, 80, 55);
    shapes.push(placePoint(template, layerId, px, py, cellW / baseW, order, fill));
    order = orderBetween(order, null);
  };

  // Top-down quadtree over the whole plane. A cell whose nine samples
  // (corners + edge midpoints + centre) all share the same escape-time
  // is "flat" — emit one big element covering it (the fill). A cell
  // that straddles a boundary subdivides until it's flat or hits
  // `maxDepth`. Large constant-escape-time bands (interior, exterior
  // iso-bands) become single large elements → far fewer shapes than a
  // uniform grid, with detail still concentrated on the boundary.
  const subdivide = (rx0: number, rx1: number, ry0: number, ry1: number, level: number): void => {
    if (shapes.length >= FRACTAL_MAX_SHAPES) return;
    const mx = (rx0 + rx1) / 2;
    const my = (ry0 + ry1) / 2;
    const cc = escape(mx, my);
    // Nine-point flatness probe.
    const samples = [
      escape(rx0, ry0),
      escape(rx1, ry0),
      escape(rx0, ry1),
      escape(rx1, ry1),
      escape(mx, ry0),
      escape(mx, ry1),
      escape(rx0, my),
      escape(rx1, my),
      cc,
    ];
    let flat = true;
    for (const s of samples) {
      if (s !== samples[0]) {
        flat = false;
        break;
      }
    }
    const forced = level < ESCAPE_MIN_DEPTH;
    if ((forced || !flat) && level < maxDepth) {
      subdivide(rx0, mx, ry0, my, level + 1);
      subdivide(mx, rx1, ry0, my, level + 1);
      subdivide(rx0, mx, my, ry1, level + 1);
      subdivide(mx, rx1, my, ry1, level + 1);
      return;
    }
    // Flat far-exterior fill — skip when requested. A boundary leaf
    // (reached maxDepth, not flat) is always emitted so the edge keeps
    // its detail; only large flat low-escape background cells are
    // dropped.
    if (opts.skipOutside && flat && cc <= outsideThreshold) return;
    emit(rx0, rx1, ry0, ry1, cc);
  };

  subdivide(re0, re1, im0, im1, 0);
  return { shapes };
};

// ── 2D strange attractors (de Jong / Clifford) ──────────────────────
const DEJONG_PARAMS = { a: 1.4, b: -2.3, c: 2.4, d: -2.1 };
const CLIFFORD_PARAMS = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 };
const ATTRACTOR_WARMUP = 20; // discard transient iterations

const buildAttractorFractal = (
  editor: Editor,
  template: Template,
  opts: FractalOptions,
): BuildResult => {
  const points = Math.min(opts.a * 1000, FRACTAL_MAX_SHAPES);
  const isClifford = opts.type === "clifford";
  const p = isClifford ? CLIFFORD_PARAMS : DEJONG_PARAMS;
  // Attractor coordinate range: de Jong ⊂ [-2, 2]; Clifford a bit wider.
  const span = isClifford ? 3 : 2;
  const shapes: Element[] = [];
  const layerId = activeLayerId(editor);
  // Base point size scales with the world span so points stay
  // visible across the 5%→3200% zoom range. `b` (Point scale %)
  // tunes it: at 100% a point ≈ 1.5% of the fractal extent.
  const probe = template.factory({
    id: nextDebugId(`${template.id}-probe`),
    layerId,
    position: { x: 0, y: 0 },
    order: orderBetween(null, null),
  });
  const baseW = safeBounds(probe).width || 80;
  const scale = ((opts.b / 100) * FRACTAL_WORLD_SPAN * 0.015) / baseW;
  let order: Element["order"] = orderBetween(lastOrder(editor), null);
  let x = 0.1;
  let y = 0.1;
  const total = points + ATTRACTOR_WARMUP;
  // Size by trajectory speed: the attractor lingers (small steps) in
  // its dense folds and races across sparse regions. Drawing slow
  // points larger and fast points smaller emphasises the structure —
  // the dense "spine" reads bold, the thin sweeps stay fine. `span`
  // bounds the coordinate range, so a step of ~`span` is "fast".
  const maxStep = span;
  for (let i = 0; i < total; i++) {
    const nx = isClifford
      ? Math.sin(p.a * y) + p.c * Math.cos(p.a * x)
      : Math.sin(p.a * y) - Math.cos(p.b * x);
    const ny = isClifford
      ? Math.sin(p.b * x) + p.d * Math.cos(p.b * y)
      : Math.sin(p.c * x) - Math.cos(p.d * y);
    const step = Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
    if (i < ATTRACTOR_WARMUP) continue; // skip transient
    const px = opts.origin.x + (x / span) * (FRACTAL_WORLD_SPAN / 2);
    const py = opts.origin.y + (y / span) * (FRACTAL_WORLD_SPAN / 2);
    // slow (step→0) → full scale; fast (step→maxStep) → 0.35×.
    const slowness = 1 - Math.min(step / maxStep, 1);
    const ptScale = scale * (0.35 + 0.65 * slowness);
    const fill = opts.colorful ? hslToHex(((i / total) * 300 + 200) % 360, 75, 60) : null;
    shapes.push(placePoint(template, layerId, px, py, ptScale, order, fill));
    order = orderBetween(order, null);
  }
  return { shapes };
};

const safeBounds = (shape: Element) => {
  try {
    return getElementWorldBounds(shape);
  } catch {
    return { x: 0, y: 0, width: 80, height: 60 };
  }
};

const withFill = (shape: Element, fill: string): Element =>
  ({ ...shape, style: { ...shape.style, fill } });

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
  let order: Element["order"] = orderBetween(null, null);
  const origin = viewportTopLeftWithMargin(editor);

  const total = cols * rows;
  const CHUNK = 500;
  let done = 0;

  while (done < total) {
    if (!onProgress(Math.round((done / total) * 100))) {
      return; // aborted
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => { resolve(); }));

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
      const shape: Element = {
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
        kind: "element",
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
    <input type="checkbox" checked={checked} onChange={(e) => { onChange(e.target.checked); }} />
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

const disabledButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.45,
  cursor: "not-allowed",
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
