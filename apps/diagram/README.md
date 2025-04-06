# @oh-just-another/demo

Full-featured React 19 demo of the diagram editor. Builds on `@oh-just-another/react-ui` and showcases every L0–L6 package together.

## Run locally

```bash
pnpm --filter @oh-just-another/demo dev
# open http://localhost:5174
```

Vite aliases workspace packages to their source so changes anywhere in `packages/*` hot-reload without an extra build step.

## Features

| Capability         | How                                                                           |
| ------------------ | ----------------------------------------------------------------------------- |
| Build shapes       | Toolbar (Select / Rectangle / Ellipse) or hotkeys V / R / E                   |
| Drag from palette  | basic / flowchart / custom / rich categories, including rich-template entries |
| Undo / Redo        | Toolbar buttons + ⌘Z / ⌘⇧Z (or ⌘Y)                                            |
| Inspect selection  | Right-side `PropertyPanel`                                                    |
| History timeline   | Far-right history panel with patch labels                                     |
| Save / Load JSON   | Toolbar `Save` (download) / `Load…` (file picker), `@serialization`-validated |
| Autosave           | `localStorage` on every change, restored on next reload                       |
| Export SVG         | Toolbar `Export SVG` via `@renderer-svg`                                      |
| Export PNG         | Toolbar `Export PNG` via browser-native SVG → `<canvas>` rasterisation        |
| Clear scene        | Toolbar `Clear` (with confirm) — wipes scene + history                        |
| Light / Dark theme | Header toggle, follows `prefers-color-scheme`, persists in `localStorage`     |

## Project layout

```
apps/demo
├── index.html                Shell + CSS-vars for the two themes
├── vite.config.ts            Workspace-source aliases + esbuild JSX
└── src
    ├── main.tsx              React root
    ├── App.tsx               Layout, toolbar wiring, autosave, exports
    ├── HistoryPanel.tsx      Reactive view of undo/redo stacks
    ├── templates.ts          One-time template registration (built-ins + custom + rich)
    ├── theme.ts              `useTheme` hook + localStorage persistence
    └── hotkeys.ts            Global keydown listener
```

## Design notes

- **No vanilla JS left.** Old `apps/demo` and `apps/react-playground` were
  collapsed into this single React-based demo. The vanilla source is
  reachable in git history if anyone needs the kernel-only example.
- **PNG export uses the browser, not resvg.** Resvg is a heavyweight wasm
  blob and Node-only; for in-browser rendering we serialise the scene with
  `@renderer-svg`, load it as an `<img>` source, and paint into an
  offscreen `<canvas>`. Saves ~3 MB of bundle.
- **Autosave key `oh-just-another-demo-scene-v2`**, bumped from the vanilla
  demo's `v1` so users with an old broken save don't crash the new app on
  first load. (Old key is left untouched — no migration.)
- **Themes via CSS variables.** Components from `@react-ui` style themselves
  imperatively for now; the demo overrides the panel chrome with `var(--*)`.
  When `@react-ui` grows a theming API we'll drop the inline-style override.
