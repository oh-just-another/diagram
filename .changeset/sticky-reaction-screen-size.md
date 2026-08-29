---
"@oh-just-another/renderer-core": minor
"@oh-just-another/react-ui": patch
---

Sticky reaction chrome (pills and the "+" button) now hides by on-screen size instead of a fixed zoom: `STICKY_REACTION_MIN_SCREEN_PX` (80 px on the note's shorter side) replaces `STICKY_REACTION_MIN_ZOOM`, and `stickyReactionChromeVisible(shape, zoom)` is exported for hosts. A large note keeps its reactions at a zoom where a small one already hides them; the click-zone overlay follows per note.
