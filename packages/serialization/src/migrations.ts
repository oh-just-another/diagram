/**
 * Schema migrations. Each migration upgrades a single major version to the
 * next. They run in order until the document reaches `CURRENT_VERSION`.
 *
 * Migrations operate on the raw, untyped document (the previous version's
 * shape may not match the current zod schema) and return a partially shaped
 * object that the next migration (or the final validator) understands.
 */

/** A migration receives the document at version N and returns it at N+1. */
export type Migration = (doc: unknown) => unknown;

const registry = new Map<number, Migration>();

/** Register a migration from `fromVersion` to `fromVersion + 1`. */
export const registerMigration = (fromVersion: number, migrate: Migration): void => {
  registry.set(fromVersion, migrate);
};

/** Apply migrations starting from `fromVersion` until `toVersion`. */
export const runMigrations = (doc: unknown, fromVersion: number, toVersion: number): unknown => {
  let current = doc;
  for (let v = fromVersion; v < toVersion; v++) {
    const fn = registry.get(v);
    if (!fn) {
      throw new MissingMigrationError(v, toVersion);
    }
    current = fn(current);
  }
  return current;
};

/** Thrown when no migration is registered for an intermediate version. */
export class MissingMigrationError extends Error {
  readonly fromVersion: number;
  readonly toVersion: number;
  constructor(fromVersion: number, toVersion: number) {
    super(
      `No migration registered from v${fromVersion} → v${fromVersion + 1} ` +
        `(target v${toVersion})`,
    );
    this.name = "MissingMigrationError";
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
  }
}

/** Test helper. Not exported from the package index. */
export const __clearMigrations = (): void => {
  registry.clear();
};
