# @oh-just-another/editor

[![npm version](https://img.shields.io/npm/v/@oh-just-another/editor.svg)](https://www.npmjs.com/package/@oh-just-another/editor)

Drop-in diagram editor as a single React component. Auto-detects the best
renderer (WebGL2 / Canvas2D / OffscreenCanvas), opt-in WASM text-shaping and
rasterisation, and worker offloading — then exposes one `<Editor>` component
plus a programmatic handle for driving it from code.

The umbrella package (L6): it composes `@oh-just-another/react-ui`,
`@oh-just-another/state`, the renderers, serialization and templates into a
ready-to-mount editor. For lower-level building blocks, depend on those
packages directly.

## Install

```bash
pnpm add @oh-just-another/editor react react-dom
```

`react` / `react-dom` (>=18) are peer dependencies.

## Quick start

```tsx
import { Editor } from "@oh-just-another/editor";
// The chrome (toolbar, panels, menus) is styled by the react-ui stylesheet.
import "@oh-just-another/react-ui/styles.css";

export function App() {
  return <Editor style={{ position: "fixed", inset: 0 }} />;
}
```

> **Theming.** `@oh-just-another/react-ui/styles.css` ships the complete token
> set — light and dark, plus a `prefers-color-scheme` fallback for "system" —
> so the import above is all you need. The editor toggles `data-theme` on its
> own root element (not the global `<html>`, so multiple editors theme
> independently) via the `theme` prop; override any `--du-*` variable in your
> own stylesheet to re-skin.

## Driving it from code

Pass a `ref` to get an imperative handle for programmatic control — undo/redo,
zoom, selection, mutations:

```tsx
import { useRef } from "react";
import { Editor, type EditorAPI } from "@oh-just-another/editor";

function Host() {
  const ref = useRef<EditorAPI>(null);

  const exportScene = () => {
    const scene = ref.current?.getScene();
    // ... persist `scene`
  };

  return <Editor ref={ref} onReady={(editor) => console.log(editor)} />;
}
```

`EditorAPI`:

| Member                                 | Type                        | Notes                                                        |
| -------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `editor`                               | `EditorInstance \| null`    | The full live engine (escape hatch); `null` until `onReady`. |
| `capabilities`                         | `CapabilityProfile \| null` | Resolved renderer / WASM / worker profile.                   |
| `getScene()`                           | `() => Scene`               | Current scene (the seed before the editor exists).           |
| `loadScene(s)`                         | `(scene: Scene) => void`    | Replace the scene (resets undo history).                     |
| `getMode()` / `setMode(m)`             | `Mode`                      | Read / set the active tool mode.                             |
| `getSelection()` / `setSelection(ids)` | `ReadonlySet<ElementId>`    | Read / set the selection.                                    |
| `undo()` / `redo()`                    | `void`                      | History navigation.                                          |
| `zoomToFit()`                          | `void`                      | Fit the scene to the viewport.                               |

Anything not on the handle is reachable through `editor` — the full
`EditorInstance` from `@oh-just-another/state`.

## Props

| Prop                                                                                                                                                                                            | Type                  | Purpose                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `initialScene`                                                                                                                                                                                  | `Scene`               | Seed scene (defaults to empty).                                                         |
| `initialMode`                                                                                                                                                                                   | `Mode`                | Initial tool mode (default `"select"`).                                                 |
| `capabilities`                                                                                                                                                                                  | `CapabilityOverrides` | Force / disable renderer, WASM, workers, tiles.                                         |
| `templates` / `fileDropHandlers` / `layoutKinds` / `animationAdapters`                                                                                                                          | arrays                | Plugins registered on mount.                                                            |
| `onReady` / `onSceneChange` / `onSelectionChange`                                                                                                                                               | callbacks             | Lifecycle + change notifications.                                                       |
| `theme` / `defaultTheme` / `onThemeChange` / `persistTheme`                                                                                                                                     | theme                 | Controlled or self-managed theme; optional `localStorage` persistence.                  |
| `hideTopBar` / `hideBottomBar` / `hideToolbar` / `hideMainMenu` / `hideLibraryButton` / `hideZoomControls` / `hideResetToContent` / `hideHelpButton` / `hideContextMenu` / `hideSelectionPanel` | `boolean`             | Toggle chrome off.                                                                      |
| `renderTopBar{Left,Center,Right}` / `renderBottomBar{Left,Center,Right}` / `renderMainMenuExtras`                                                                                               | `() => ReactNode`     | Inject custom content into the bars / menu.                                             |
| `onImportTemplates`                                                                                                                                                                             | `() => void`          | Library-panel "Import" click.                                                           |
| `repositoryUrl`                                                                                                                                                                                 | `string \| null`      | Help-menu link target; `null` hides it.                                                 |
| `onConfirm` / `onNotify`                                                                                                                                                                        | callbacks             | Override the reset-confirm / error dialogs (default `window.confirm` / `window.alert`). |
| `workerFactory`                                                                                                                                                                                 | `() => Worker`        | Override the offscreen render-worker constructor.                                       |
| `className` / `style`                                                                                                                                                                           | —                     | Applied to the editor root.                                                             |

## Capabilities

`detectCapabilities()` runs once on mount and picks the backend the runtime
supports, collapsing to a concrete `CapabilityProfile`:

- **renderer** — `webgl2` (also chosen when WebGPU is present) → `offscreen`
  (OffscreenCanvas + Worker) → `canvas2d`.
- **wasmText / wasmRaster** — bundled WASM shaper / rasterizer when supported
  (rasterizer only on the WebGL2 path).
- **workers / tiles / touch** — off-thread tiling, large-scene tile cache,
  coarse-pointer modality.

Override any field via the `capabilities` prop (`"auto"` or omit = detect):

```tsx
<Editor capabilities={{ renderer: "canvas2d", wasmText: false }} />
```

## Bundlers & workers

The OffscreenCanvas render worker is constructed with
`new Worker(new URL("./render-worker.js", import.meta.url), { type: "module" })`,
which **Vite, Rollup and webpack 5** detect and bundle automatically. On
bundlers that don't (esbuild, Parcel, no bundler), either:

- pass your own `workerFactory` that resolves the worker the way your bundler
  expects, or
- skip the worker path entirely with `capabilities={{ renderer: "canvas2d" }}`
  (or `webgl2` if available) — the offscreen backend is only one of several.

The worker is an optimisation; the editor renders fine without it.

## Plug-in points

These registries are re-exported from this package, so the editor is the single
import for extending the kernel without forking:

```ts
import { registerBounder, registerElementRenderer } from "@oh-just-another/editor";
```

- `registerBounder` (AABB) + `registerElementRenderer` (draw) — custom element types.
- `registerMigration` — wire-format migrations.
- `registerLayoutKind` / `registerAnimationAdapter` — or pass via the
  `layoutKinds` / `animationAdapters` props.
- `exportSceneToPng` — render the full scene to a PNG `Blob` headlessly.

`Diagram` is a deprecated alias of `Editor`.
