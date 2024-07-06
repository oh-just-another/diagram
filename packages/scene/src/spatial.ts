import type { Bounds, ShapeId } from "@oh-just-another/types";

/**
 * Uniform-cell spatial index over shape world-AABBs.
 *
 * Cells are addressed by `(cellX, cellY) = (floor(x / cellSize), floor(y / cellSize))`,
 * and a shape's AABB is registered in every cell it overlaps. Range queries
 * iterate the overlapping cells and collect candidates; the caller filters
 * against the precise AABB.
 *
 * Trade-off vs an R-tree: a grid is simpler, has predictable memory, and is
 * very fast for editor-scale scenes (≤ ~10k shapes) where cell count is small
 * and shapes are roughly uniform in size.
 */
export class SpatialGrid {
  /** Cell side length in world units. */
  readonly cellSize: number;

  /** `cellKey(cellX, cellY)` → set of shape ids overlapping the cell. */
  private readonly cells = new Map<string, Set<ShapeId>>();

  /** Reverse index: shape id → cached AABB, used on remove/update. */
  private readonly bounds = new Map<ShapeId, Bounds>();

  constructor(cellSize = 256) {
    if (cellSize <= 0) throw new Error("cellSize must be positive");
    this.cellSize = cellSize;
  }

  /** Number of indexed shapes. */
  get size(): number {
    return this.bounds.size;
  }

  insert(id: ShapeId, b: Bounds): void {
    if (this.bounds.has(id)) {
      throw new Error(`Shape already indexed: ${id}`);
    }
    this.bounds.set(id, b);
    this.eachCell(b, (key) => {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = new Set();
        this.cells.set(key, cell);
      }
      cell.add(id);
    });
  }

  remove(id: ShapeId): void {
    const b = this.bounds.get(id);
    if (!b) return;
    this.bounds.delete(id);
    this.eachCell(b, (key) => {
      const cell = this.cells.get(key);
      if (!cell) return;
      cell.delete(id);
      if (cell.size === 0) this.cells.delete(key);
    });
  }

  update(id: ShapeId, b: Bounds): void {
    this.remove(id);
    this.insert(id, b);
  }

  /**
   * Ids whose AABB overlaps `range`. The returned set is a superset of the
   * true answer — the caller must filter against precise bounds. Order is
   * arbitrary.
   */
  query(range: Bounds): ReadonlySet<ShapeId> {
    const out = new Set<ShapeId>();
    this.eachCell(range, (key) => {
      const cell = this.cells.get(key);
      if (!cell) return;
      for (const id of cell) out.add(id);
    });
    return out;
  }

  /** Drop all entries. */
  clear(): void {
    this.cells.clear();
    this.bounds.clear();
  }

  /** Iterate cell keys that overlap `b`. */
  private eachCell(b: Bounds, fn: (key: string) => void): void {
    const minCx = Math.floor(b.x / this.cellSize);
    const minCy = Math.floor(b.y / this.cellSize);
    const maxCx = Math.floor((b.x + b.width) / this.cellSize);
    const maxCy = Math.floor((b.y + b.height) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        fn(`${cx},${cy}`);
      }
    }
  }
}
