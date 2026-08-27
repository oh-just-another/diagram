import type { Scene } from "@oh-just-another/scene";
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import { importExcalidraw } from "./excalidraw.js";
import { exportExcalidraw } from "./excalidraw-export.js";
import { exportMermaid } from "./mermaid-export.js";
import { importJsonCanvas } from "./jsoncanvas.js";
import { importDot, importDrawio, importMermaid } from "./convenience.js";

/**
 * Diagram interchange formats — the single table behind Import / Export
 * menus and the canvas file-drop handler. Each maps to a converter in this
 * package (or native serialization). `import` parses a string into a `Scene`;
 * `export` serialises the current `Scene` to a string. Some formats are
 * import-only — no exporter exists (JSON Canvas, DOT, draw.io).
 */
export interface DiagramFormat {
  readonly id: string;
  /** Human label shown in the menu. */
  readonly label: string;
  /** File extension (with dot) used for the download and the file picker. */
  readonly extension: string;
  /** Every extension the importer recognises on a dropped / picked file (`extension` first). */
  readonly extensions: readonly string[];
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
    extensions: [".oja.json", ".json"],
    parse: (source) => parseScene(source),
    // Pretty-printed so a hand-inspected export is readable. Binary files
    // (images / gif / video bytes) are embedded so the exported file is
    // self-contained on another machine — unlike the autosave path, which
    // keeps them in IndexedDB.
    serialize: (scene) => stringifyScene(scene, 2, { includeFiles: true }),
  },
  {
    id: "excalidraw",
    label: "Excalidraw",
    extension: ".excalidraw",
    extensions: [".excalidraw"],
    parse: (source) => importExcalidraw(source),
    serialize: (scene) => exportExcalidraw(scene),
  },
  {
    id: "mermaid",
    label: "Mermaid",
    extension: ".mmd",
    extensions: [".mmd", ".mermaid"],
    parse: (source) => importMermaid(source),
    serialize: (scene) => exportMermaid(scene),
  },
  {
    id: "jsoncanvas",
    label: "JSON Canvas",
    extension: ".canvas",
    extensions: [".canvas"],
    parse: (source) => importJsonCanvas(source),
  },
  {
    id: "dot",
    label: "Graphviz DOT",
    extension: ".dot",
    extensions: [".dot", ".gv"],
    parse: (source) => importDot(source),
  },
  {
    id: "drawio",
    label: "draw.io",
    extension: ".drawio",
    extensions: [".drawio", ".drawio.xml"],
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

/** The import format (by extension, longest match first) for a file name, or `undefined`. */
export const importFormatForFile = (fileName: string): DiagramFormat | undefined => {
  const name = fileName.toLowerCase();
  let best: { format: DiagramFormat; ext: string } | undefined;
  for (const format of IMPORT_FORMATS) {
    for (const ext of format.extensions) {
      if (name.endsWith(ext) && (best === undefined || ext.length > best.ext.length)) {
        best = { format, ext };
      }
    }
  }
  return best?.format;
};
