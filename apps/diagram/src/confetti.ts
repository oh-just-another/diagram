import {
  getElementRenderer,
  registerElementRenderer,
  type ElementRenderer,
  type RenderTarget,
} from "@oh-just-another/renderer-core";
import type { RectangleElement } from "@oh-just-another/scene";
import { HUE_TONES } from "@oh-just-another/tokens";

/**
 * Procedural confetti for the `custom.confetti` template (a plain
 * rectangle carrying `metadata.confetti` + `metadata.animated`).
 *
 * Confetti is a pure function of (emitter config, wall-clock time,
 * particle index): no per-frame state, no decode, resolution-
 * independent (sharp at any zoom). The editor's `AnimationTick`
 * (armed by `metadata.animated = true`) forces a re-render every frame
 * and already throttles / viewport-culls / pauses in background tabs,
 * so the FPS cost is bounded.
 *
 * Rendering: `installConfettiRenderer()` wraps the built-in rectangle
 * renderer — it draws the particles FIRST (so they sit on the bottom
 * layer, behind the box) then delegates to the real rectangle draw for
 * the body. Particles are emitted in the shape's LOCAL space (the
 * scene renderer has already applied the shape's transform), so they
 * fly freely beyond the box edges.
 *
 * The offscreen-worker backend has its own renderer registry inside the
 * worker, so confetti only draws on the main-thread canvas2d / webgl2
 * paths (the default). Under the worker the box still renders normally —
 * the confetti just doesn't show.
 */

/** Particles emitted per source when a config omits its own `count`. */
export const CONFETTI_DEFAULT_COUNT = 38;
/** Base lifetime of one particle, seconds. Varied ±per-particle below. */
export const CONFETTI_LIFETIME_S = 1.6;
/** Per-particle lifetime jitter factor (multiplies the base lifetime). */
export const CONFETTI_LIFETIME_JITTER = 0.6;
/** Launch speed range, local px/s. Picked per-particle from a hash. */
export const CONFETTI_SPEED_MIN = 90;
export const CONFETTI_SPEED_MAX = 220;
/** Half-angle of the launch fan around the emitter direction, radians. */
export const CONFETTI_SPREAD_RAD = 0.5;
/** Downward gravity, local px/s². Pulls launched particles into an arc. */
export const CONFETTI_GRAVITY = 240;
/** Particle strip size range (px). Width; height is half (a confetto). */
export const CONFETTI_SIZE_MIN = 5;
export const CONFETTI_SIZE_MAX = 9;
/** Tumble speed range, radians/s (signed via per-particle hash). */
export const CONFETTI_SPIN_MAX = 7;
/** Horizontal flutter — sway amplitude (px) and frequency (rad/s). */
export const CONFETTI_FLUTTER_AMP = 10;
export const CONFETTI_FLUTTER_FREQ = 6;
/** Fraction of life over which a particle fades out (tail). */
export const CONFETTI_FADE_TAIL = 0.35;

const TAU = Math.PI * 2;

/**
 * Festive palette — Radix step-9 solids from the tokens package.
 * Gray is intentionally dropped (low-energy for confetti).
 */
const CONFETTI_COLORS: readonly string[] = [
  HUE_TONES.light.tomato.solid,
  HUE_TONES.light.amber.solid,
  HUE_TONES.light.grass.solid,
  HUE_TONES.light.cyan.solid,
  HUE_TONES.light.iris.solid,
  HUE_TONES.light.plum.solid,
];

/** One confetti source, as stored in `metadata.confetti.emitters`. */
export interface ConfettiEmitter {
  /** Emitter X as a ratio of the box width (0..1). */
  readonly cx: number;
  /** Emitter Y as a ratio of the box height (0..1). */
  readonly cy: number;
  /** Launch direction X (unnormalised; sign = left/right). */
  readonly dirX: number;
  /** Launch direction Y (unnormalised; negative = up). */
  readonly dirY: number;
  /** Particles for this source. Defaults to {@link CONFETTI_DEFAULT_COUNT}. */
  readonly count?: number;
}

export interface ConfettiConfig {
  readonly emitters: readonly ConfettiEmitter[];
}

/** Deterministic per-index hash → [0,1). Stable across frames (no state). */
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const frac = (x: number): number => x - Math.floor(x);

