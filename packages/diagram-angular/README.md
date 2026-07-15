# @oh-just-another/diagram-angular

Angular wrapper for the diagram editor — a thin standalone `<oja-diagram-ng>` component over the framework-neutral [`<oja-diagram>`](../diagram) custom element. The editor (canvas, WASM text shaping, workers, React internals) is bundled inside the custom element; this package just maps Angular inputs / outputs to it.

## Install

```bash
pnpm add @oh-just-another/diagram-angular
```

`@angular/core` (>= 17) is a peer dependency.

## Usage

```ts
import { Component, viewChild } from "@angular/core";
import { DiagramComponent } from "@oh-just-another/diagram-angular";
import type { Scene } from "@oh-just-another/scene";

@Component({
  selector: "app-canvas",
  standalone: true,
  imports: [DiagramComponent],
  template: `
    <oja-diagram-ng
      [scene]="scene"
      theme="system"
      [grid]="true"
      [snap]="true"
      (scenechange)="scene = $event"
      (ready)="onReady($event)"
    />
  `,
})
export class CanvasComponent {
  scene?: Scene;
  diagram = viewChild.required(DiagramComponent);

  onReady({ editor }: { editor: unknown }) {
    console.log("editor ready", editor);
  }
}
```

The component fills its parent — give the parent a height.

## Inputs

| Input      | Type                                    | Notes                                |
| ---------- | --------------------------------------- | ------------------------------------ |
| `scene`    | `Scene`                                 | Initial / current scene.             |
| `theme`    | `"dark" \| "light" \| "system"`         | Defaults to following the OS.        |
| `renderer` | `"canvas2d" \| "webgl2" \| "offscreen"` | Backend; auto-detected when omitted. |
| `grid`     | `boolean`                               | Show the background grid.            |
| `snap`     | `boolean`                               | Snap dragged shapes to the grid.     |

## Outputs

`(ready)` (`{ editor }`), `(scenechange)` (`Scene`), `(selectionchange)` (`ElementId[]`), `(themechange)` (`"dark" | "light" | "system"`).

## Imperative API

On the component instance (template reference variable or `viewChild`): `getScene`, `loadScene`, `undo`, `redo`, `zoomToFit`, `getActiveTool`, `setActiveTool`, `getSelection`, `setSelection`.
