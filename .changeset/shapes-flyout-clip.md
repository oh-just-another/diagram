---
"@oh-just-another/react-ui": patch
---

The "Shapes and lines" flyout is portalled to `<body>` and positioned `position: fixed` from the button. It used to render absolutely inside the creation dock, which clips it on coarse-pointer layouts (the dock becomes a scroll container there) — on phones the menu never showed; and the dock's centering `translate` made it the containing block for `fixed`, which offset the menu downward. The flyout also clamps into the viewport and scrolls internally on short (landscape) screens.
