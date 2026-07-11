import type { Scene } from "@oh-just-another/scene";
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import {
  exportExcalidraw,
  exportMermaid,
  importDot,
  importDrawio,
  importExcalidraw,
  importJsonCanvas,
  importMermaid,
} from "@oh-just-another/importers";

/**
 * Diagram interchange formats surfaced in the playground's Import / Export
 * menu. Each maps to the ready-made converters in `@oh-just-another/importers`
 * (or native serialization). `import` parses a string into a `Scene`;
 * `export` serialises the current `Scene` to a string. Some formats are
 * import-only — no exporter exists (JSON Canvas, DOT, draw.io).
 */
export interface DiagramFormat {
  readonly id: string;
  /** Human label shown in the menu. */
  readonly label: string;
  /** File extension (with dot) used for the download and the file picker. */
  readonly extension: string;
  /** Parse a document string into a scene, or `undefined` if import-unsupported. */
  readonly parse?: (source: string) => Scene;
  /** Serialise the scene into a document string, or `undefined` if export-unsupported. */
  readonly serialize?: (scene: Scene) => string;
}

export const DIAGRAM_FORMATS: readonly DiagramFormat[] = [
  {
    id: "native",
    label: "Native JSON",
    extension: ".oja.json",
    parse: (source) => parseScene(source),
    // Pretty-printed so a hand-inspected export is readable.
    serialize: (scene) => stringifyScene(scene, 2),
  },
  {
    id: "excalidraw",
    label: "Excalidraw",
    extension: ".excalidraw",
    parse: (source) => importExcalidraw(source),
    serialize: (scene) => exportExcalidraw(scene),
  },
  {
    id: "mermaid",
    label: "Mermaid",
    extension: ".mmd",
    parse: (source) => importMermaid(source),
    serialize: (scene) => exportMermaid(scene),
  },
  {
    id: "jsoncanvas",
    label: "JSON Canvas",
    extension: ".canvas",
    parse: (source) => importJsonCanvas(source),
  },
  {
    id: "dot",
    label: "Graphviz DOT",
    extension: ".dot",
    parse: (source) => importDot(source),
  },
  {
    id: "drawio",
    label: "draw.io",
    extension: ".drawio",
    parse: (source) => importDrawio(source),
  },
];

/** Formats that can be imported (have a `parse`), in menu order. */
export const IMPORT_FORMATS: readonly DiagramFormat[] = DIAGRAM_FORMATS.filter((f) => f.parse);

/** Formats that can be exported (have a `serialize`), in menu order. */
export const EXPORT_FORMATS: readonly DiagramFormat[] = DIAGRAM_FORMATS.filter((f) => f.serialize);

/** Parse `source` into a scene using the format `id`. Throws on unknown/unsupported id. */
export const importSceneFrom = (id: string, source: string): Scene => {
  const format = DIAGRAM_FORMATS.find((f) => f.id === id);
  if (!format?.parse) throw new Error(`No importer for format "${id}"`);
  return format.parse(source);
};

/** Serialise `scene` to a document string using the format `id`. Throws on unknown/unsupported id. */
export const exportSceneAs = (id: string, scene: Scene): { text: string; filename: string } => {
  const format = DIAGRAM_FORMATS.find((f) => f.id === id);
  if (!format?.serialize) throw new Error(`No exporter for format "${id}"`);
  return { text: format.serialize(scene), filename: `diagram${format.extension}` };
};
