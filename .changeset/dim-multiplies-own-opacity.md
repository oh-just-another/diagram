---
"@oh-just-another/renderer-core": patch
---

Fix `renderScene`'s `dimElements` dim so it applies to shapes that carry their own `style.opacity`. The dim alpha (`dimOpacity`) was set before the shape renderer ran, so a renderer applying the shape's opacity called `setOpacity` absolutely and overwrote the dim — meaning the eraser's "about to delete" fade (and group-isolation dim) silently vanished for any shape with an explicit opacity. Dimmed shapes now draw through a wrapper that multiplies the two: a plain shape stays at `dimOpacity`, one with `opacity` renders at `opacity × dimOpacity` — dimmed and semi-transparent.
