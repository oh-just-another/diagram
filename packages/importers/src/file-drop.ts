import type { FileDropHandler } from "@oh-just-another/state";
import { IMPORT_FORMATS, importFormatForFile } from "./formats.js";

/**
 * Canvas file-drop handler for every importable diagram format (native
 * JSON, Excalidraw, Mermaid, JSON Canvas, Graphviz DOT, draw.io): the file
 * is parsed with the format matching its extension and INSERTED into the
 * current scene at the drop point (`Editor.insertScene`) — links and
 * files included, one undo step — rather than replacing the board.
 * Register it before host handlers so `.json` scenes win over generic
 * text handlers.
 */
export const diagramFileDropHandler: FileDropHandler = {
  id: "diagram-import",
  label: "Diagrams",
  kind: "scene",
  formats: IMPORT_FORMATS.map((f) => f.label),
  accept: (file) => importFormatForFile(file.name) !== undefined,
  handle: async (file, { editor, worldPoint }) => {
    const format = importFormatForFile(file.name);
    if (!format?.parse) return;
    const scene = format.parse(await file.text());
    editor.insertScene(scene, worldPoint);
  },
};
