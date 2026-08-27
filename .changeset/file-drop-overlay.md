---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": patch
---

Drop overlay: while an OS file is dragged over the canvas the editor shows a dashed frame, a drop glyph with "DROP" and a chip per accepted file kind. `FileDropHandler` gains presentation metadata — `label`, `kind` (`image` · `video` · `scene` · `text` · `data` · `file`) and `formats` — the built-in image and video handlers ship theirs; `Editor.getFileDropHandlers()` lists the registry. New `FileDropOverlay` component and `usePalettePlacement({ onFileDrag })` for hosts composing their own canvas.
