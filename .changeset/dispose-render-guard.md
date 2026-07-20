---
"@oh-just-another/state": patch
"@oh-just-another/renderer-canvas": patch
"@oh-just-another/renderer-core": patch
---

Stop rendering after dispose. Async completions (image decode, font load) resolving after a runtime backend switch could schedule a frame onto disposed targets; on WebGL2 the lazy pipeline rebuild then recompiled shaders on the lost context and threw "Ellipse shader compile failed: null" from a promise chain. `Editor` no longer schedules renders once disposed, and `WebGL2Target` draw calls become no-ops after `dispose()`.

Also make the "skipped a non-drawable image source" warning signal-only: the image element renderer now silently skips shapes whose handle is dead but rehydratable (`fileId` present — the transient first paint after a scene restore), and rehydration itself reports missing `Scene.files` bytes or decode failures. The renderer warning now fires only when an image really will stay blank.
