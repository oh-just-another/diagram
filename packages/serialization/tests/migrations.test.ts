import { afterEach, describe, expect, it } from "vitest";
import { registerMigration, MissingMigrationError, runMigrations } from "../src/index";
// Internal helper for the test sandbox — not exported from the package index.
import { __clearMigrations } from "../src/migrations";

afterEach(() => __clearMigrations());

describe("migrations", () => {
  it("runs registered migrations in order", () => {
    registerMigration(0, (doc) => ({ ...(doc as object), step1: true }));
    registerMigration(1, (doc) => ({ ...(doc as object), step2: true }));
    const result = runMigrations({ from: "v0" }, 0, 2) as Record<string, unknown>;
    expect(result.step1).toBe(true);
    expect(result.step2).toBe(true);
  });

  it("is a no-op when from == to", () => {
    expect(runMigrations({ x: 1 }, 3, 3)).toEqual({ x: 1 });
  });

  it("throws MissingMigrationError for a gap", () => {
    registerMigration(0, (doc) => doc);
    expect(() => runMigrations({}, 0, 2)).toThrow(MissingMigrationError);
  });
});
