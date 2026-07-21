---
"@oh-just-another/serialization": minor
"@oh-just-another/editor": patch
---

Embed binary files in scene file exports. `serializeScene` / `stringifyScene` accept `{ includeFiles: true }` to inline `Scene.files` (base64) into the document, and `parseScene` / `deserializeScene` restore them — so a saved scene with images / GIFs / videos is self-contained and renders on any machine. The editor's Save action (Cmd+S) now embeds files; autosave documents still omit them (bytes stay in the host's binary store).
