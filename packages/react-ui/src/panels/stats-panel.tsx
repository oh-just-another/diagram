import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { defaultActionRegistry } from "@oh-just-another/state";
import { useDiagramOptional } from "../core/hooks.js";
import { FLOATING_OVERLAY_TOP_PX } from "../core/constants.js";

/**
 * Read-only stats / dimensions overlay (`⌥/`). A small corner card showing
 * the current selection's bounds (x / y / w / h and, for a single element,
 * its rotation) plus scene totals (elements, edges, selected). Aggregates a
 * multi-selection into one bounding box + count.
 *
 * Self-contained: manages its own visibility and registers the
 * `toggle-stats` action so `⌥/` routes through the shared registry and
 * shows in the help dialog. `viewMode` keeps it available in read-only.
 * Purely observational — never mutates the scene.
 */
export const StatsPanel = (): ReactElement | null => {
  const editor = useDiagramOptional();
  const [visible, setVisible] = useState(false);
  // Re-render on any editor change (selection / link-selection / scene /
  // viewport) so the read-out stays live regardless of which notify fired.
  const [, force] = useState(0);

  useEffect(() => {
    defaultActionRegistry.replace({
      id: "toggle-stats",
      label: "Stats panel",
      category: "other",
      viewMode: true,
      hotkey: { key: "/", alt: true },
      perform: () => {
        setVisible((v) => !v);
      },
    });
    return () => {
      defaultActionRegistry.unregister("toggle-stats");
    };
  }, []);

  useEffect(() => {
    if (!editor || !visible) return undefined;
    return editor.subscribe(() => {
      force((n) => n + 1);
    });
  }, [editor, visible]);

  if (!visible || !editor) return null;

  const bounds = editor.combinedSelectionBounds();
  const selectedElements = editor.selection.size;
  const selectedLinks = editor.selectedLinks.size;
  const selectedTotal = selectedElements + selectedLinks;
  const scene = editor.scene;

  // Rotation is only meaningful for a single element (a multi-selection's
  // AABB has no single angle).
  let angleDeg: number | null = null;
  if (selectedElements === 1 && selectedLinks === 0) {
    const soleId = [...editor.selection][0];
    const element = soleId ? scene.elements.get(soleId) : undefined;
    if (element) angleDeg = (element.rotation * 180) / Math.PI;
  }

  return (
    <div style={PANEL_STYLE} role="status" aria-label="Selection stats" aria-live="polite">
      <div style={SECTION_TITLE_STYLE}>Selection</div>
      {bounds ? (
        <>
          <Row label="X" value={round(bounds.x)} />
          <Row label="Y" value={round(bounds.y)} />
          <Row label="W" value={round(bounds.width)} />
          <Row label="H" value={round(bounds.height)} />
          {angleDeg !== null ? <Row label="∠" value={`${String(round(angleDeg))}°`} /> : null}
          {selectedTotal > 1 ? <Row label="Count" value={String(selectedTotal)} /> : null}
        </>
      ) : (
        <div style={EMPTY_STYLE}>Nothing selected</div>
      )}
      <div style={{ ...SECTION_TITLE_STYLE, marginTop: 8 }}>Scene</div>
      <Row label="Elements" value={String(scene.elements.size)} />
      <Row label="Edges" value={String(scene.links.size)} />
      <Row label="Selected" value={String(selectedTotal)} />
    </div>
  );
};

/** Round to at most one decimal, dropping a trailing `.0`. */
const round = (n: number): number => Math.round(n * 10) / 10;

const Row = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}): ReactElement => (
  <div style={ROW_STYLE}>
    <span style={ROW_LABEL_STYLE}>{label}</span>
    <span style={ROW_VALUE_STYLE}>{value}</span>
  </div>
);

const PANEL_STYLE: CSSProperties = {
  position: "absolute",
  top: FLOATING_OVERLAY_TOP_PX,
  right: 12,
  minWidth: 148,
  padding: "8px 10px",
  borderRadius: 10,
  background: "var(--du-ui-bg-solid)",
  border: "1px solid var(--du-ui-border)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
  color: "var(--du-text)",
  fontSize: 12,
  zIndex: 80,
  pointerEvents: "auto",
};
const SECTION_TITLE_STYLE: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "var(--du-text-muted)",
  marginBottom: 4,
};
const ROW_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  lineHeight: "18px",
};
const ROW_LABEL_STYLE: CSSProperties = {
  color: "var(--du-text-muted)",
};
const ROW_VALUE_STYLE: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFamily: "ui-monospace, monospace",
};
const EMPTY_STYLE: CSSProperties = {
  color: "var(--du-text-muted)",
  fontStyle: "italic",
};
