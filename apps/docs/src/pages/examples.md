---
title: Examples
---

# Examples

The same engine in different setups — copy the one that matches your stack.

## Drop-in React editor

```tsx
import { Editor } from "@oh-just-another/editor";
import "@oh-just-another/react-ui/styles.css";

export const App = () => <Editor />;
```

## Configured editor

Granular scene settings merge over the defaults; a persisted scene wins over host config.

```tsx
<Editor grid={{ enabled: true, style: "dots" }} snap theme="dark" initialTool="draw-rect" />
```

## Viewer / embed (trimmed chrome)

```tsx
<Editor hideToolbar theme="system" />
```

Toggle read-only at runtime through the engine: `editor.setReadOnly(true)` (pan/zoom/select keep working, edits are gated).

## Driving the editor from code

```tsx
import { useRef } from "react";
import { Editor, type EditorAPI } from "@oh-just-another/editor";

const ref = useRef<EditorAPI>(null);
// later: ref.current?.setActiveTool("draw-rect");
//        ref.current?.loadScene(scene);
//        ref.current?.editor — the full engine escape hatch
<Editor ref={ref} onSceneChange={(s) => save(s)} />;
```

## No React: the custom element

```html
<script
  type="module"
  src="https://unpkg.com/@oh-just-another/diagram/dist/oja-diagram.global.js"
></script>
<oja-diagram theme="dark" grid snap style="display:block;height:480px"></oja-diagram>
```

The same element powers the Vue / Svelte / Angular wrappers (`@oh-just-another/diagram-vue`, `-svelte`, `-angular`) — props in, `scenechange` / `selectionchange` events out.

## Headless render on a server

No DOM, no browser — a scene JSON string in, SVG/PNG out.

```ts
import { renderToSvg, renderToPng } from "@oh-just-another/headless";

const svg = renderToSvg(sceneJson); // string → string
const png = await renderToPng(sceneJson); // Uint8Array
```

## Text → diagram (importers)

```ts
import { importMermaid } from "@oh-just-another/importers";

const scene = importMermaid("graph LR; A[Start] --> B{OK?}; B -->|yes| C[Ship]");
editor.loadScene(scene);
```

`importDot` (Graphviz) and `importDrawio` work the same way; `exportMermaid` goes back to text.

## Building a scene programmatically

```ts
import { addElement, addLink, emptyScene } from "@oh-just-another/scene";

let { scene } = addElement(emptyScene(), rectangle);
({ scene } = addLink(scene, {
  /* … */
}));
```

Every operation is pure — `(scene) => { scene, patch }` — so the same code runs in the browser, in Node, and inside an agent. See [AI & agents](/docs/sdk-features/driving/ai) for the MCP server built on top of this.

## Realtime collaboration

```ts
import { bindEditor } from "@oh-just-another/collab";
```

Presence, cursors and E2E-encrypted sync over a blind relay you can [self-host in minutes](/docs/sdk-features/collaboration/self-hosting).

---

Full feature reference: [SDK features](/docs/sdk-features/editor/overview) · [Quick start](/docs/introduction/quick-start)
