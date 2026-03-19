import { getElement, updateElement, type Scene, type Patch } from "@oh-just-another/scene";
import type { ElementId } from "@oh-just-another/types";

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
      patches.length === 1 && firstPatch !== undefined
        ? firstPatch
        : { kind: "batch", patches },
  };
};
