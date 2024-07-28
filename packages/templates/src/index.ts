export type { Template, TemplateContext, Category, StandardCategory } from "./types.js";
export { TemplateRegistry, defaultRegistry } from "./registry.js";
export { BUILTIN_TEMPLATES, installBuiltinTemplates } from "./built-in.js";
export * as icons from "./icons.js";

// JSON spec + programmatic library import.
export type { TemplateSpec, TemplateLibrarySpec, ShapeBlueprint } from "./spec.js";
export { TemplateSpecZ, TemplateLibrarySpecZ, ShapeBlueprintZ, templateFromSpec } from "./spec.js";
export {
  parseTemplateLibrary,
  templatesFromLibrary,
  loadTemplateLibrary,
  TemplateLibraryError,
} from "./library.js";

// Rich-template surface: node-tree + flex layout + bindings.
export * as rich from "./rich/index.js";
