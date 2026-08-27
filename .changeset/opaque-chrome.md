---
"@oh-just-another/tokens": patch
"@oh-just-another/react-ui": patch
---

Chrome surfaces are opaque: `UI_SURFACE.bg` / `--du-ui-bg` drop the 0.95 alpha (`#ffffff` light, `#252525` dark), so toolbars and button groups no longer show the canvas grid through them. `bgSolid` / `--du-ui-bg-solid` now equal `bg`.
