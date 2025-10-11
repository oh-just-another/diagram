# @oh-just-another/renderer-core

L1 rendering abstraction. Defines a backend-agnostic drawing surface (`RenderTarget`), a registry of `ElementRenderer` functions, and `renderScene` — the top-level walker that turns a `Scene` into draw calls.

No DOM. Depends only on `@oh-just-another/types`, `@oh-just-another/math`, `@oh-just-another/scene`.

## Concepts

- **`RenderTarget`** — low-level draw surface (paths, style, transform, state stack, text, image, clear). Backends implement it; the contract maps 1:1 to Canvas2D so backends can render with native fidelity.
- **Element-renderer registry** — `registerElementRenderer(type, fn)` registers a draw function for an element type. Each backend ships its own set; plugins register their own for custom types.
- **`renderScene(scene, target, options?)`** — for each visible layer (bottom → top) and each element (z-order), applies the scene viewport transform, pushes the element's local TRS, invokes the registered renderer.

## Usage

```ts
import { renderScene, registerElementRenderer } from "@oh-just-another/renderer-core";

// Backends register draw functions for element types they understand:
registerElementRenderer("rectangle", (element, target) => {
  target.beginPath();
  target.rect(0, 0, element.width, element.height);
  if (element.style.fill) {
    target.setFill(element.style.fill);
    target.fill();
  }
});

renderScene(scene, canvasTarget);
```

## API

| Name                                                                  | Purpose                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `RenderTarget`                                                        | Backend-agnostic drawing surface (interface).                                 |
| `LineCap`, `LineJoin`, `TextAlign`, `TextBaseline`, `FillRule`        | Style enums used by `RenderTarget`.                                           |
| `ElementRenderer<S>`                                                  | `(element, target) => void`. Draws in the element's _local_ coordinate space. |
| `registerElementRenderer`, `getElementRenderer`, `hasElementRenderer` | Registry CRUD.                                                                 |
| `renderScene(scene, target, options?)`                                | Top-level walker. `options.skipClear`, `options.onUnknownElement`.            |
| `LAYER_ORDER`, `LayerName`                                            | Canonical layer names (`background` / `main` / `overlay`).                    |

