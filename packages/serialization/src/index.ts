export { CURRENT_VERSION, SceneDocumentZ } from "./schema.js";
export type {
  SceneDocument,
  SerializedElement,
  SerializedLink,
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

// Binary file sidecar serializer (Scene.files persistence).
export {
  serializeFiles,
  stringifyFiles,
  parseFiles,
  type SerializedFilesDocument,
} from "./files.js";
