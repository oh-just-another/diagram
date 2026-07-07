/**
 * Narrowing helpers for untyped JSON payloads (`.excalidraw`, JSON Canvas).
 * Every accessor takes `unknown` and returns a safe fallback instead of
 * throwing, so malformed documents degrade to skipped elements rather than
 * crashes.
 */

export const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export const asArray = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);

export const asString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

export const asNumber = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Parse a JSON document that is expected to be an object. Empty / whitespace
 * input yields `{}` (an empty file imports as an empty scene); anything else
 * that fails to parse throws with the format name in the message.
 */
export const parseJsonRecord = (source: string, format: string): Record<string, unknown> => {
  if (source.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (e) {
    throw new Error(`Invalid ${format} JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  return asRecord(parsed);
};
