---
"@oh-just-another/editor": minor
"@oh-just-another/react-ui": minor
"@oh-just-another/state": minor
---

Zoom menu: clicking the zoom percentage in the bottom bar opens a view menu — Enter / Exit full screen, Hide / Show minimap (`M`), Grid › (None / Dot grid / Line grid), an Object dimensions switch, Fit to screen and zoom presets (50 % … 2000 %). `Editor.setZoom(level)` sets an absolute zoom about the viewport centre. react-ui adds the `Switch` primitive, the `useFullscreen` hook, and `MainMenu` options `ariaLabel` / `placement` / `triggerClassName` / `triggerStyle` plus `MainMenu.Item` `trailing`. The `minimap` prop now seeds the runtime-toggleable minimap.
