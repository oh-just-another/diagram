# @oh-just-another/curve-mesh

[![npm version](https://img.shields.io/npm/v/@oh-just-another/curve-mesh.svg)](https://www.npmjs.com/package/@oh-just-another/curve-mesh)

L1 Loop-Blinn-style quadratic Bezier triangulation for resolution-independent WebGL2 curve rendering. Pure functions — no DOM, no Node API. No runtime dependencies.

Each curve segment becomes a triangle covering the convex hull of its control points; per-vertex `(u, v, w)` coordinates let a fragment shader decide which pixels fall inside the parabola, so curves stay crisp at any zoom without re-tessellation.

## Install

```bash
pnpm add @oh-just-another/curve-mesh
```

## Usage

```ts
import {
  quadraticToTriangle,
  cubicToTriangles,
  packCurveTriangles,
  type CurveTriangle,
} from "@oh-just-another/curve-mesh";

// One quadratic segment p0 → p2 with control p1 (null if colinear):
const tri = quadraticToTriangle({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 });

// A cubic, subdivided into quadratic triangles:
const tris: readonly CurveTriangle[] = cubicToTriangles(
  { x: 0, y: 0 },
  { x: 30, y: 80 },
  { x: 70, y: 80 },
  { x: 100, y: 0 },
);

// Flatten into contiguous Float32Arrays for bufferData(STATIC_DRAW):
const { positions, uvs } = packCurveTriangles(tris);
```

The expected fragment-shader test is `discard if (u*u - v) * w > 0`.

## Exports

| Name                         | Kind     | Notes                                                                                   |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `quadraticToTriangle`        | function | One quadratic Bezier → one `CurveTriangle` (or `null` for a degenerate/colinear curve). |
| `subdivideCubic`             | function | Cubic → array of `(p0, p1, p2)` quadratic triples via mid-point De Casteljau.           |
| `cubicToTriangles`           | function | Cubic → triangle list (drops degenerate sub-quadratics).                                |
| `packCurveTriangles`         | function | Pack triangles into `{ positions, uvs }` Float32Arrays for GPU upload.                  |
| `DEFAULT_CUBIC_SUBDIVISIONS` | const    | Default number of quadratic segments per cubic (8).                                     |
| `Point`, `CurveTriangle`     | type     | 2D point; one GPU-ready triangle (`positions` 6 floats, `uvs` 9 floats).                |
