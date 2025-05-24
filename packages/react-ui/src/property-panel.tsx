import type { CSSProperties } from "react";
import type {
 LineCap,
 LineJoin,
 Roundness,
 ShapeBase,
 StrokeAlign,
} from "@oh-just-another/scene";
import { useDiagramOptional, useScene, useSelection } from "./hooks.js";
import { PROPERTY_PANEL_WIDTH } from "./constants.js";
import { ColorSwatchPicker } from "./color-swatch-picker.js";

/**
 * Read-only inspector showing key properties of the currently selected
 * shape(s). ships this as a sensible default; richer editing UIs
 * live in host apps that compose the same hooks themselves.
 *
 * Multi-selection collapses to a count, single-selection shows id, type,
 * world position, and a `style.fill` swatch when present.
 */
export interface PropertyPanelProps {
 readonly style?: CSSProperties;
 readonly className?: string;
}

export const PropertyPanel = ({ style, className }: PropertyPanelProps) => {
 const selection = useSelection();
 const scene = useScene();

 const containerStyle: CSSProperties = {
  width: PROPERTY_PANEL_WIDTH,
  background: "#161616",
  color: "#ddd",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 12,
  borderLeft: "1px solid #2a2a2a",
  minHeight: 0,
  overflowY: "auto",
  ...style,
 };

 const size = selection.size;

 if (size === 0) {
  return (
   <aside className={className} style={containerStyle}>
    <Header>Inspector</Header>
    <Empty>No selection</Empty>
   </aside>
  );
 }

 if (size > 1) {
  // Multi-selection — show count + the shared values across the group
  // when every member agrees. Disagreement collapses to "—".
  const shapes = [...selection]
   .map((id) => scene.shapes.get(id))
   .filter((s): s is ShapeBase => s !== undefined);
  const types = new Set(shapes.map((s) => s.type));
  return (
   <aside className={className} style={containerStyle}>
    <Header>Inspector</Header>
    <Field label="Selected">{size} shapes</Field>
    <Field label="Types">{types.size === 1 ? [...types][0] : `${types.size} kinds`}</Field>
    <FillControl shapes={shapes} />
    <StrokeColorControl shapes={shapes} />
    <StrokeControls shapes={shapes} />
    <RoundnessControls shapes={shapes} />
   </aside>
  );
 }

 const id = [...selection][0]!;
 const shape = scene.shapes.get(id);
 if (!shape) {
  return (
   <aside className={className} style={containerStyle}>
    <Header>Inspector</Header>
    <Empty>Selected shape missing</Empty>
   </aside>
  );
 }

 return (
  <aside className={className} style={containerStyle}>
   <Header>Inspector</Header>
   <Field label="ID">
    <code>{shape.id}</code>
   </Field>
   <Field label="Type">{shape.type}</Field>
   <Field label="Position">
    ({shape.position.x.toFixed(1)}, {shape.position.y.toFixed(1)})
   </Field>
   <FillControl shapes={[shape]} />
   <StrokeColorControl shapes={[shape]} />
   {"width" in shape && "height" in shape ? (
    <Field label="Size">
     {Number(shape.width).toFixed(0)} × {Number(shape.height).toFixed(0)}
    </Field>
   ) : null}
   <StrokeControls shapes={[shape]} />
   <RoundnessControls shapes={[shape]} />
  </aside>
 );
};

/**
 * Fill colour control. Writes through `editor.updateStyle` so it
 * routes through the normal history pipeline. Multi-selection
 * collapses to the shared value or shows `—` (mixed). The "×"
 * button clears the fill (`fill: "transparent"`) — separate from
 * picking a colour because `<input type=color>` has no concept of
 * "no value".
 */
const FillControl = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
 const editor = useDiagramOptional();
 if (!editor || shapes.length === 0) return null;
 // Only show the control when at least one selected shape supports
 // a fill style — text glyphs / images don't.
 if (!shapes.some(hasFill)) return null;
 const shared = sharedValue<string | null>(shapes, (s) => {
  const fill = s.style?.fill;
  return typeof fill === "string" ? fill : null;
 });
 const ids = shapes.map((s) => s.id);
 return (
  <Field label="Fill">
   <ColorSwatchPicker
    value={shared}
    onChange={(v) => editor.updateStyle(ids, { fill: v ?? "transparent" })}
   />
  </Field>
 );
};

const StrokeColorControl = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
 const editor = useDiagramOptional();
 if (!editor || shapes.length === 0) return null;
 if (!shapes.some(hasStroke)) return null;
 const shared = sharedValue<string | null>(shapes, (s) => {
  const stroke = s.style?.stroke;
  return typeof stroke === "string" ? stroke : null;
 });
 const ids = shapes.map((s) => s.id);
 return (
  <Field label="Stroke">
   <ColorSwatchPicker
    value={shared}
    onChange={(v) => editor.updateStyle(ids, { stroke: v ?? "transparent" })}
   />
  </Field>
 );
};

/**
 * Stroke-join / stroke-cap selectors. Multi-selection collapses to
 * `—` (mixed value) and writes the picked option to every shape.
 * Joins / caps already work in both Canvas2D and WebGL2 backends;
 * these controls just expose them to the user.
 */
