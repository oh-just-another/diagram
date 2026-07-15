---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Editable width for committed brush strokes. `style.strokeWidth` never
affected brushes (their widths are baked per point), so the property panel's
Thin/Medium/Thick control silently did nothing for them. A brush-only
selection now gets a popover range slider driving the new
`Editor.setBrushWidth(ids, width)`, which scales every baked point width by
`newWidth / baseWidth` — the stroke keeps its exact pressure profile at the
new thickness — and records the new `baseWidth`. Legacy strokes without a
recorded base fall back to their widest point. One undo step.
