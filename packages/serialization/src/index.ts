export { CURRENT_VERSION, SceneDocumentZ } from "./schema.js";
export type {
  SceneDocument,
  SerializedShape,
  SerializedEdge,
  SerializedLayer,
  SerializedViewport,
} from "./schema.js";

export { serializeScene, stringifyScene } from "./serialize.js";

export {
  deserializeScene,
  parseScene,
  DeserializationError,
  type DeserializeOptions,
} from "./deserialize.js";

export {
  registerMigration,
  runMigrations,
  MissingMigrationError,
  type Migration,
} from "./migrations.js";
