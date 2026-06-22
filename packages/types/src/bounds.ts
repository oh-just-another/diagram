/**
 * Axis-aligned bounding box in DOM/Canvas style (top-left + size).
 * width/height may be negative for in-progress drags.
 */
export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
