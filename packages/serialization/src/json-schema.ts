import { zodToJsonSchema } from "zod-to-json-schema";
import { SceneDocumentZ } from "./schema.js";

/**
 * Generate a JSON Schema (draft-07) describing the serialized scene document
 * (`SceneDocument`). Derived on the fly from the zod schema, so it always
 * matches the wire format of the current `CURRENT_VERSION`.
 *
 * Useful for LLM structured output, editor autocompletion, and validating
 * scene documents outside this library (e.g. with ajv).
 */
export const sceneJsonSchema = (): Record<string, unknown> =>
  zodToJsonSchema(SceneDocumentZ, {
    $refStrategy: "none",
  });
