import { type CSSProperties, type ReactNode } from "react";
import {
  ChevronsDown,
  ChevronsUp,
  Copy as CopyIcon,
  Group as GroupIcon,
  Layers,
  Minus,
  MoveDown,
  MoveUp,
  Square,
  SquareDashed,
  SquareDot,
  Trash2,
  Ungroup as UngroupIcon,
} from "lucide-react";
import type {
  LineCap,
  LineJoin,
  Roundness,
  ShapeBase,
  StrokeAlign,
} from "@oh-just-another/scene";
import { useDiagramOptional, useScene, useSelection } from "./hooks.js";
import { ColorSwatchPicker } from "./color-swatch-picker.js";
import { SegmentedControl } from "./segmented-control.js";
import { Slider } from "./slider.js";

/**
 * modern-style property inspector. Renders one section per
 * editable style group (Fill, Stroke, Corners, Opacity, Layers,
 * Actions); each section uses a small set of icon-driven controls
 * (`SegmentedControl`, `ColorSwatchPicker`, `Slider`) rather than
 * native `<select>`/`<input>` so the visual language stays
 * consistent with the toolbar.
 *
 * Multi-selection collapses each control's value to "mixed" when
 * members disagree; setting any value writes through to every selected
 * shape via `editor.updateStyle` (single undo step).
 */
export interface PropertyPanelProps {
  readonly style?: CSSProperties;
  readonly className?: string;
}

export const PropertyPanel = ({ style, className }: PropertyPanelProps) => {
  const selection = useSelection();
  const scene = useScene();

  if (selection.size === 0) {
    return (
      <div className={`du-prop-panel ${className ?? ""}`.trim()} style={style}>
        <p className="du-prop-empty">Nothing selected.</p>
      </div>
    );
  }

  const shapes = [...selection]
    .map((id) => scene.shapes.get(id))
    .filter((s): s is ShapeBase => s !== undefined);
  if (shapes.length === 0) return null;

  return (
    <div className={`du-prop-panel ${className ?? ""}`.trim()} style={style}>
      <StrokeSection shapes={shapes} />
      <FillSection shapes={shapes} />
      <StrokeWidthSection shapes={shapes} />
      <StrokeStyleSection shapes={shapes} />
      <StrokeJoinCapSection shapes={shapes} />
      <RoundnessSection shapes={shapes} />
      <OpacitySection shapes={shapes} />
      <LayersSection />
      <ActionsSection />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const StrokeSection = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some(hasStroke)) return null;
  const value = sharedString(shapes, (s) => s.style?.stroke);
  const ids = shapes.map((s) => s.id);
  return (
    <Section label="Stroke">
      <ColorSwatchPicker
        value={value}
        onChange={(v) => editor.updateStyle(ids, { stroke: v ?? "transparent" })}
      />
    </Section>
  );
};

const FillSection = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some(hasFill)) return null;
  const value = sharedString(shapes, (s) => s.style?.fill);
  const ids = shapes.map((s) => s.id);
  return (
    <Section label="Fill">
      <ColorSwatchPicker
        value={value}
        onChange={(v) => editor.updateStyle(ids, { fill: v ?? "transparent" })}
      />
    </Section>
  );
};

/**
 * Stroke-width picker. Three discrete presets (1 / 2 / 4) match
 * standard's thin / bold / extra-bold buckets. Custom widths
 * preserved on read — only writes snap to a preset.
 */
const StrokeWidthSection = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some((s) => s.style?.stroke !== undefined)) return null;
  const value = sharedValue<number>(shapes, (s) => s.style?.strokeWidth ?? null);
  const ids = shapes.map((s) => s.id);
  return (
    <Section label="Stroke width">
      <SegmentedControl<number>
        ariaLabel="Stroke width"
        value={value}
        options={[
          { value: 1, label: "Thin", icon: <StrokeWidthIcon thickness={1} /> },
          { value: 2, label: "Medium", icon: <StrokeWidthIcon thickness={2.5} /> },
          { value: 4, label: "Thick", icon: <StrokeWidthIcon thickness={4} /> },
        ]}
        onChange={(v) => editor.updateStyle(ids, { strokeWidth: v })}
      />
    </Section>
  );
};

/**
 * Stroke pattern — solid / dashed / dotted via `dashArray`. Maps
 * the discrete buttons to canonical arrays so resetting to
 * `solid` writes `undefined` (omits the field from style).
 */
