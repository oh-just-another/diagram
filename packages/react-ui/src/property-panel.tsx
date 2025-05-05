import type { CSSProperties } from "react";
import type {
 LineCap,
 LineJoin,
 Roundness,
 ShapeBase,
} from "@oh-just-another/scene";
import { useDiagramOptional, useScene, useSelection } from "./hooks.js";
import { PROPERTY_PANEL_WIDTH, PROPERTY_SWATCH_SIZE } from "./constants.js";

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
  const fills = new Set(shapes.map((s) => (hasFill(s) ? String(s.style.fill) : "")));
  const strokes = new Set(shapes.map((s) => (hasStroke(s) ? String(s.style.stroke) : "")));
  const sharedFill = fills.size === 1 && [...fills][0] !== "" ? [...fills][0] : null;
  const sharedStroke = strokes.size === 1 && [...strokes][0] !== "" ? [...strokes][0] : null;
  return (
   <aside className={className} style={containerStyle}>
    <Header>Inspector</Header>
    <Field label="Selected">{size} shapes</Field>
    <Field label="Types">{types.size === 1 ? [...types][0] : `${types.size} kinds`}</Field>
    {sharedFill ? (
     <Field label="Fill">
      <Swatch color={sharedFill} />
      <code>{sharedFill}</code>
     </Field>
    ) : fills.size > 1 ? (
     <Field label="Fill">
      <span style={{ color: "#666" }}>—</span>
     </Field>
    ) : null}
    {sharedStroke ? (
     <Field label="Stroke">
      <Swatch color={sharedStroke} />
      <code>{sharedStroke}</code>
     </Field>
    ) : strokes.size > 1 ? (
     <Field label="Stroke">
      <span style={{ color: "#666" }}>—</span>
     </Field>
    ) : null}
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
   {hasFill(shape) ? (
    <Field label="Fill">
     <Swatch color={String(shape.style.fill)} />
     <code>{String(shape.style.fill)}</code>
    </Field>
   ) : null}
   {hasStroke(shape) ? (
    <Field label="Stroke">
     <Swatch color={String(shape.style.stroke)} />
     <code>{String(shape.style.stroke)}</code>
    </Field>
   ) : null}
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
 return v === undefined ? null : v;
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

const Swatch = ({ color }: { readonly color: string }) => (
 <span
  aria-hidden
  style={{
   width: PROPERTY_SWATCH_SIZE,
   height: PROPERTY_SWATCH_SIZE,
   background: color,
   border: "1px solid #444",
   borderRadius: 2,
   display: "inline-block",
  }}
 />
);

const hasFill = (shape: ShapeBase): shape is ShapeBase & { style: { fill: unknown } } =>
 shape.style?.fill !== undefined;

const hasStroke = (shape: ShapeBase): shape is ShapeBase & { style: { stroke: unknown } } =>
 shape.style?.stroke !== undefined;
