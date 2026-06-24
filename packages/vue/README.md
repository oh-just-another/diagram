# @oh-just-another/vue

Vue 3 wrapper for the diagram editor — a thin `<OhDiagram>` component over the framework-neutral [`<oh-diagram>`](../element) custom element. The editor (canvas, WASM text shaping, workers, React internals) is bundled inside the custom element; this package just maps Vue props / events to it.

## Install

```bash
pnpm add @oh-just-another/vue vue
```

`vue` is a peer dependency.

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import { OhDiagram } from "@oh-just-another/vue";
import type { Scene } from "@oh-just-another/scene";

const scene = ref<Scene>();
const diagram = ref<InstanceType<typeof OhDiagram>>();

function save() {
  scene.value = diagram.value?.getScene();
}
</script>

<template>
  <OhDiagram
    ref="diagram"
    :scene="scene"
    theme="system"
    grid
    snap
    @scenechange="scene = $event"
    @ready="({ editor }) => console.log('editor ready', editor)"
  />
</template>
```

The component fills its parent — give the parent (or the component) a height.

## Props

| Prop       | Type                                    | Notes                                |
| ---------- | --------------------------------------- | ------------------------------------ |
| `scene`    | `Scene`                                 | Initial / current scene.             |
| `theme`    | `"dark" \| "light" \| "system"`         | Defaults to following the OS.        |
| `renderer` | `"canvas2d" \| "webgl2" \| "offscreen"` | Backend; auto-detected when omitted. |
| `grid`     | `boolean`                               | Show the background grid.            |
| `snap`     | `boolean`                               | Snap dragged shapes to the grid.     |

## Events

`@ready` (`{ editor }`), `@scenechange` (`Scene`), `@selectionchange` (`ElementId[]`), `@themechange` (`"dark" | "light" | "system"`).

## Imperative API

Through a template `ref`: `getScene`, `loadScene`, `undo`, `redo`, `zoomToFit`, `getMode`, `setMode`, `getSelection`, `setSelection`.

## Dev

```bash
pnpm --filter @oh-just-another/vue dev   # example harness
```
