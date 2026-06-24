---
"@oh-just-another/vue": minor
"@oh-just-another/svelte": minor
---

New packages: `@oh-just-another/vue` and `@oh-just-another/svelte` — thin framework wrappers over the `<oh-diagram>` custom element. Each exposes a native `<OhDiagram>` component that maps the framework's props to the element's attributes / `scene` property and re-emits its four `CustomEvent`s as framework events (Vue `@scenechange`, Svelte `onscenechange`, …), plus the imperative API (`undo` / `loadScene` / `zoomToFit` / …) through a ref. The editor itself is bundled inside the custom element, so neither wrapper duplicates editor logic — they share the binding helpers from `@oh-just-another/element`. `vue` and `svelte` are peer dependencies.
