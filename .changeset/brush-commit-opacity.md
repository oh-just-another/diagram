---
"@oh-just-another/renderer-core": patch
---

Committed brush strokes now honour `style.opacity`. `drawBrush` paints its fills directly rather than through the shared `applyStyle` helper, so it never applied the stroke's opacity — a translucent brush drew opaque once committed, and the opacity seen while drawing vanished on release. It now sets opacity up front (covering both the enclosed-area fill and the body).
