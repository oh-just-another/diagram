import { registerMigration } from "./migrations.js";

/**
 * v1 → v2: the viewport's `gridSize` (spacing, doubling as a hidden/shown
 * toggle) becomes an explicit `gridEnabled` flag. A positive spacing meant the
 * grid was shown; spacing is now fixed, so only the on/off state carries over.
 */
const migrateV1toV2 = (doc: unknown): unknown => {
  const d = doc as { viewport?: Record<string, unknown> };
  const viewport: Record<string, unknown> = { ...(d.viewport ?? {}) };
  const gridSize = viewport.gridSize;
  delete viewport.gridSize;
  viewport.gridEnabled = typeof gridSize === "number" && gridSize > 0;
  return { ...d, version: 2, viewport };
};

registerMigration(1, migrateV1toV2);
