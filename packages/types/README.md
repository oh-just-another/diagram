# @oh-just-another/types

Shared primitive types — ids, vec, bounds, color, transform and input events.

L0 type vocabulary shared across the diagram library: geometric primitives, branded identifiers and framework-agnostic input events.

No runtime dependencies. The only runtime values are the branded-id cast helpers (`elementId()`, `linkId()`, …) and two tiny utilities (`req`, `stripUndefined`).

## Exports

| Name                                                                                                              | Kind     | Notes                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vec2`, `Point`                                                                                                   | type     | `{ readonly x, y: number }`. `Point` is a `Vec2` alias for API readability.                                                                                                   |
| `Bounds`                                                                                                          | type     | `{ x, y, width, height }`, DOM-style. width/height may be negative; normalization lives in `@oh-just-another/math/bounds`.                                                    |
| `Transform`                                                                                                       | type     | 6-component 2D affine matrix `{ a, b, c, d, e, f }`. Maps `(x, y) → (a·x + c·y + e, b·x + d·y + f)`. Compatible with `CanvasRenderingContext2D.setTransform` and `DOMMatrix`. |
| `Color`                                                                                                           | type     | Plain string. Validation/parsing in `@oh-just-another/math/color`.                                                                                                            |
| `ElementId`, `LinkId`, `LayerId`, `AnnotationId`, `CommentId`, `FileId`                                           | type     | Branded `string` IDs. Each is a distinct nominal type — `ElementId` is not assignable to `LinkId` and vice versa.                                                             |
| `elementId()`, `linkId()`, `layerId()`, `annotationId()`, `commentId()`, `fileId()`                               | function | Cast a raw string to the corresponding branded ID. Caller owns uniqueness.                                                                                                    |
| `Modifiers`, `PointerEventData`, `KeyboardEventData`, `WheelEventData`, `PointerKind`, `PointerPhase`, `KeyPhase` | type     | Framework-agnostic input events. No DOM types.                                                                                                                                |
| `req(value)`                                                                                                      | function | Return `value` when defined, else throw — narrows `T \| undefined` to `T`. For unwrapping in-range array / resolved lookups under `noUncheckedIndexedAccess`.                 |
| `stripUndefined(obj)`                                                                                             | function | Shallow-copy an object dropping keys whose value is `undefined` — for building objects under `exactOptionalPropertyTypes`.                                                    |
