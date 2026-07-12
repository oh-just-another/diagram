---
"@oh-just-another/renderer-core": minor
---

Adaptive elbow corner rounding: the per-corner radius is now
`min(LINK_CORNER_RADIUS, LINK_CORNER_RADIUS_FRACTION × shorter adjacent
segment)` — long knees round generously (max raised 10 → 16 world px), short
jogs round proportionally smaller, and two corners sharing a short segment can
never overlap. Both tunables live in `constants.ts`.
