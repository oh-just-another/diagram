import type { ElementBase, TemplateElement, TextElement } from "./shape.js";

/**
 * Resolver from a shape to an accessible name (screen-reader label).
 * Plugins register their own to handle custom shape types — defaults
 * cover the built-ins: text → text content, template → `metadata.label`
 * or `type`, others → titleised `type`.
 *
 * The resolver is intentionally synchronous + pure so it can run in
 * a `getShapeAccessibleName` query without side effects.
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
export const getShapeAccessibleName = (shape: ElementBase): string => {
  const resolver = registry.get(shape.type);
  if (resolver) {
    const name = resolver(shape).trim();
    if (name) return name;
  }
  return titleise(shape.type);
};

const titleise = (s: string): string =>
  s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");

// --- Built-in resolvers ---

registerAccessibleName<TextElement>("text", (s) => {
  // Collapse whitespace and truncate long bodies so screen-reader
  // announcements stay actionable.
  const body = s.text.replace(/\s+/g, " ").trim();
  return body.length > 80 ? `${body.slice(0, 77)}…` : body;
});

registerAccessibleName<TemplateElement>("template", (s) => {
  const label = s.metadata?.label;
  if (typeof label === "string" && label.trim()) return label.trim();
  return titleise(s.templateId);
});
