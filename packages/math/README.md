# @oh-just-another/math

Pure 2D geometry — vectors, matrices, bounds, color, intersection.

L0 geometry kernel. Pure functions, no DOM, no Node API, no runtime dependencies. Modules are exported as namespaces:

```ts
import { vec2, matrix, bounds, hitTest, bezier, intersect, color } from "@oh-just-another/math";

const m = matrix.multiply(matrix.translation(10, 20), matrix.rotation(Math.PI / 4));
const p = matrix.applyToPoint(m, { x: 1, y: 0 });
const b = bounds.fromPoints([p, { x: 100, y: 50 }]);
```

## Modules

| Module      | What's inside                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `vec2`      | add/sub/mul/div/negate, dot, cross, length(Sq), distance(Sq), normalize, lerp, angle, rotate, perp, equals (with epsilon).                      |
| `matrix`    | IDENTITY, translation / scaling / rotation, multiply, inverse, applyToPoint, applyToBounds, decompose (TRS), equals.                            |
| `bounds`    | EMPTY, of, fromPoints, fromCenter, centerOf, maxX/maxY, isEmpty, union, intersection(/intersects), contains(Bounds), expand, normalize, equals. |
| `hitTest`   | pointInRect, pointInPolygon (even-odd ray casting), distanceToSegment(Sq), pointOnSegment, pointOnPolyline.                                     |
| `bezier`    | quadraticAt / cubicAt, quadraticBounds / cubicBounds (via extrema), pointOnQuadratic / pointOnCubic, flatten helpers.                           |
| `intersect` | lineLine, segmentSegment, segmentQuadratic (algebraic), segmentCubic (sampled).                                                                 |
| `color`     | parse / format / mix / withAlpha; supports `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, named subset.                            |

Re-exports `RGBA` and `DecomposedTransform` types from the relevant modules.

## Conventions

- All functions are pure — they never mutate inputs.
- `Vec2`, `Bounds`, `Transform` are immutable by convention (no `readonly` enforcement at runtime).
- Epsilon parameters default to `0` (strict). Use a positive epsilon for floating-point tolerance.
- The `pointOn*` Bezier helpers and `segmentCubic` are sampled approximations suited for interactive picking; pixel-precise rendering belongs to the renderer packages.