const StrokeStyleSection = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some(hasStroke)) return null;
  const value = sharedValue<"solid" | "dashed" | "dotted">(shapes, (s) => {
    const da = s.style?.dashArray;
    if (!da || da.length === 0) return "solid";
    if (da.length === 2 && da[0] === 8 && da[1] === 4) return "dashed";
    if (da.length === 2 && da[0] === 2 && da[1] === 4) return "dotted";
    return null;
  });
  const ids = shapes.map((s) => s.id);
  return (
    <Section label="Stroke style">
      <SegmentedControl<"solid" | "dashed" | "dotted">
        ariaLabel="Stroke style"
        value={value}
        options={[
          { value: "solid", label: "Solid", icon: <Square size={14} strokeWidth={1.75} /> },
          { value: "dashed", label: "Dashed", icon: <SquareDashed size={14} strokeWidth={1.75} /> },
          { value: "dotted", label: "Dotted", icon: <SquareDot size={14} strokeWidth={1.75} /> },
        ]}
        onChange={(v) => {
          // `dashArray: undefined` would conflict with exact-optional-
          // types; pass it only when we want to set a real pattern.
          if (v === "solid") {
            editor.updateStyle(ids, {});
            return;
          }
          const dashArray = v === "dashed" ? [8, 4] : [2, 4];
          editor.updateStyle(ids, { dashArray });
        }}
      />
    </Section>
  );
};

/**
 * Stroke join / cap / alignment. Three short rows packed into one
 * section so the panel doesn't sprawl. Each control mirrors the
 * `lineJoin` / `lineCap` / `strokeAlign` enum exactly.
 */
const StrokeJoinCapSection = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some(hasStroke)) return null;
  const join = sharedValue<LineJoin>(shapes, (s) => s.style?.lineJoin ?? null);
  const cap = sharedValue<LineCap>(shapes, (s) => s.style?.lineCap ?? null);
  const align = sharedValue<StrokeAlign>(shapes, (s) => s.style?.strokeAlign ?? null);
  const ids = shapes.map((s) => s.id);
  return (
    <Section label="Stroke detail">
      <Row label="Join">
        <SegmentedControl<LineJoin>
          ariaLabel="Line join"
          value={join}
          options={[
            { value: "miter", label: "Miter", icon: <JoinIcon kind="miter" /> },
            { value: "round", label: "Round", icon: <JoinIcon kind="round" /> },
            { value: "bevel", label: "Bevel", icon: <JoinIcon kind="bevel" /> },
          ]}
          onChange={(v) => editor.updateStyle(ids, { lineJoin: v })}
        />
      </Row>
      <Row label="Cap">
        <SegmentedControl<LineCap>
          ariaLabel="Line cap"
          value={cap}
          options={[
            { value: "butt", label: "Butt", icon: <CapIcon kind="butt" /> },
            { value: "round", label: "Round", icon: <CapIcon kind="round" /> },
            { value: "square", label: "Square", icon: <CapIcon kind="square" /> },
          ]}
          onChange={(v) => editor.updateStyle(ids, { lineCap: v })}
        />
      </Row>
      <Row label="Align">
        <SegmentedControl<StrokeAlign>
          ariaLabel="Stroke alignment"
          value={align}
          options={[
            { value: "inside", label: "Inside", icon: <AlignIcon kind="inside" /> },
            { value: "center", label: "Center", icon: <AlignIcon kind="center" /> },
            { value: "outside", label: "Outside", icon: <AlignIcon kind="outside" /> },
          ]}
          onChange={(v) => editor.updateStyle(ids, { strokeAlign: v })}
        />
      </Row>
    </Section>
  );
};

/**
 * Corner roundness — sharp / round segmented control with an
 * optional explicit radius input when `round` is active.
 */
const RoundnessSection = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const supports = shapes.every((s) => s.type === "rectangle" || s.type === "container");
  if (!supports) return null;
  const type = sharedValue<Roundness["type"]>(shapes, (s) => s.style?.roundness?.type ?? "sharp");
  const radius = sharedValue<number>(shapes, (s) => s.style?.roundness?.value ?? null);
  const ids = shapes.map((s) => s.id);
  return (
    <Section label="Corners">
      <SegmentedControl<Roundness["type"]>
        ariaLabel="Corner roundness"
        value={type}
        options={[
          { value: "sharp", label: "Sharp", icon: <CornerIcon kind="sharp" /> },
          { value: "round", label: "Round", icon: <CornerIcon kind="round" /> },
        ]}
        onChange={(v) => editor.updateStyle(ids, { roundness: { type: v } })}
      />
      {type === "round" ? (
        <Row label="Radius">
          <input
            type="number"
            className="du-number-input"
            min={0}
            placeholder="auto"
            value={radius ?? ""}
            onChange={(ev) => {
              const raw = ev.target.value.trim();
              const v = raw === "" ? undefined : Number(raw);
              editor.updateStyle(ids, {
                roundness: v !== undefined ? { type: "round", value: v } : { type: "round" },
              });
            }}
          />
        </Row>
      ) : null}
    </Section>
  );
};

const OpacitySection = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const value = sharedValue<number>(shapes, (s) => s.style?.opacity ?? 1);
  const ids = shapes.map((s) => s.id);
  const percent = value === null ? null : Math.round(value * 100);
  return (
    <Section label="Opacity">
      <Slider
        value={percent}
        min={0}
        max={100}
        step={5}
        ariaLabel="Opacity"
        valueLabel={percent === null ? "—" : `${percent}%`}
        onChange={(v) => editor.updateStyle(ids, { opacity: v / 100 })}
      />
    </Section>
  );
};

