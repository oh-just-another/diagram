/**
 * 2D affine transform matrix in column-major form:
 *
 *     | a c e |
 *     | b d f |
 *     | 0 0 1 |
 *
 * Maps point (x, y) to (a*x + c*y + e, b*x + d*y + f).
 * Compatible with CanvasRenderingContext2D.setTransform(a, b, c, d, e, f)
 * and DOMMatrix.
 *
 * Operations live in @oh-just-another/math/matrix.
 */
export interface Transform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}
