import type { TextStyle } from "./style.js";
import type { TextElement } from "../shapes/shape.js";

/**
 * A styled segment of a text block. `text` is the raw substring; `style`
 * is a PARTIAL overlay merged over the owning {@link TextElement}'s base
 * `style` (element style wins for fields the run omits). Omitting `style`
 * means "inherit the element style verbatim".
 *
 * Runs are an ADDITIVE overlay: the element's flat `text` stays the source
 * of truth and MUST equal `runs.map(r => r.text).join("")`. A `TextElement`
 * with no `runs` (or an empty array) renders exactly as before this feature
 * existed — one uniform style — so plain-text scenes are untouched.
 */
export interface TextRun {
  readonly text: string;
  readonly style?: Partial<TextStyle>;
}

/** Concatenated raw text of a run list (the flat-text source of truth). */
export const runsToText = (runs: readonly TextRun[]): string => runs.map((r) => r.text).join("");

/**
 * Stable-ish key for a run style, used only to coalesce adjacent runs that
 * carry identical styling. Sorts top-level keys so key order doesn't defeat
 * the compare. A false "different" verdict only costs an extra (correct) run,
 * never wrong rendering, so a shallow canonicalisation is sufficient.
 */
const styleKey = (style: Partial<TextStyle> | undefined): string => {
  if (!style) return "";
  const entries = Object.entries(style as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
};

/**
 * Drop empty-text runs and coalesce adjacent runs with identical styling.
 * Returns a compact, canonical run list. An all-empty input yields `[]`.
 */
export const normalizeRuns = (runs: readonly TextRun[]): TextRun[] => {
  const out: TextRun[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const last = out[out.length - 1];
    if (last !== undefined && styleKey(last.style) === styleKey(run.style)) {
      out[out.length - 1] = {
        text: last.text + run.text,
        ...(last.style !== undefined ? { style: last.style } : {}),
      };
    } else {
      out.push(run);
    }
  }
  return out;
};

/** The run list to start from: explicit `runs`, else one run spanning `text`. */
const baseRuns = (el: Pick<TextElement, "text" | "runs">): TextRun[] => {
  const runs = el.runs;
  if (runs !== undefined && runs.length > 0) return normalizeRuns(runs);
  return el.text === "" ? [] : [{ text: el.text }];
};

/**
 * The runs that fall inside the character range `[from, to)` of a text block,
 * clipped at the range edges. Used by the renderer to split each visual line
 * into per-style segments. Styles are preserved verbatim (still partial
 * overlays over the element style).
 */
export const sliceRuns = (
  el: Pick<TextElement, "text" | "runs">,
  from: number,
  to: number,
): TextRun[] => {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const out: TextRun[] = [];
  let pos = 0;
  for (const run of baseRuns(el)) {
    const rStart = pos;
    const rEnd = pos + run.text.length;
    pos = rEnd;
    const s = Math.max(rStart, lo);
    const e = Math.min(rEnd, hi);
    if (s >= e) continue;
    out.push({
      text: run.text.slice(s - rStart, e - rStart),
      ...(run.style !== undefined ? { style: run.style } : {}),
    });
  }
  return out;
};

/** Shallow-merge `patch` over `base`, pruning keys explicitly set to undefined. */
const mergeStyle = (
  base: Partial<TextStyle> | undefined,
  patch: Partial<TextStyle>,
): Partial<TextStyle> | undefined => {
  const merged: Record<string, unknown> = { ...(base ?? {}), ...patch };
  const entries = Object.entries(merged).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return undefined;
  const cleaned: Partial<TextStyle> = Object.fromEntries(entries);
  return cleaned;
};

/**
 * Pure operation: apply a partial {@link TextStyle} overlay to the character
 * range `[from, to)` of a text element, returning a NEW element. The flat
 * `text` is never touched (invariant preserved). Existing runs are split at
 * the range boundaries and the patch is merged into the overlapping portion;
 * adjacent runs with equal styling are coalesced.
 *
 * When the result collapses to a single unstyled run spanning the whole text,
 * `runs` is dropped entirely so the element reverts to a plain text block
 * (keeps scenes minimal and round-trips cleanly). An empty range is a no-op.
 */
export const applyStyleToRange = (
  el: TextElement,
  from: number,
  to: number,
  patch: Partial<TextStyle>,
): TextElement => {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(el.text.length, Math.max(from, to));
  if (lo >= hi) return el;

  const out: TextRun[] = [];
  let pos = 0;
  for (const run of baseRuns(el)) {
    const rStart = pos;
    const rEnd = pos + run.text.length;
    pos = rEnd;
    const midStart = Math.max(rStart, lo);
    const midEnd = Math.min(rEnd, hi);
    if (midStart >= midEnd) {
      out.push(run);
      continue;
    }
    if (rStart < midStart) {
      out.push({
        text: run.text.slice(0, midStart - rStart),
        ...(run.style !== undefined ? { style: run.style } : {}),
      });
    }
    const merged = mergeStyle(run.style, patch);
    out.push({
      text: run.text.slice(midStart - rStart, midEnd - rStart),
      ...(merged !== undefined ? { style: merged } : {}),
    });
    if (midEnd < rEnd) {
      out.push({
        text: run.text.slice(midEnd - rStart),
        ...(run.style !== undefined ? { style: run.style } : {}),
      });
    }
  }

  const normalized = normalizeRuns(out);
  const only = normalized[0];
  if (
    normalized.length === 1 &&
    only !== undefined &&
    (only.style === undefined || Object.keys(only.style).length === 0)
  ) {
    // Reverted to a single uniform style → shed the overlay entirely.
    const { runs: _drop, ...rest } = el;
    void _drop;
    return rest;
  }
  return { ...el, runs: normalized };
};
