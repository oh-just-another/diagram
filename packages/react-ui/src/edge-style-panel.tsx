import type { CSSProperties } from "react";
import type { ArrowheadStyle, Link, LinkRouting } from "@oh-just-another/scene";
import { useDiagramOptional, useScene, useSelectedLink } from "./hooks.js";

/**
 * Mini-panel that surfaces the most-edited properties of the
 * currently-selected edge: routing strategy, arrowheads, stroke
 * style (color / width / dash), and label text. Renders nothing
 * when no edge is selected — host can put it inside a sidebar slot
 * unconditionally.
 *
 * Field semantics map 1:1 to the scene `Link` shape (routing,
 * arrowheads.{from,to}, style.{stroke,strokeWidth,dashArray},
 * label.text). Edits go through `Editor.updateSelectedLink`, which
 * commits one history step per change.
 */

export interface LinkStylePanelProps {
  readonly className?: string;
  readonly style?: CSSProperties;
}

const ARROW_OPTIONS: { readonly value: ArrowheadStyle; readonly label: string }[] = [
  { value: "none", label: "None" },
  { value: "arrow", label: "Arrow" },
  { value: "triangle", label: "Triangle" },
  { value: "diamond", label: "Diamond" },
  { value: "circle", label: "Circle" },
];

const ROUTING_OPTIONS: { readonly value: LinkRouting; readonly label: string }[] = [
  { value: "straight", label: "Straight" },
  { value: "orthogonal", label: "Elbow" },
  { value: "bezier", label: "Curved" },
];

const DASH_OPTIONS: {
  readonly value: string;
  readonly label: string;
  readonly array: readonly number[] | null;
}[] = [
  { value: "solid", label: "Solid", array: null },
  { value: "dashed", label: "Dashed", array: [6, 4] },
  { value: "dotted", label: "Dotted", array: [2, 4] },
];

const dashKey = (arr: readonly number[] | undefined): string => {
  if (!arr || arr.length === 0) return "solid";
  if (arr.length === 2 && arr[0] === 6 && arr[1] === 4) return "dashed";
  if (arr.length === 2 && arr[0] === 2 && arr[1] === 4) return "dotted";
  return "custom";
};

export const LinkStylePanel = ({ className, style }: LinkStylePanelProps) => {
  const editor = useDiagramOptional();
  const scene = useScene();
  const selectedLinkId = useSelectedLink();
  const edge = selectedLinkId !== null ? scene.links.get(selectedLinkId) : undefined;
  if (!editor || !edge) return null;

  const containerStyle: CSSProperties = {
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "var(--panel, #161616)",
    color: "var(--text, #ddd)",
    fontSize: 12,
    minWidth: 220,
    ...style,
  };

  const setArrowhead = (side: "from" | "to", value: ArrowheadStyle): void => {
    editor.updateSelectedLink((e) => ({
      ...e,
      arrowheads: { ...(e.arrowheads ?? {}), [side]: value === "none" ? undefined : value },
    }));
  };

  const setRouting = (routing: LinkRouting): void => {
    editor.updateSelectedLink((e) => ({ ...e, routing }));
  };

  const setStroke = (stroke: string): void => {
    editor.updateSelectedLink((e) => ({ ...e, style: { ...e.style, stroke } }));
  };

  const setStrokeWidth = (w: number): void => {
    editor.updateSelectedLink((e) => ({ ...e, style: { ...e.style, strokeWidth: w } }));
  };

  const setDash = (kind: string): void => {
    const opt = DASH_OPTIONS.find((o) => o.value === kind);
    editor.updateSelectedLink((e) => {
      if (!opt?.array) {
        // "Solid" — strip the field entirely so the renderer treats
        // the stroke as continuous instead of falling through with
        // an empty-array dash pattern.
        const { dashArray: _d, ...restStyle } = e.style as typeof e.style & {
          dashArray?: readonly number[];
        };
        void _d;
        return { ...e, style: restStyle };
      }
      return { ...e, style: { ...e.style, dashArray: opt.array } };
    });
  };

  const setLabel = (text: string): void => {
    editor.updateSelectedLink((e) => {
      if (text === "") {
        // Empty string removes the label entirely.
        const { label: _l, ...rest } = e as Link & { label?: unknown };
        void _l;
        return rest;
      }
      return { ...e, label: { ...(e.label ?? {}), text } };
    });
  };

  return (
    <aside className={className} style={containerStyle}>
      <h2
        style={{
          margin: 0,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--muted, #888)",
        }}
      >
        Link
      </h2>

      <Row label="Kind">
        <select
          value={edge.lineKind ?? "line"}
          onChange={(ev) => {
            editor.updateSelectedLink((e) => ({
              ...e,
              lineKind: ev.target.value === "block-arrow" ? "block-arrow" : "line",
            }));
          }}
          style={selectStyle}
        >
          <option value="line">Line</option>
          <option value="block-arrow">Block arrow</option>
        </select>
      </Row>

      <Row label="Routing">
        <select
          value={edge.routing ?? "straight"}
          onChange={(ev) => {
            setRouting(ev.target.value as LinkRouting);
          }}
          style={selectStyle}
        >
          {ROUTING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Start">
        <select
          value={edge.arrowheads?.from ?? "none"}
          onChange={(ev) => {
            setArrowhead("from", ev.target.value as ArrowheadStyle);
          }}
          style={selectStyle}
        >
          {ARROW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label="End">
        <select
          value={edge.arrowheads?.to ?? "none"}
          onChange={(ev) => {
            setArrowhead("to", ev.target.value as ArrowheadStyle);
          }}
          style={selectStyle}
        >
          {ARROW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Color">
        <input
          type="color"
          value={normaliseColor(edge.style.stroke)}
          onChange={(ev) => {
            setStroke(ev.target.value);
          }}
          style={{ width: 36, height: 24, border: "none", background: "none", padding: 0 }}
        />
      </Row>

      <Row label="Width">
        <input
          type="number"
          min={0.5}
          max={20}
          step={0.5}
          value={edge.style.strokeWidth ?? 1.5}
          onChange={(ev) => {
            setStrokeWidth(Number(ev.target.value) || 1);
          }}
          style={{ ...selectStyle, width: 72 }}
        />
      </Row>

      <Row label="Dash">
        <select
          value={dashKey(edge.style.dashArray)}
          onChange={(ev) => {
            setDash(ev.target.value);
          }}
          style={selectStyle}
        >
          {DASH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label="Label">
        <input
          type="text"
          placeholder="(no label)"
          value={edge.label?.text ?? ""}
          onChange={(ev) => {
            setLabel(ev.target.value);
          }}
          style={{ ...selectStyle, flex: 1 }}
        />
      </Row>
    </aside>
  );
};

const selectStyle: CSSProperties = {
  background: "var(--button-bg, #1f1f1f)",
  color: "var(--text, #ddd)",
  border: "1px solid var(--border, #2a2a2a)",
  borderRadius: 4,
  padding: "4px 8px",
  font: "inherit",
  fontSize: 12,
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
    <span style={{ color: "var(--muted, #888)" }}>{label}</span>
    {children}
  </label>
);

// Accept either #rrggbb (browser color picker) or any other CSS value.
// The color picker can't display non-hex values, so we coerce to a
// neutral grey if the current stroke is `null` or non-hex.
const normaliseColor = (s: string | null | undefined): string => {
  if (typeof s !== "string") return "#444444";
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  return "#444444";
};
