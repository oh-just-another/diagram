# @oh-just-another/diagram-angular

## 0.3.3

### Patch Changes

- @oh-just-another/diagram@0.3.2

## 0.3.2

### Patch Changes

- Updated dependencies [e66a8a5]
- Updated dependencies [06a0625]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [2e2a9e7]
- Updated dependencies [350c6d3]
- Updated dependencies [745d7a9]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [8163681]
  - @oh-just-another/scene@0.62.0
  - @oh-just-another/diagram@0.3.1

## 0.3.1

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/diagram@0.3.0

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

- ddb2fcb: First published release — Angular standalone `<oja-diagram-ng>` component wrapping the `<oja-diagram>` custom element.

### Patch Changes

- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [bdc847e]
- Updated dependencies [a9558d9]
- Updated dependencies [cf8b735]
  - @oh-just-another/scene@0.60.0
  - @oh-just-another/diagram@0.1.1
