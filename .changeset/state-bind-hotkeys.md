---
"@oh-just-another/state": minor
"@oh-just-another/editor": minor
---

Add `bindEditorHotkeys(editor, options?)` — a reusable, framework-agnostic keyboard-shortcut binding driven by the action registry. Returns an unbind function, leaves text fields alone (except `Escape`), and reads `composedPath()[0]` so the editable-target check stays correct across a shadow-root boundary. Re-exported from `@oh-just-another/editor`.
