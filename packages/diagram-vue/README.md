# @oh-just-another/diagram-vue

Vue 3 wrapper for the diagram editor — a thin `<Diagram>` component over the framework-neutral [`<oja-diagram>`](../diagram) custom element. The editor (canvas, WASM text shaping, workers, React internals) is bundled inside the custom element; this package just maps Vue props / events to it.

## Install

```bash
pnpm add @oh-just-another/diagram-vue vue
```

`vue` is a peer dependency.

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Diagram } from "@oh-just-another/diagram-vue";
import type { Scene } from "@oh-just-another/scene";

const scene = ref<Scene>();
const diagram = ref<InstanceType<typeof Diagram>>();

function save() {
  scene.value = diagram.value?.getScene();
}
</script>

<template>
  <Diagram
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
pnpm --filter @oh-just-another/diagram-vue dev   # example harness
```