const StrokeControls = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
 const editor = useDiagramOptional();
 if (!editor || shapes.length === 0) return null;
 const sharedJoin = sharedValue(shapes, (s) => s.style?.lineJoin);
 const sharedCap = sharedValue(shapes, (s) => s.style?.lineCap);
 const sharedAlign = sharedValue(shapes, (s) => s.style?.strokeAlign);
 const ids = shapes.map((s) => s.id);
 return (
  <>
   <Field label="Join">
    <Select<LineJoin | "—">
     value={sharedJoin ?? "—"}
     options={["miter", "round", "bevel"]}
     onChange={(v) => editor.updateStyle(ids, { lineJoin: v as LineJoin })}
    />
   </Field>
   <Field label="Cap">
    <Select<LineCap | "—">
     value={sharedCap ?? "—"}
     options={["butt", "round", "square"]}
     onChange={(v) => editor.updateStyle(ids, { lineCap: v as LineCap })}
    />
   </Field>
   <Field label="Align">
    <Select<StrokeAlign | "—">
     value={sharedAlign ?? "center"}
     options={["center", "inside", "outside"]}
     onChange={(v) => editor.updateStyle(ids, { strokeAlign: v as StrokeAlign })}
    />
   </Field>
  </>
 );
};

/**
 * Corner-roundness toggle + optional explicit radius input. standard-
 * style adaptive default (omitting `value` lets the renderer pick a
 * size-appropriate radius automatically).
 */
const RoundnessControls = ({ shapes }: { readonly shapes: readonly ShapeBase[] }) => {
 const editor = useDiagramOptional();
 if (!editor || shapes.length === 0) return null;
 // Only rectangle-shaped primitives consume `roundness` today —
 // hide the row for shapes whose renderer ignores it (ellipse,
 // text, image, …).
 const supports = shapes.every((s) => s.type === "rectangle" || s.type === "container");
 if (!supports) return null;
 const sharedType = sharedValue(shapes, (s) => s.style?.roundness?.type);
 const sharedValueNum = sharedValue(shapes, (s) => s.style?.roundness?.value);
 const ids = shapes.map((s) => s.id);
 return (
  <>
   <Field label="Corners">
    <Select<Roundness["type"] | "—">
     value={sharedType ?? "sharp"}
     options={["sharp", "round"]}
     onChange={(v) => {
      const next: Roundness = { type: v as Roundness["type"] };
      editor.updateStyle(ids, { roundness: next });
     }}
    />
   </Field>
   {sharedType === "round" ? (
    <Field label="Radius">
     <NumberInput
      value={sharedValueNum}
      placeholder="auto"
      onChange={(v) =>
       editor.updateStyle(ids, {
        roundness: v !== null ? { type: "round", value: v } : { type: "round" },
       })
      }
     />
    </Field>
   ) : null}
  </>
 );
};

const sharedValue = <T,>(shapes: readonly ShapeBase[], pick: (s: ShapeBase) => T | undefined): T | null => {
 const set = new Set<T | undefined>();
 for (const s of shapes) set.add(pick(s));
 if (set.size !== 1) return null;
 const v = set.values().next().value;
 return v ?? null;
};

const Select = <T extends string>({
 value,
 options,
 onChange,
}: {
 readonly value: T;
 readonly options: readonly T[];
 readonly onChange: (v: T) => void;
}) => (
 <select
  value={value}
  onChange={(ev) => onChange(ev.target.value as T)}
  style={{
   background: "#222",
   color: "#ddd",
   border: "1px solid #444",
   borderRadius: 3,
   padding: "2px 4px",
   fontSize: 11,
  }}
 >
  {value === "—" ? <option value="—">—</option> : null}
  {options.map((o) => (
   <option key={o} value={o}>
    {o}
   </option>
  ))}
 </select>
);

const NumberInput = ({
 value,
 placeholder,
 onChange,
}: {
 readonly value: number | null | undefined;
 readonly placeholder?: string;
 readonly onChange: (v: number | null) => void;
}) => (
 <input
  type="number"
  value={value ?? ""}
  placeholder={placeholder ?? ""}
  onChange={(ev) => {
   const raw = ev.target.value.trim();
   onChange(raw === "" ? null : Number(raw));
  }}
  min={0}
  style={{
   width: 64,
   background: "#222",
   color: "#ddd",
   border: "1px solid #444",
   borderRadius: 3,
   padding: "2px 4px",
   fontSize: 11,
  }}
 />
);

const Header = ({ children }: { readonly children: React.ReactNode }) => (
 <h2
  style={{
   margin: 0,
   fontSize: 11,
   textTransform: "uppercase",
   letterSpacing: 0.5,
   color: "#777",
  }}
 >
  {children}
 </h2>
);

const Field = ({
 label,
 children,
}: {
 readonly label: string;
 readonly children: React.ReactNode;
}) => (
 <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
  <span style={{ color: "#666", minWidth: 60 }}>{label}</span>
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</span>
 </div>
);

const Empty = ({ children }: { readonly children: React.ReactNode }) => (
 <div style={{ color: "#666", fontStyle: "italic" }}>{children}</div>
);

const hasFill = (shape: ShapeBase): shape is ShapeBase & { style: { fill: unknown } } =>
 shape.style?.fill !== undefined;

const hasStroke = (shape: ShapeBase): shape is ShapeBase & { style: { stroke: unknown } } =>
 shape.style?.stroke !== undefined;
