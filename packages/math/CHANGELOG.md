# @oh-just-another/math

## 0.58.0

### Minor Changes

- 3152317: The single-shape selection box now turns with the element: its outline, resize
  handles and rotate grip are drawn on an oriented frame that hugs the rotated
  body instead of its axis-aligned bounding box, and handle hit-testing inverse-
  rotates the cursor into the frame so grabs stay precise. The rotate grip moved
  from above the top edge to the bottom-left corner, just outside the shape.

  Its placement is now defined per element type as an `AnchorRef` — the same
  vocabulary that positions a shape's custom connection points — via the new
  `registerRotateAnchor(type, anchor)` / `getRotateAnchor(type)` API (default:
  the bottom-left corner). Groups and multi-selections keep their axis-aligned
  box, with the grip likewise at the bottom-left corner.

  New math helper `vec2.rotateAround(point, pivot, radians)`.

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/types@0.57.0
