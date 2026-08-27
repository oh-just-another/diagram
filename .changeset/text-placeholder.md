---
"@oh-just-another/scene": minor
"@oh-just-another/renderer-core": minor
"@oh-just-another/state": patch
---

Empty text elements show a grey placeholder prompt while being written ("Type something", "Place for text", …): `TEXT_PLACEHOLDERS` (weighted list, a few jokes at low odds) and `pickTextPlaceholder(id)` (deterministic per element id, so the prompt never changes under the caret) live in `@oh-just-another/scene`; the text bounder sizes an empty element by its prompt, so the selection box wraps it and the dirty rect covers it. `TEXT_PLACEHOLDER_COLOR` is exported from renderer-core. Drawn only when `RenderSceneOptions.textPlaceholders` / `ElementRenderContext.textPlaceholders` is set — the editor sets it outside view mode; exports and headless rendering keep empty text blank.
