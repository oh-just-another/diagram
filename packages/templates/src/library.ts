import { z } from "zod";
import { templateFromSpec, TemplateLibrarySpecZ, type TemplateLibrarySpec } from "./spec.js";
import { defaultRegistry, type TemplateRegistry } from "./registry.js";
import type { Template } from "./types.js";

/**
 * Errors thrown by library import. Carries the underlying zod error in
 * `reason` for callers that want field-level inspection.
 */
export class TemplateLibraryError extends Error {
  readonly reason: unknown;
  constructor(message: string, reason: unknown) {
    super(message);
    this.name = "TemplateLibraryError";
    this.reason = reason;
  }
}

/** Validate `input` and return the typed library spec. */
export const parseTemplateLibrary = (input: unknown): TemplateLibrarySpec => {
  try {
    return TemplateLibrarySpecZ.parse(input);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new TemplateLibraryError(`Invalid template library: ${err.message}`, err);
    }
    throw err;
  }
};

/**
 * Convert a validated library spec into runtime `Template[]`. Pure — no side
 * effects on any registry.
 */
export const templatesFromLibrary = (lib: TemplateLibrarySpec): readonly Template[] =>
  lib.templates.map(templateFromSpec);

/**
 * Parse, materialise, and register in one call.
 *
 * @param input    parsed JSON object or a JSON string
 * @param registry which registry to load into (defaults to `defaultRegistry`)
 * @param options  `replace: true` overwrites duplicates; otherwise dupe ids throw
 */
export const loadTemplateLibrary = (
  input: unknown,
  registry: TemplateRegistry = defaultRegistry,
  options: { replace?: boolean } = {},
): readonly Template[] => {
  const raw = typeof input === "string" ? safeParseJson(input) : input;
  const lib = parseTemplateLibrary(raw);
  const templates = templatesFromLibrary(lib);
  for (const t of templates) {
    if (options.replace) registry.replace(t);
    else registry.register(t);
  }
  return templates;
};

const safeParseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch (err) {
    throw new TemplateLibraryError("Library file is not valid JSON", err);
  }
};
