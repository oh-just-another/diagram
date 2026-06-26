# @oh-just-another/diagram

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
