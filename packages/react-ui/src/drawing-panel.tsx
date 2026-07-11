import { type CSSProperties, type ReactNode } from "react";
import { ColorSwatchPicker } from "./color-swatch-picker.js";
import { useBrushSettings, useDiagramOptional, useMode } from "./hooks.js";
import { BRUSH_WIDTH_MAX, BRUSH_WIDTH_MIN, DRAWING_PANEL_WIDTH } from "./constants.js";

/**
 * Drawing / eraser tool options — a floating panel that appears while the brush
 * or eraser tool is active. Edits {@link Editor.setBrushSettings}: line colour,
 * enclosed-fill colour, opacity and width for the brush; only the width (which
 * doubles as the eraser radius) for the eraser.
 *
 * Self-gating: renders `null` outside brush / eraser mode, so hosts can mount it
 * unconditionally. This is a functional scaffold — restyle / relabel as needed.
 */
export const DrawingPanel = ({ style }: { readonly style?: CSSProperties }) => {
  const editor = useDiagramOptional();
  const mode = useMode();
  const settings = useBrushSettings();
  if (!editor || (mode !== "brush" && mode !== "erase")) return null;
  const isEraser = mode === "erase";

  return (
    <div className="du-drawing-panel" style={{ ...PANEL_STYLE, ...style }}>
      <div style={TITLE_STYLE}>{isEraser ? "Eraser" : "Drawing"}</div>

      {!isEraser && (
        <>
          <Row label="Stroke">
            <ColorSwatchPicker
              value={settings.stroke}
              onChange={(c) => {
                editor.setBrushSettings({ stroke: c ?? settings.stroke });
              }}
              onEyedrop={(cb) => {
                editor.beginEyedropperPick(cb);
              }}
              allowClear={false}
            />
          </Row>
          <Row label="Fill">
            <ColorSwatchPicker
              value={settings.fill}
              onChange={(c) => {
                editor.setBrushSettings({ fill: c });
              }}
              onEyedrop={(cb) => {
                editor.beginEyedropperPick(cb);
              }}
            />
          </Row>
          <Row label={`Opacity ${Math.round(settings.opacity * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.opacity}
              onChange={(e) => {
                editor.setBrushSettings({ opacity: e.currentTarget.valueAsNumber });
              }}
              style={SLIDER_STYLE}
              aria-label="Brush opacity"
            />
          </Row>
        </>
      )}

      <Row label={`${isEraser ? "Radius" : "Width"} ${settings.width}`}>
        <input
          type="range"
          min={BRUSH_WIDTH_MIN}
          max={BRUSH_WIDTH_MAX}
          step={1}
          value={settings.width}
          onChange={(e) => {
            editor.setBrushSettings({ width: e.currentTarget.valueAsNumber });
          }}
          style={SLIDER_STYLE}
          aria-label={isEraser ? "Eraser radius" : "Brush width"}
        />
      </Row>
    </div>
  );
};

const Row = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <label style={ROW_STYLE}>
    <span style={LABEL_STYLE}>{label}</span>
    {children}
  </label>
);

const PANEL_STYLE: CSSProperties = {
  width: DRAWING_PANEL_WIDTH,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  border: "1px solid var(--du-border, #d0d0d0)",
  borderRadius: 8,
  background: "var(--du-surface, #fff)",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  font: "12px/1.4 system-ui, sans-serif",
  color: "var(--du-text, #222)",
};
const TITLE_STYLE: CSSProperties = { fontWeight: 600, opacity: 0.7 };
const ROW_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const LABEL_STYLE: CSSProperties = { opacity: 0.7 };
const SLIDER_STYLE: CSSProperties = { width: "100%" };
