# @oh-just-another/renderer-core

Level 1 rendering abstraction. Defines a backend-agnostic drawing surface (`RenderTarget`), a registry of `ShapeRenderer` functions, and `renderScene` — the top-level walker that turns a `Scene` into draw calls.

No DOM. Depends only on `@oh-just-another/types`, `@oh-just-another/math`, `@oh-just-another/scene`.

## Concepts

- **`RenderTarget`** — low-level draw surface (paths, style, transform, state stack, text, image, clear). Backends implement it; the contract maps 1:1 to Canvas2D so backends can render with native fidelity.
- **Shape-renderer registry** — `registerShapeRenderer(type, fn)` registers a draw function for a shape type. Each backend ships its own set; plugins register their own for custom types.
- **`renderScene(scene, target, options?)`** — for each visible layer (bottom → top) and each shape (z-order), applies the scene viewport transform, pushes the shape's local TRS, invokes the registered renderer.

## Usage

```ts
import { renderScene, registerShapeRenderer } from "@oh-just-another/renderer-core";

// Backends register draw functions for shape types they understand:
registerShapeRenderer("rectangle", (shape, target) => {
  target.beginPath();
  target.rect(0, 0, shape.width, shape.height);
  if (shape.style.fill) {
    target.setFill(shape.style.fill);
    target.fill();
  }
});

renderScene(scene, canvasTarget);
```

## API

| Name                                                            | Purpose                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `RenderTarget`                                                  | Backend-agnostic drawing surface (interface).                             |
| `LineCap`, `LineJoin`, `TextAlign`, `TextBaseline`, `FillRule`  | Style enums used by `RenderTarget`.                                       |
| `ShapeRenderer<S>`                                              | `(shape, target) => void`. Draws in the shape's _local_ coordinate space. |
| `registerShapeRenderer`, `getShapeRenderer`, `hasShapeRenderer` | Registry CRUD.                                                            |
| `renderScene(scene, target, options?)`                          | Top-level walker. `options.skipClear`, `options.onUnknownShape`.          |
| `LAYER_ORDER`, `LayerName`                                      | Canonical layer names (`background` / `main` / `overlay`).                |

