export { CURRENT_VERSION, SceneDocumentZ } from "./schema";
export type {
  SceneDocument,
  SerializedShape,
  SerializedEdge,
  SerializedLayer,
  SerializedViewport,
} from "./schema";

export { serializeScene, stringifyScene } from "./serialize";

export {
  deserializeScene,
  parseScene,
  DeserializationError,
  type DeserializeOptions,
} from "./deserialize";

export {
  registerMigration,
  runMigrations,
  MissingMigrationError,
  type Migration,
} from "./migrations";
