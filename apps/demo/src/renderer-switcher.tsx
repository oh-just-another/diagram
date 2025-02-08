import type { CSSProperties } from "react";
import {
  RENDERER_LABEL,
  RENDERER_MODES,
  type RendererMode,
} from "./renderer-mode";

/**
 * Compact dropdown that lets the user flip between Canvas2D /
 * WebGL2 / OffscreenCanvas backends without reloading. On change,
 * the parent (`App`) updates state which re-runs `<DiagramRoot>`
 * with a fresh `renderer` prop; the URL + localStorage are kept
 * in sync via `persistRendererMode` so the choice survives a
 * reload and links can pin a backend.
 *
 * Visual: small pill-shaped `<select>` so it matches the rest of
 * the demo's header chrome (room badge, theme toggle).
 */
export interface RendererSwitcherProps {
  readonly value: RendererMode;
  readonly onChange: (next: RendererMode) => void;
  readonly style?: CSSProperties;
}

export const RendererSwitcher = ({ value, onChange, style }: RendererSwitcherProps) => (
  <label
    title="Renderer backend — also controllable via ?renderer= query string"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 10,
      color: "var(--muted, #aaa)",
      ...style,
    }}
  >
    <span style={{ opacity: 0.7 }}>renderer:</span>
    <select
      value={value}
      onChange={(ev) => onChange(ev.target.value as RendererMode)}
      style={{
        fontSize: 10,
        padding: "2px 4px",
        borderRadius: 3,
        background: "var(--button-bg, #2a2a2a)",
        color: "var(--fg, #ddd)",
        border: "1px solid var(--border, #333)",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {RENDERER_MODES.map((mode) => (
        <option key={mode} value={mode}>
          {RENDERER_LABEL[mode]}
        </option>
      ))}
    </select>
  </label>
);
