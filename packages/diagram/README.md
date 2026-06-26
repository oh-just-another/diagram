# @oh-just-another/diagram

The diagram editor as a framework-neutral custom element — `<oja-diagram>`.

L7 wrapper over `@oh-just-another/editor`. It mounts the React editor inside its own shadow root (styles isolated, floating UI portaled into the same root) and exposes a plain DOM surface — so Vue, Svelte, Angular or a hand-written HTML page all drive it the same way, without touching React. React is bundled in; consumers never install or import it.

## Install

```bash
pnpm add @oh-just-another/diagram
```

## Quick start

With a bundler (Vite, webpack, …):

```ts
import "@oh-just-another/diagram";
```

```html
<oja-diagram grid theme="dark" style="height: 100vh"></oja-diagram>
```

From a CDN, no bundler:

```html
<script
  type="module"
  src="https://unpkg.com/@oh-just-another/diagram/dist/oja-diagram.global.js"
></script>
<oja-diagram grid style="height: 100vh"></oja-diagram>
```

Drive it imperatively:

```ts
const el = document.querySelector("oja-diagram");
el.addEventListener("scenechange", (e) => save(e.detail));
el.addEventListener("ready", () => el.zoomToFit());
el.loadScene(savedScene);
```

## API

| Kind      | Name                                                                  | Notes                                                             |
| --------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Attribute | `theme`                                                               | `dark` \| `light` \| `system`.                                    |
| Attribute | `renderer`                                                            | `canvas2d` \| `webgl2` \| `offscreen`. Omit to auto-detect.       |
| Attribute | `grid` / `snap`                                                       | Boolean — present = on.                                           |
| Property  | `scene`                                                               | A `Scene`. Reading returns the current scene; assigning loads it. |
| Property  | `editor`                                                              | The live engine (`EditorInstance`), or `null` before `ready`.     |
| Method    | `getScene()` / `loadScene(scene)`                                     | Read / replace the scene.                                         |
| Method    | `undo()` / `redo()` / `zoomToFit()`                                   | History and viewport.                                             |
| Method    | `getMode()` / `setMode(mode)`, `getSelection()` / `setSelection(ids)` | Tool mode and selection.                                          |
| Event     | `ready`                                                               | Fires once the editor mounts; `detail.editor` is the live engine. |
| Event     | `scenechange`                                                         | `detail` is the new `Scene`.                                      |
| Event     | `selectionchange`                                                     | `detail` is an array of selected element ids.                     |
| Event     | `themechange`                                                         | `detail` is the new theme.                                        |

`defineOjaDiagram(tag?)` registers the element (the package does this on import); pass a tag name to register under a different name.

## Design notes

- **Shadow root + adopted styles.** The editor mounts in a shadow root so host page styles can't leak in. The react-ui stylesheet is adopted via `adoptedStyleSheets`; floating UI (tooltips, menus, dialogs) portals into a node inside the same root, so it stays styled.
- **React is an implementation detail.** It is bundled and instantiated once inside the element. Framework wrappers built on top of this element are thin — they map their own props/events onto the element's attributes/properties/events.
- **WASM and workers are optional.** The bundled text shaper / rasterizer and the offscreen render worker load on demand and fall back to JS / main-thread rendering when unavailable, so the element runs even when those assets aren't served.
- **Full-quality CDN delivery.** The `./global` build ships the render worker (`dist/render-worker.js`) and the `wasm/` + `fonts/` assets alongside the bundle, reached via `new URL("../wasm/…" | "../fonts/…", import.meta.url)` and `new Worker(new URL("./render-worker.js", import.meta.url))`. A CDN that serves the whole published package (unpkg, jsDelivr) resolves them, so `<script type="module">` users get WASM text-shaping, the bundled fonts and the offscreen worker — not just the JS fallback.
