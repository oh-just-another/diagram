# @oh-just-another/types

L0 type vocabulary shared across the diagram library: geometric primitives, identifiers and framework-agnostic input events.

No runtime dependencies. The only runtime value is the `shapeId()` cast helper.

## Exports

| Name                                                                                                              | Kind     | Notes                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vec2`, `Point`                                                                                                   | type     | `{ readonly x, y: number }`. `Point` is a `Vec2` alias for API readability.                                                                                                   |
| `Bounds`                                                                                                          | type     | `{ x, y, width, height }`, DOM-style. width/height may be negative; normalization lives in `@oh-just-another/math/bounds`.                                                         |
| `Transform`                                                                                                       | type     | 6-component 2D affine matrix `{ a, b, c, d, e, f }`. Maps `(x, y) → (a·x + c·y + e, b·x + d·y + f)`. Compatible with `CanvasRenderingContext2D.setTransform` and `DOMMatrix`. |
| `Color`                                                                                                           | type     | Plain string. Validation/parsing in `@oh-just-another/math/color`.                                                                                                                 |
| `ShapeId`, `EdgeId`, `LayerId`                                                                                    | type     | Branded `string` IDs. Each is a distinct nominal type — `ShapeId` is not assignable to `EdgeId` and vice versa.                                                               |
| `shapeId()`, `edgeId()`, `layerId()`                                                                              | function | Cast a raw string to the corresponding branded ID. Caller owns uniqueness.                                                                                                    |
| `Modifiers`, `PointerEventData`, `KeyboardEventData`, `WheelEventData`, `PointerKind`, `PointerPhase`, `KeyPhase` | type     | Framework-agnostic input events. No DOM types.                                                                                                                                |

