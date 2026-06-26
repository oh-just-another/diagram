<script lang="ts">
  // Side effect: registers the <oja-diagram> custom element on import, so a
  // Svelte host never has to call `defineOjaDiagram`.
  import "@oh-just-another/diagram";
  import {
    applyOjaDiagramProps,
    bindOjaDiagramEvents,
    ojaDiagramController,
    type DiagramRenderer,
    type DiagramTheme,
    type OjaDiagramElement,
    type OjaDiagramEventMap,
  } from "@oh-just-another/diagram";
  import type { Scene } from "@oh-just-another/scene";

  interface Props {
    scene?: Scene;
    theme?: DiagramTheme;
    renderer?: DiagramRenderer;
    grid?: boolean;
    snap?: boolean;
    onready?: (detail: OjaDiagramEventMap["ready"]) => void;
    onscenechange?: (detail: OjaDiagramEventMap["scenechange"]) => void;
    onselectionchange?: (detail: OjaDiagramEventMap["selectionchange"]) => void;
    onthemechange?: (detail: OjaDiagramEventMap["themechange"]) => void;
  }

  let {
    scene,
    theme,
    renderer,
    grid = false,
    snap = false,
    onready,
    onscenechange,
    onselectionchange,
    onthemechange,
  }: Props = $props();

  let el = $state<OjaDiagramElement>();

  // Push declarative props onto the element whenever any of them change.
  // `applyOjaDiagramProps` is idempotent, so a single effect covers them all.
  $effect(() => {
    if (el) applyOjaDiagramProps(el, { scene, theme, renderer, grid, snap });
  });

  // Re-emit the element's CustomEvents through the callback props. The effect
  // returns the unbind function, so Svelte tears the listeners down for us.
  $effect(() => {
    if (!el) return;
    return bindOjaDiagramEvents(el, {
      ready: onready,
      scenechange: onscenechange,
      selectionchange: onselectionchange,
      themechange: onthemechange,
    });
  });

  // Imperative surface, reachable through `bind:this`. Reuses the shared
  // controller so the pass-through logic isn't duplicated per framework.
  const api = ojaDiagramController(() => el ?? null);
  export const getScene = api.getScene;
  export const loadScene = api.loadScene;
  export const undo = api.undo;
  export const redo = api.redo;
  export const zoomToFit = api.zoomToFit;
  export const getMode = api.getMode;
  export const setMode = api.setMode;
  export const getSelection = api.getSelection;
  export const setSelection = api.setSelection;
</script>

<oja-diagram bind:this={el} style="display:block;width:100%;height:100%"></oja-diagram>
