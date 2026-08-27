# @oh-just-another/diagram

## 0.3.1

### Patch Changes

- Updated dependencies [f12caa8]
- Updated dependencies [b8f70d6]
- Updated dependencies [c989c1c]
- Updated dependencies [a1ea1b2]
- Updated dependencies [76463dd]
- Updated dependencies [bb08cc6]
- Updated dependencies [c26b729]
- Updated dependencies [ef7a237]
- Updated dependencies [9e12fca]
- Updated dependencies [ab5af20]
- Updated dependencies [2e9c5c5]
- Updated dependencies [66481cd]
- Updated dependencies [2105693]
- Updated dependencies [8233dd1]
- Updated dependencies [e202058]
- Updated dependencies [e66a8a5]
- Updated dependencies [1b80b66]
- Updated dependencies [c25cb4e]
- Updated dependencies [10eac46]
- Updated dependencies [0ed2288]
- Updated dependencies [3e5d81f]
- Updated dependencies [a6fe14d]
- Updated dependencies [06a0625]
- Updated dependencies [b965236]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [2e2a9e7]
- Updated dependencies [ab44aa8]
- Updated dependencies [da647fc]
- Updated dependencies [1a9bf66]
- Updated dependencies [350c6d3]
- Updated dependencies [7318742]
- Updated dependencies [9b3bc01]
- Updated dependencies [129c8b5]
- Updated dependencies [f7cc2c0]
- Updated dependencies [64e97b9]
- Updated dependencies [0a4264b]
- Updated dependencies [b90174d]
- Updated dependencies [58c944b]
- Updated dependencies [6ca5ec9]
- Updated dependencies [5ffb5cc]
- Updated dependencies [3086875]
- Updated dependencies [3f45f83]
- Updated dependencies [26abd0c]
- Updated dependencies [3b994bc]
- Updated dependencies [1bbb5f9]
- Updated dependencies [4df12dd]
- Updated dependencies [b1e08de]
- Updated dependencies [8947a84]
- Updated dependencies [1abaca1]
- Updated dependencies [745d7a9]
- Updated dependencies [67b98bb]
- Updated dependencies [7d15a0c]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [24c33b3]
- Updated dependencies [0767227]
- Updated dependencies [8f8846b]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [ea5c6a3]
- Updated dependencies [c22fb63]
- Updated dependencies [1b806ed]
- Updated dependencies [31ace39]
- Updated dependencies [321c4a3]
- Updated dependencies [8163681]
- Updated dependencies [d8bf8c1]
  - @oh-just-another/react-ui@0.62.0
  - @oh-just-another/editor@0.62.0
  - @oh-just-another/scene@0.62.0

## 0.3.0

### Minor Changes

- ac128db: Dark theme now restyles the chrome only — the canvas always stays light. Scene colors are raw hex authored against light paper, so a dark canvas silently broke user content; `UI_SURFACE.dark.canvas` and `--du-canvas-bg` are light in every theme, and the bundled color picker always offers the light element palette. Canvas-drawn chrome (selection, handles, anchors, marquee, badges, minimap frame) is unified on the iris accent (`CANVAS_CHROME_ACCENT`, iris9 — the same accent the DOM chrome uses) instead of the ad-hoc `#1a73e8`/`#2563eb` blues. Undeclared CSS variables and stale accent fallbacks in the stylesheet now resolve to the real theme tokens, so the affected popovers follow the active theme.

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/react-ui@0.61.0
  - @oh-just-another/editor@0.61.1

## 0.2.0

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
- Updated dependencies [4722388]
- Updated dependencies [05707ed]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
  - @oh-just-another/react-ui@0.60.0
  - @oh-just-another/editor@0.61.0
  - @oh-just-another/scene@0.61.0

## 0.1.1

### Patch Changes

- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [179bad8]
- Updated dependencies [1c4941e]
- Updated dependencies [6d184ad]
- Updated dependencies [2fbc079]
- Updated dependencies [ca48e8a]
- Updated dependencies [bdc847e]
- Updated dependencies [511a22a]
- Updated dependencies [a9558d9]
- Updated dependencies [22b90f9]
- Updated dependencies [dda2e56]
- Updated dependencies [34ddb22]
- Updated dependencies [70a08d8]
- Updated dependencies [bd2e26c]
- Updated dependencies [5d8a282]
- Updated dependencies [71a6c8b]
- Updated dependencies [71a6c8b]
- Updated dependencies [7f69f29]
- Updated dependencies [cf8b735]
  - @oh-just-another/scene@0.60.0
  - @oh-just-another/editor@0.60.0
  - @oh-just-another/react-ui@0.59.0

## 0.1.0

### Minor Changes

- 2e26300: Export framework-agnostic binding helpers for `<oja-diagram>`: `applyOjaDiagramProps` (map declarative props to attributes / the `scene` property), `bindOjaDiagramEvents` (subscribe typed handlers to the four `CustomEvent`s, returns an unbind), and `ojaDiagramController` (a curated imperative pass-through). Plus the shared types `OjaDiagramProps`, `OjaDiagramEventMap`, `OjaDiagramEventHandlers`, `OjaDiagramController`, `DiagramTheme`, `DiagramRenderer`. These are the single implementation the framework wrappers build on, so prop / event binding isn't reimplemented per framework.
- f4e9c74: The `./global` CDN bundle now ships full-quality rendering instead of the JS / main-thread fallback. `build:cdn` emits the offscreen render worker as its own bundle (`dist/render-worker.js`) and copies the WASM (`wasm/`) and font (`fonts/`) assets to the package root, where the editor's `new URL("../wasm/…" | "../fonts/…", import.meta.url)` and `new Worker(new URL("./render-worker.js", import.meta.url))` references resolve at runtime. Serving the whole published package from a CDN (unpkg / jsDelivr) gives `<script type="module">` users WASM text-shaping, the bundled fonts and worker offloading. The assets are listed in `files` so they publish; missing assets still degrade gracefully.
- d44348a: New package: `@oh-just-another/diagram` — the diagram editor as a framework-neutral custom element, `<oja-diagram>`. Mounts the editor in a shadow root with isolated styles, bundles React internally, and exposes attributes / properties / methods / `CustomEvent`s so any framework (or plain HTML) can drive it without React. Ships an ESM entry and a self-contained `./global` bundle for `<script type="module">` / CDN use.

### Patch Changes

- 7217cac: The canvas surface no longer draws a focus ring on a mouse click. The surface
  takes focus on press (so keyboard shortcuts work right after clicking), which
  made it light up with an outline like a focused text input. The ring is now
  gated on `:focus-visible`, so it appears only for keyboard focus (Tab) and never
  for a pointer press.
- 35dd03e: Fix: a `scene` assigned to `<oja-diagram>` before the editor finished mounting was silently dropped — the imperative API didn't exist yet, so the scene was only stashed and the editor seeded from an empty state. It's now applied via the live engine in the `ready` handler, so framework wrappers (and any host) restoring a persisted scene on mount actually see it after a reload instead of an empty canvas.
- 60e315e: Fix the context menu (and any chrome reading the legacy `--menu-*` / `--panel` /
  `--text` aliases) ignoring an explicit app theme. The aliases forward to the
  `--du-*` theme variables via `var()`, but were declared only on `:root` — and a
  `var()` inside a custom property resolves on the element where it's declared. So
  under an OS dark preference the alias baked in `:root`'s dark value and inherited
  that frozen colour straight past a `[data-theme="light"]` override, leaving a
  dark menu on a light app. The aliases are now declared at every theme scope
  (`:root`, `[data-theme="light"]`, `[data-theme="dark"]`) so each re-resolves
  against the scoped `--du-*`.
- Updated dependencies [b4b252b]
- Updated dependencies [1c7cc6c]
- Updated dependencies [7217cac]
- Updated dependencies [578e728]
- Updated dependencies [d20d50a]
- Updated dependencies [86c5b61]
- Updated dependencies [34fc660]
- Updated dependencies [9673846]
- Updated dependencies [60e315e]
- Updated dependencies [09a096c]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
- Updated dependencies [edde5d0]
- Updated dependencies [60e315e]
- Updated dependencies [c5be6e5]
  - @oh-just-another/react-ui@0.58.0
  - @oh-just-another/editor@0.59.0
  - @oh-just-another/scene@0.59.0