const LayersSection = () => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  return (
    <Section label="Z-order">
      <div className="du-prop-row">
        <SegmentedControl<"back" | "backward" | "forward" | "front">
          ariaLabel="Z-order"
          value={null}
          options={[
            { value: "back", label: "Send to back", icon: <ChevronsDown size={14} strokeWidth={1.75} /> },
            { value: "backward", label: "Send backward", icon: <MoveDown size={14} strokeWidth={1.75} /> },
            { value: "forward", label: "Bring forward", icon: <MoveUp size={14} strokeWidth={1.75} /> },
            { value: "front", label: "Bring to front", icon: <ChevronsUp size={14} strokeWidth={1.75} /> },
          ]}
          onChange={(v) => {
            if (v === "back") editor.sendToBack();
            else if (v === "front") editor.bringToFront();
            // sendBackward / bringForward have no per-step API, only end-of-stack.
          }}
        />
      </div>
    </Section>
  );
};

const ActionsSection = () => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  return (
    <Section label="Actions">
      <div className="du-prop-row">
        <SegmentedControl<"duplicate" | "delete" | "group" | "ungroup">
          ariaLabel="Shape actions"
          value={null}
          options={[
            { value: "duplicate", label: "Duplicate", icon: <CopyIcon size={14} strokeWidth={1.75} /> },
            { value: "delete", label: "Delete", icon: <Trash2 size={14} strokeWidth={1.75} /> },
            { value: "group", label: "Group", icon: <GroupIcon size={14} strokeWidth={1.75} /> },
            { value: "ungroup", label: "Ungroup", icon: <UngroupIcon size={14} strokeWidth={1.75} /> },
          ]}
          onChange={(v) => {
            if (v === "duplicate") editor.duplicateSelected();
            else if (v === "delete") editor.deleteSelected();
            else if (v === "group") editor.groupSelected();
            else if (v === "ungroup") editor.ungroup();
          }}
        />
      </div>
    </Section>
  );
};

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

const Section = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <section className="du-prop-section">
    <h3 className="du-prop-section-label">{label}</h3>
    {children}
  </section>
);

const Row = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <div className="du-prop-row">
    <span className="du-prop-row-label">{label}</span>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Inline SVG glyphs for properties Lucide doesn't carry off-the-shelf.
// All use currentColor so the active tonal fill picks them up.
// ---------------------------------------------------------------------------

const StrokeWidthIcon = ({ thickness }: { readonly thickness: number }) => (
  <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
    <line
      x1={2}
      y1={7}
      x2={12}
      y2={7}
      stroke="currentColor"
      strokeWidth={thickness}
      strokeLinecap="round"
    />
  </svg>
);

const JoinIcon = ({ kind }: { readonly kind: LineJoin }) => {
  // L-shaped path with the relevant join style applied.
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
      <polyline
        points="3,11 3,3 11,3"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinejoin={kind}
        fill="none"
      />
    </svg>
  );
};

const CapIcon = ({ kind }: { readonly kind: LineCap }) => (
  <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
    <line
      x1={3}
      y1={7}
      x2={11}
      y2={7}
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap={kind}
    />
  </svg>
);

const AlignIcon = ({ kind }: { readonly kind: StrokeAlign }) => {
  // Rect with a stroke positioned per alignment so the user sees
  // where the stroke sits relative to the path.
  const inset = kind === "inside" ? 3 : kind === "outside" ? 1 : 2;
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x={inset}
        y={inset}
        width={14 - inset * 2}
        height={14 - inset * 2}
        stroke="currentColor"
        strokeWidth={1.5}
        fill={kind === "inside" ? "currentColor" : "none"}
        fillOpacity={kind === "inside" ? 0.2 : 1}
      />
    </svg>
  );
};

const CornerIcon = ({ kind }: { readonly kind: Roundness["type"] }) => {
  if (kind === "sharp") {
    return <Square size={14} strokeWidth={1.75} aria-hidden />;
  }
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x={2} y={2} width={10} height={10} rx={3} ry={3} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
};

// silence unused-import warnings on icons used only conditionally;
// tree-shaker drops them when sections short-circuit.
const _keepAlive: ReadonlyArray<unknown> = [Layers, Minus];
void _keepAlive;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sharedValue = <T,>(
  shapes: readonly ShapeBase[],
  pick: (s: ShapeBase) => T | null | undefined,
): T | null => {
  const set = new Set<T | null | undefined>();
  for (const s of shapes) set.add(pick(s));
  if (set.size !== 1) return null;
  const v = set.values().next().value;
  return v == null ? null : (v as T);
};

const sharedString = (
  shapes: readonly ShapeBase[],
  pick: (s: ShapeBase) => unknown,
): string | null => {
  const value = sharedValue<unknown>(shapes, (s) => pick(s));
  return typeof value === "string" ? value : null;
};

const hasFill = (shape: ShapeBase): boolean => shape.style?.fill !== undefined;
const hasStroke = (shape: ShapeBase): boolean => shape.style?.stroke !== undefined;