const nowSeconds = (): number =>
  (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

/** Narrow `metadata.confetti` (typed `unknown`) into a usable config. */
const readConfig = (meta: Record<string, unknown> | undefined): ConfettiConfig | null => {
  const raw = meta?.confetti as { emitters?: unknown } | undefined;
  if (!raw || !Array.isArray(raw.emitters)) return null;
  const emitters = raw.emitters.filter(
    (e): e is ConfettiEmitter =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as ConfettiEmitter).cx === "number" &&
      typeof (e as ConfettiEmitter).cy === "number",
  );
  return emitters.length > 0 ? { emitters } : null;
};

/**
 * Draw all emitters' particles in the box's local space. Pure w.r.t.
 * the current wall-clock — same time + same shape size → same frame.
 */
const drawConfetti = (shape: RectangleElement, cfg: ConfettiConfig, target: RenderTarget): void => {
  const t0 = nowSeconds();
  const w = shape.width;
  const h = shape.height;

  cfg.emitters.forEach((em, ei) => {
    const ox = em.cx * w;
    const oy = em.cy * h;
    const len = Math.hypot(em.dirX, em.dirY) || 1;
    const baseAngle = Math.atan2(em.dirY / len, em.dirX / len);
    const count = em.count ?? CONFETTI_DEFAULT_COUNT;

    for (let i = 0; i < count; i++) {
      const seed = (ei + 1) * 1000 + i;
      const r1 = hash(seed);
      const r2 = hash(seed * 1.7 + 3.3);
      const r3 = hash(seed * 2.3 + 9.1);
      const r4 = hash(seed * 3.1 + 17.7);

      const period = CONFETTI_LIFETIME_S * (1 - CONFETTI_LIFETIME_JITTER * 0.5 + CONFETTI_LIFETIME_JITTER * r1);
      // Stagger launch so the stream is continuous, not pulsed.
      const u = frac(t0 / period + i / count + r2 * 0.13);
      const t = u * period;

      const angle = baseAngle + (r3 - 0.5) * 2 * CONFETTI_SPREAD_RAD;
      const speed = CONFETTI_SPEED_MIN + r4 * (CONFETTI_SPEED_MAX - CONFETTI_SPEED_MIN);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      const sway = Math.sin(t * CONFETTI_FLUTTER_FREQ + r1 * TAU) * CONFETTI_FLUTTER_AMP * u;
      const x = ox + vx * t + sway;
      const y = oy + vy * t + 0.5 * CONFETTI_GRAVITY * t * t;

      // Fade in fast, fade out over the tail of the life.
      const alpha = u > 1 - CONFETTI_FADE_TAIL ? (1 - u) / CONFETTI_FADE_TAIL : Math.min(1, u * 8);

      const size = CONFETTI_SIZE_MIN + r2 * (CONFETTI_SIZE_MAX - CONFETTI_SIZE_MIN);
      const spin = (r3 - 0.5) * 2 * CONFETTI_SPIN_MAX;
      const rot = r4 * TAU + spin * t;
      const color = CONFETTI_COLORS[(ei * count + i) % CONFETTI_COLORS.length];
      if (color === undefined) continue;

      target.save();
      target.translate(x, y);
      target.rotate(rot);
      target.setOpacity(alpha);
      target.setStrokeWidth(0);
      target.setFill(color);
      target.beginPath();
      target.rect(-size / 2, -size / 4, size, size / 2);
      target.fill();
      target.restore();
    }
  });
};

/** Marker so a re-install doesn't double-wrap the renderer. */
const CONFETTI_MARK = "__ojaConfetti";

/**
 * Wrap the registered rectangle renderer so rectangles carrying
 * `metadata.confetti` paint particles underneath. Idempotent, and safe
 * to call after every `installBuiltinRenderers()` (which resets the
 * rectangle renderer to the plain built-in) — e.g. from `onReady`.
 */
export const installConfettiRenderer = (): void => {
  const base = getElementRenderer("rectangle") as
    | (ElementRenderer<RectangleElement> & { [CONFETTI_MARK]?: true })
    | undefined;
  if (base?.[CONFETTI_MARK]) return;

  const wrapped: ElementRenderer<RectangleElement> & { [CONFETTI_MARK]?: true } = (
    shape,
    target,
  ) => {
    const cfg = readConfig(shape.metadata);
    if (cfg) drawConfetti(shape, cfg, target);
    base?.(shape, target);
  };
  wrapped[CONFETTI_MARK] = true;
  registerElementRenderer<RectangleElement>("rectangle", wrapped);
};
