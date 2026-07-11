---
"@oh-just-another/state": minor
"@oh-just-another/renderer-core": patch
---

Brush strokes now carry host-controlled paint settings instead of a hard-coded colour. `editor.brushSettings` / `editor.setBrushSettings({ stroke, fill, opacity, width })` set the line colour, enclosed-fill colour (for a future closed-stroke fill), opacity, and base width; a committed stroke bakes them into its style, and the width drives the pressure curve. The brush renderer now paints the line from `style.stroke` (falling back to `style.fill` for strokes authored before the split), so old strokes are unchanged. Fixes the previously hard-coded `#222` brush colour.
