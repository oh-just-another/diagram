import type { ElementBase, TemplateElement, TextElement } from "./shapes/shape.js";
import { ACCESSIBLE_NAME_MAX_CHARS } from "./constants.js";

/**
 * Resolver from a shape to an accessible name (screen-reader label).
 * Plugins register their own to handle custom shape types — defaults
 * cover the built-ins: text → text content, template → `metadata.label`
 * or `type`, others → titleised `type`.
 *
 * The resolver is synchronous and pure so it can run in a
 * `getElementAccessibleName` query without side effects.
 */
export type AccessibleNameResolver<S extends ElementBase = ElementBase> = (shape: S) => string;

const registry = new Map<string, AccessibleNameResolver>();

export const registerAccessibleName = <S extends ElementBase>(
  type: string,
  resolver: AccessibleNameResolver<S>,
): void => {
  registry.set(type, resolver as AccessibleNameResolver);
};

/**
 * Returns a short human-readable label for a shape. Falls back to the
 * shape's `type` titleised when no resolver is registered.
 *
 * Examples:
 *   text shape with text "Hello" → "Hello"
 *   template "task-card" with metadata.label "Buy milk" → "Buy milk"
 *   rectangle → "Rectangle"
 */
export const getElementAccessibleName = (shape: ElementBase): string => {
  const resolver = registry.get(shape.type);
  if (resolver) {
    const name = resolver(shape).trim();
    if (name) return name;
  }
  // Labelled shapes (rectangle "Item 3", sticky, …): type + label, so a
  // focus cycle reads the content, not just the geometry.
  const label = (shape as { readonly label?: { readonly text?: string } }).label?.text
    ?.replace(/\s+/g, " ")
    .trim();
  if (label) return `${titleise(shape.type)} "${truncate(label)}"`;
  return titleise(shape.type);
};

const truncate = (s: string): string =>
  s.length > ACCESSIBLE_NAME_MAX_CHARS ? `${s.slice(0, ACCESSIBLE_NAME_MAX_CHARS - 3)}…` : s;

const titleise = (s: string): string =>
  s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");

// --- Built-in resolvers ---

registerAccessibleName<TextElement>("text", (s) => {
  // Collapse whitespace and truncate long bodies so screen-reader
  // announcements stay actionable.
  const body = s.text.replace(/\s+/g, " ").trim();
  return truncate(body);
});

registerAccessibleName<TemplateElement>("template", (s) => {
  const label = s.metadata?.label;
  if (typeof label === "string" && label.trim()) return label.trim();
  return titleise(s.templateId);
});
