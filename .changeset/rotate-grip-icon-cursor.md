---
"@oh-just-another/state": patch
---

Polish the rotate grip: it now renders as a clockwise circular-arrow glyph (a
`rotate-cw` icon) instead of a plain circle, and the connector line back to the
shape is gone. Hovering the grip shows a `grab` cursor; the cursor switches to
`grabbing` while a rotate gesture is in flight (overridable via the new
`rotate` cursor role).
