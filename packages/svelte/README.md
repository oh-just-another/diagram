# @oh-just-another/svelte

Svelte 5 wrapper for the diagram editor — a thin `<OhDiagram>` component over the framework-neutral [`<oh-diagram>`](../element) custom element. The editor (canvas, WASM text shaping, workers, React internals) is bundled inside the custom element; this package just maps Svelte props / callbacks to it.

## Install

```bash
pnpm add @oh-just-another/svelte svelte
```

`svelte` is a peer dependency (Svelte 5, runes mode).

## Usage

```svelte
<script lang="ts">
  import OhDiagram from "@oh-just-another/svelte";
  import type { Scene } from "@oh-just-another/scene";

  let scene = $state<Scene>();
  let diagram: ReturnType<typeof OhDiagram>;
</script>

<OhDiagram
  bind:this={diagram}
  {scene}
  theme="system"
  grid
  snap
  onscenechange={(next) => (scene = next)}
  onready={({ editor }) => console.log("editor ready", editor)}
/>
```

The component fills its parent — give the parent a height.

## Props

| Prop       | Type                                    | Notes                                |
| ---------- | --------------------------------------- | ------------------------------------ |
| `scene`    | `Scene`                                 | Initial / current scene.             |
| `theme`    | `"dark" \| "light" \| "system"`         | Defaults to following the OS.        |
| `renderer` | `"canvas2d" \| "webgl2" \| "offscreen"` | Backend; auto-detected when omitted. |
| `grid`     | `boolean`                               | Show the background grid.            |
| `snap`     | `boolean`                               | Snap dragged shapes to the grid.     |

## Event callbacks

`onready` (`{ editor }`), `onscenechange` (`Scene`), `onselectionchange` (`ElementId[]`), `onthemechange` (`"dark" | "light" | "system"`).

## Imperative API

Through `bind:this`: `getScene`, `loadScene`, `undo`, `redo`, `zoomToFit`, `getMode`, `setMode`, `getSelection`, `setSelection`.

## Dev

```bash
pnpm --filter @oh-just-another/svelte dev   # example harness
```

> The component ships as `.svelte` source resolved through the package's `svelte` export condition — any Svelte-aware bundler (SvelteKit, `vite-plugin-svelte`) compiles it. There is no pre-built JS step.
