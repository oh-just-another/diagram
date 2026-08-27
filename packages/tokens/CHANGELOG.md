# @oh-just-another/tokens

## 0.58.1

### Patch Changes

- 3f45f83: Chrome surfaces are opaque: `UI_SURFACE.bg` / `--du-ui-bg` drop the 0.95 alpha (`#ffffff` light, `#252525` dark), so toolbars and button groups no longer show the canvas grid through them. `bgSolid` / `--du-ui-bg-solid` now equal `bg`.

## 0.58.0

### Minor Changes

- ac128db: Dark theme now restyles the chrome only — the canvas always stays light. Scene colors are raw hex authored against light paper, so a dark canvas silently broke user content; `UI_SURFACE.dark.canvas` and `--du-canvas-bg` are light in every theme, and the bundled color picker always offers the light element palette. Canvas-drawn chrome (selection, handles, anchors, marquee, badges, minimap frame) is unified on the iris accent (`CANVAS_CHROME_ACCENT`, iris9 — the same accent the DOM chrome uses) instead of the ad-hoc `#1a73e8`/`#2563eb` blues. Undeclared CSS variables and stale accent fallbacks in the stylesheet now resolve to the real theme tokens, so the affected popovers follow the active theme.

## 0.57.0

### Minor Changes

- Version bump just for publishing.
