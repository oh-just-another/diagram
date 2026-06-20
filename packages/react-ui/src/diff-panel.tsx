import { useMemo, type CSSProperties } from "react";
import {
  diffSceneElements,
  getElementWorldBounds,
  type Scene,
  type SceneElementDiff,
} from "@oh-just-another/scene";
import { renderSceneToSvg } from "@oh-just-another/renderer-svg";
import { DIFF_COLORS } from "@oh-just-another/tokens";

/**
 * Side-by-side scene comparison. Renders two snapshots to SVG via the
 * headless renderer and overlays diff markers:
 *
 *   green box  — added in `right`
 *   red box    — removed (only in `left`)
 *   yellow box — modified (in both, different ref)
 *
 * Pure presentation — receives two `Scene` values from the host
 * (typically a `VersionStore` snapshot pair) and never touches the
 * live editor. Hosts pick which snapshots to compare via the
 * VersionPanel UI; this component is the visual.
 */

export interface DiffPanelProps {
  readonly left: Scene;
  readonly right: Scene;
  readonly leftLabel?: string;
  readonly rightLabel?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

const PANEL_WIDTH = 480;
const PANEL_HEIGHT = 360;

export const DiffPanel = ({
  left,
  right,
  leftLabel = "Before",
  rightLabel = "After",
  className,
  style,
}: DiffPanelProps) => {
  const diff = useMemo(() => diffSceneElements(left, right), [left, right]);
  const leftSvg = useMemo(
    () => renderSceneToSvg(left, { width: PANEL_WIDTH, height: PANEL_HEIGHT }),
    [left],
  );
  const rightSvg = useMemo(
    () => renderSceneToSvg(right, { width: PANEL_WIDTH, height: PANEL_HEIGHT }),
    [right],
  );

  const container: CSSProperties = {
    display: "flex",
    gap: 12,
    padding: 12,
    background: "var(--panel, #161616)",
    color: "var(--text, #ddd)",
    ...style,
  };

  return (
    <div className={className} style={container}>
      <SideView label={leftLabel} svg={leftSvg} scene={left} diff={diff} side="left" />
      <SideView label={rightLabel} svg={rightSvg} scene={right} diff={diff} side="right" />
    </div>
  );
};

const SideView = ({
  label,
  svg,
  scene,
  diff,
  side,
}: {
  label: string;
  svg: string;
  scene: Scene;
  diff: SceneElementDiff;
  side: "left" | "right";
}) => {
  // Which markers to draw on this side:
  //   - left side highlights `removed` (red) — shapes that existed
  //     in `prev` but not in `next`.
  //   - right side highlights `added` (green).
  //   - both sides highlight `modified` (yellow) using each side's
  //     own bounds — so the user sees the before AND after position
  //     of a moved shape.
  const overlays = useMemo(() => {
    const out: { id: string; color: string; bounds: ReturnType<typeof getElementWorldBounds> }[] =
      [];
    const palette = DIFF_COLORS;
    if (side === "left") {
      for (const id of diff.removed) {
        const s = scene.elements.get(id);
        if (s) out.push({ id, color: palette.removed, bounds: getElementWorldBounds(s) });
      }
    } else {
      for (const id of diff.added) {
        const s = scene.elements.get(id);
        if (s) out.push({ id, color: palette.added, bounds: getElementWorldBounds(s) });
      }
    }
    for (const id of diff.modified) {
      const s = scene.elements.get(id);
      if (s) out.push({ id, color: palette.modified, bounds: getElementWorldBounds(s) });
    }
    return out;
  }, [scene, diff, side]);

  const frameStyle: CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  };
  const figureStyle: CSSProperties = {
    position: "relative",
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #2a2a2a)",
    borderRadius: 4,
    overflow: "hidden",
  };

  return (
    <section style={frameStyle}>
      <header
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--muted, #888)",
        }}
      >
        {label}
      </header>
      <div style={figureStyle}>
        {/* The renderer-svg output is a complete <svg>…</svg> string. */}
        <div dangerouslySetInnerHTML={{ __html: svg }} style={{ position: "absolute", inset: 0 }} />
        <svg
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          viewBox={`0 0 ${PANEL_WIDTH} ${PANEL_HEIGHT}`}
        >
          {overlays.map((m) => (
            <rect
              key={`${side}-${m.id}`}
              x={m.bounds.x}
              y={m.bounds.y}
              width={m.bounds.width}
              height={m.bounds.height}
              fill="none"
              stroke={m.color}
              strokeWidth={2}
              strokeDasharray="4,3"
            />
          ))}
        </svg>
      </div>
    </section>
  );
};
