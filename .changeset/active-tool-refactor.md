---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": minor
"@oh-just-another/diagram": minor
"@oh-just-another/diagram-vue": minor
"@oh-just-another/diagram-svelte": minor
"@oh-just-another/diagram-angular": minor
---

Unify the active tool into a single `editor.activeTool` value object (breaking).

- `state`: `editor.activeTool: ActiveTool` (`{ type, locked, lastActiveTool }`)
  replaces `editor.mode` and `editor.toolLocked`; `setActiveTool(type)` replaces
  `setMode`. `EditorOptions.initialMode` → `initialTool`. The typed `mode` event
  is now `tool` and fires with the `ActiveTool` object on a type switch or a
  lock flip. The action category `"mode"` is now `"tool"`. The vestigial
  `"eyedropper"` mode is removed from `Mode` — colour sampling is armed from
  the colour picker (`beginEyedropperPick`) and never was a toolbar tool.
- `react-ui`: `useMode()` → `useActiveTool(): ActiveTool`;
  `DiagramRoot`/`DiagramCanvas` prop `initialMode` → `initialTool`.
- `editor`: `EditorAPI.getMode/setMode` → `getActiveTool/setActiveTool`;
  `initialMode` prop → `initialTool`; re-exports `ActiveTool`.
- `diagram` (+ vue/svelte/angular wrappers): element methods and controller
  `getMode/setMode` → `getActiveTool/setActiveTool`.

Tool ids are unchanged (`"select"`, `"draw-rect"`, …). There are no visible
behaviour changes — this is an API refactor establishing one source of truth
for "which tool is active".
