import {
  getElement,
  updateElement,
  type Scene,
  type Patch,
  type SnapEngine,
  type SnapCandidate,
  type LinkEndpoint,
  type AnchorRef,
  type Element,
} from "@oh-just-another/scene";
import type { ElementId, Vec2 } from "@oh-just-another/types";

/**
 * Schemes allowed to be stored / opened. Everything else (notably
 * `javascript:`, `data:`, `vbscript:`, `file:`) is rejected so a scene
 * can't smuggle an XSS / local-file payload through an element link.
 */
const SAFE_SCHEME = /^(https?:|mailto:)/i;
const BARE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalise user-entered link text into a safe, storable href, or
 * `null` to clear / reject. Adds `https://` to a scheme-less URL,
 * `mailto:` to a bare email, and refuses unsafe schemes.
 */
export const normalizeHref = (input: string): string | null => {
  const s = input.trim();
  if (s === "") return null;
  if (SAFE_SCHEME.test(s)) return s;
  // Has a scheme but not a safe one (javascript:, data:, …) → reject.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  if (BARE_EMAIL.test(s)) return `mailto:${s}`;
  return `https://${s}`;
};

/**
 * Final gate before navigation. Returns the href only if it's a safe
 * scheme; otherwise `null`. Defensive even though `normalizeHref`
 * already filtered — stored scenes from other sources may carry
 * anything.
 */
export const safeHref = (href: string | undefined | null): string | null => {
  if (!href) return null;
  return SAFE_SCHEME.test(href.trim()) ? href.trim() : null;
};

/**
 * Set (or clear, with `null`) the `href` on every shape in `ids`.
 * Returns the next scene + a single / batched patch, or `null` when no
 * shape applied or nothing changed.
 */
export const computeSetLink = (
  scene: Scene,
  ids: Iterable<ElementId>,
  href: string | null,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const targetIds: ElementId[] = [];
  for (const id of ids) {
    const s = getElement(scene, id);
    if (s && (s.href ?? null) !== href) targetIds.push(id);
  }
  if (targetIds.length === 0) return null;
  let s = scene;
  const patches: Patch[] = [];
  for (const id of targetIds) {
    const r = updateElement(s, id, (sh) => {
      const next = { ...sh };
      if (href === null) delete next.href;
      else next.href = href;
      return next;
    });
    s = r.scene;
    patches.push(r.patch);
  }
  const firstPatch = patches[0];
  return {
    scene: s,
    patch:
      patches.length === 1 && firstPatch !== undefined ? firstPatch : { kind: "batch", patches },
  };
};

/**
 * Convert a snap candidate into a `LinkEndpoint`. Anchor snap → named anchor
 * ref; outline snap → outline ref with the sampled ratio. Falls back to a free
 * point if the metadata isn't recognised.
 */
const endpointFromSnap = (
  elementId: ElementId,
  candidate: SnapCandidate,
  shape: Element,
): LinkEndpoint => {
  if (candidate.kind === "anchor") {
    const ref = candidate.metadata?.ref as AnchorRef | undefined;
    if (ref) return { kind: "anchor", elementId, anchor: ref };
  }
  if (candidate.kind === "outline" && typeof candidate.metadata?.ratio === "number") {
    return { kind: "outline", elementId, ratio: candidate.metadata.ratio };
  }
  // Defensive fallback — should not happen with built-in contributors.
  void shape;
  return { kind: "point", position: candidate.snapped };
};

/**
 * Resolve where a link endpoint should attach when dropped at `worldPoint`.
 * Attach contract: a port dot → *fixed* anchor; near an EDGE (not a dot) →
 * *fixed* outline point (a perimeter ratio — survives move/resize); the body
 * interior → *floating* against the whole shape (re-aims as shapes move); empty
 * canvas → a free point. `pressTargetElement` biases the pick toward the pressed
 * shape, but a dot drawn outside the body still binds even when it's null.
 */
export const snapLinkEndpoint = (
  scene: Scene,
  snapEngine: SnapEngine,
  threshold: number,
  pressTargetElement: ElementId | null,
  worldPoint: Vec2,
): LinkEndpoint => {
  const result = snapEngine.snap({
    scene,
    probe: worldPoint,
    threshold,
    gesture: "draw-edge",
  });

  const pick = (kind: SnapCandidate["kind"]): SnapCandidate | undefined => {
    if (pressTargetElement !== null) {
      const onTarget = result.all.find(
        (c) => c.kind === kind && c.metadata?.elementId === pressTargetElement,
      );
      if (onTarget) return onTarget;
    }
    return result.all.find((c) => c.kind === kind);
  };

  const boundFrom = (
    cand: SnapCandidate | undefined,
    want: "anchor" | "outline",
  ): LinkEndpoint | null => {
    if (!cand) return null;
    const elId = cand.metadata?.elementId as ElementId | undefined;
    if (elId === undefined) return null;
    const shp = getElement(scene, elId);
    if (!shp) return null;
    const ep = endpointFromSnap(elId, cand, shp);
    return ep.kind === want ? ep : null;
  };

  const anchorEp = boundFrom(pick("anchor"), "anchor");
  if (anchorEp) return anchorEp;
  const outlineEp = boundFrom(pick("outline"), "outline");
  if (outlineEp) return outlineEp;

  // No dot/edge snap. Over a shape body → floating; else a free point.
  if (pressTargetElement !== null && getElement(scene, pressTargetElement)) {
    return { kind: "floating", elementId: pressTargetElement };
  }
  return { kind: "point", position: worldPoint };
};
