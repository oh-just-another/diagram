---
"@oh-just-another/renderer-core": minor
"@oh-just-another/state": patch
---

Empty text elements show a grey placeholder prompt while being written ("Type something", "Place for text", …): `TEXT_PLACEHOLDERS` (weighted list, a few jokes at low odds), `pickTextPlaceholder(id)` (deterministic per element id, so the prompt never changes under the caret) and `TEXT_PLACEHOLDER_COLOR` are exported. Drawn only when `RenderSceneOptions.textPlaceholders` / `ElementRenderContext.textPlaceholders` is set — the editor sets it outside view mode; exports and headless rendering keep empty text blank.
