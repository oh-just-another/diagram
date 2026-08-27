---
"@oh-just-another/state": minor
"@oh-just-another/importers": minor
"@oh-just-another/editor": minor
---

Drop any importable diagram file onto the canvas. `@oh-just-another/importers` now owns the formats table (`DIAGRAM_FORMATS`, `IMPORT_FORMATS`, `EXPORT_FORMATS`, `importSceneFrom`, `exportSceneAs`, `importFormatForFile`) and ships `diagramFileDropHandler` — native JSON, Excalidraw, Mermaid, JSON Canvas, Graphviz DOT and draw.io files are parsed and inserted at the drop point; the `Editor` component registers it by default (listed as "Diagrams" in the drop overlay). New `Editor.insertScene(fragment, worldPoint)` merges a scene fragment — elements, links and binary files, ids remapped, one undo step — into the current scene without replacing it.
