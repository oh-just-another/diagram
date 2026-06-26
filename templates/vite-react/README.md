# oh-diagram · Vite + React template

A minimal [Vite](https://vite.dev) + React + TypeScript starter that mounts the
diagram editor as a single `<Editor>` component from
[`@oh-just-another/editor`](https://www.npmjs.com/package/@oh-just-another/editor).

## Use it

```bash
# copy this folder out of the repo, then:
npm install
npm run dev
```

Open the printed URL — you get a full-screen editor with the grid and snapping
on, following your OS colour scheme.

## What's wired

- `src/App.tsx` — the `<Editor>` with `theme` / `grid` / `snap` props, an
  imperative `ref` (`EditorAPI`), and `onReady` / `onSceneChange` callbacks.
- `@oh-just-another/react-ui/styles.css` — the chrome stylesheet (toolbar,
  panels, menus, themes). Import it once.

The editor auto-detects the best renderer (WebGL2 / Canvas2D / OffscreenCanvas)
and loads its WASM text-shaping + worker assets via
`new URL(..., import.meta.url)`, which Vite handles with no extra config.

## Persisting scenes

`onSceneChange` hands you the full `Scene`. Serialize it with
[`@oh-just-another/serialization`](https://www.npmjs.com/package/@oh-just-another/serialization)
(`stringifyScene` / `parseScene`, plus `stringifyFiles` / `parseFiles` for image
& GIF bytes) and store it in `localStorage` or on your server.
