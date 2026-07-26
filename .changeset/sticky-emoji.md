---
"@oh-just-another/scene": minor
"@oh-just-another/renderer-core": minor
"@oh-just-another/templates": minor
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Sticky notes and emoji elements. New plugin-style scene types: `sticky` (rounded card, background from `style.fill`, text via the shared embedded label with double-click editing, optional author-name strip) and `emoji` (single glyph at a given size). Both render on every backend, serialize through the custom-element schema, and are created from the shape library ("Sticky note" now produces a real sticky; new "Emoji" entry). The selection toolbar gained dedicated branches: sticky — S/M/L size presets, background color/opacity, Show-author toggle; emoji — a glyph picker. New editor APIs: `setStickySize`, `toggleStickyAuthor`, `setEmojiGlyph`.
