import type { Vec2 } from "@oh-just-another/types";
import { getElementWorldBounds, type ElementBase } from "./shape.js";

/**
 * Heading — the cardinal direction an elbow connector exits a shape on
 * (standard model). One of four unit vectors. Used by the orthogonal
 * router to push the endpoint out perpendicular to the shape's edge (the
 * "dongle") before routing, so connectors always leave a box straight.
 */
export type Heading = Readonly<Vec2>;

export const HEADING_RIGHT: Heading = { x: 1, y: 0 };
export const HEADING_DOWN: Heading = { x: 0, y: 1 };
export const HEADING_LEFT: Heading = { x: -1, y: 0 };
export const HEADING_UP: Heading = { x: 0, y: -1 };

/** True for left/right headings (horizontal exit). */
export const headingIsHorizontal = (h: Heading): boolean => h.y === 0;

export const headingsEqual = (a: Heading, b: Heading): boolean => a.x === b.x && a.y === b.y;

/** Opposite heading (reverse direction). */
export const flipHeading = (h: Heading): Heading => ({ x: -h.x || 0, y: -h.y || 0 });

/**
 * Quantise an arbitrary vector to the nearest cardinal heading. Ties on
 * the dominant axis resolve to vertical (matches standard's
 * `vectorToHeading`: `x > |y|` → right, `x <= -|y|` → left, else by y).
 */
export const vectorToHeading = (v: Vec2): Heading => {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  if (v.x > ay) return HEADING_RIGHT;
  if (v.x <= -ay) return HEADING_LEFT;
  if (v.y > ax) return HEADING_DOWN;
  return HEADING_UP;
};

/** Heading from `origin` toward `p`. */
export const headingForPoint = (p: Vec2, origin: Vec2): Heading =>
  vectorToHeading({ x: p.x - origin.x, y: p.y - origin.y });

/**
 * Outward normal of the AABB edge nearest to `p` — the correct exit heading
 * for a point that sits ON the shape outline (floating / outline / ratio
 * anchors). More accurate near corners than {@link headingForPointFromElement}
 * (the cone test there can pick an adjacent side). For a point on the right
 * edge → RIGHT, etc.
 */
export const headingForEdgePoint = (shape: ElementBase, p: Vec2): Heading => {
  const b = getElementWorldBounds(shape);
  const dl = Math.abs(p.x - b.x); // distance to left edge
  const dr = Math.abs(b.x + b.width - p.x); // right
  const dt = Math.abs(p.y - b.y); // top
  const db = Math.abs(b.y + b.height - p.y); // bottom
  const min = Math.min(dl, dr, dt, db);
  if (min === dl) return HEADING_LEFT;
  if (min === dr) return HEADING_RIGHT;
  if (min === dt) return HEADING_UP;
  return HEADING_DOWN;
};

/**
 * Which side of `shape` the world point `p` exits on. Splits the shape's
 * (world-AABB) into four triangular cones from the centre to each corner;
 * the cone `p` falls in decides the heading. A point dead-centre resolves
 * via the centre→p vector. Diamonds/rotated shapes use the AABB.
 */
export const headingForPointFromElement = (shape: ElementBase, p: Vec2): Heading => {
  const b = getElementWorldBounds(shape);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  if (dx === 0 && dy === 0) return HEADING_RIGHT;
  // Compare the point's offset against the box aspect: the diagonals of the
  // AABB split it into top/right/bottom/left cones. `dy/dx` vs `h/w`.
  const w = b.width || 1;
  const h = b.height || 1;
  // Normalise offsets by half-extent so the cone test is a unit-square test.
  const nx = dx / (w / 2);
  const ny = dy / (h / 2);
  if (Math.abs(nx) >= Math.abs(ny)) {
    return nx >= 0 ? HEADING_RIGHT : HEADING_LEFT;
  }
  return ny >= 0 ? HEADING_DOWN : HEADING_UP;
};
