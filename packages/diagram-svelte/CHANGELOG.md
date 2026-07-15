# @oh-just-another/diagram-svelte

## 0.3.0

### Minor Changes

- 0548ab3: Unify the active tool into a single `editor.activeTool` value object (breaking).
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

### Patch Changes

- Updated dependencies [0548ab3]
- Updated dependencies [762dd8a]
- Updated dependencies [05707ed]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
  - @oh-just-another/diagram@0.2.0
  - @oh-just-another/scene@0.61.0

## 0.2.0

### Minor Changes

- c6ca4d4: First published release — Svelte 5 `<Diagram>` component wrapping the `<oja-diagram>` custom element.

### Patch Changes

- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [bdc847e]
- Updated dependencies [a9558d9]
- Updated dependencies [cf8b735]
  - @oh-just-another/scene@0.60.0
  - @oh-just-another/diagram@0.1.1
