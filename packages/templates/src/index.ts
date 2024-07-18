export type { Template, TemplateContext, Category, StandardCategory } from "./types";
export { TemplateRegistry, defaultRegistry } from "./registry";
export { BUILTIN_TEMPLATES, installBuiltinTemplates } from "./built-in";
export * as icons from "./icons";

// JSON spec + programmatic library import.
export type { TemplateSpec, TemplateLibrarySpec, ShapeBlueprint } from "./spec";
export { TemplateSpecZ, TemplateLibrarySpecZ, ShapeBlueprintZ, templateFromSpec } from "./spec";
export {
  parseTemplateLibrary,
  templatesFromLibrary,
  loadTemplateLibrary,
  TemplateLibraryError,
} from "./library";
