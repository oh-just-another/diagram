import type { CSSProperties } from "react";
import type { ShapeBase } from "@oh-just-another/scene";
import { useScene, useSelection } from "./hooks.js";

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
  width: 240,
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
  return (
   <aside className={className} style={containerStyle}>
    <Header>Inspector</Header>
    <Field label="Selected">{size} shapes</Field>
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
  </aside>
 );
};

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
   width: 12,
   height: 12,
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
