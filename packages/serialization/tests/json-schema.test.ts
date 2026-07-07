import { describe, expect, it } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import { sceneJsonSchema } from "../src/json-schema";
import { serializeScene } from "../src/serialize";

interface JsonSchemaObject {
  $schema?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: unknown;
}

describe("sceneJsonSchema", () => {
  it("returns a valid JSON Schema shell", () => {
    const schema = sceneJsonSchema() as JsonSchemaObject;
    expect(schema.$schema).toMatch(/json-schema.org/);
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeTypeOf("object");
  });

  it("describes every top-level document field", () => {
    const schema = sceneJsonSchema() as JsonSchemaObject;
    const props = schema.properties ?? {};
    for (const key of ["format", "version", "elements", "links", "layers", "viewport"]) {
      expect(props, `missing property "${key}"`).toHaveProperty(key);
    }
    expect(schema.required).toEqual(
      expect.arrayContaining(["format", "version", "elements", "links", "layers", "viewport"]),
    );
  });

  it("covers all keys of a serialized scene document", () => {
    const doc = serializeScene(emptyScene());
    const schema = sceneJsonSchema() as JsonSchemaObject;
    const props = schema.properties ?? {};
    for (const key of Object.keys(doc)) {
      expect(props, `serialized key "${key}" not in schema`).toHaveProperty(key);
    }
  });

  it("pins the document format literal", () => {
    const schema = sceneJsonSchema() as JsonSchemaObject;
    const format = (schema.properties ?? {}).format as { const?: string };
    expect(format.const).toBe("oh-just-another/scene");
  });

  it("is JSON-serializable and inline (no $ref)", () => {
    const schema = sceneJsonSchema();
    const text = JSON.stringify(schema);
    expect(text).not.toContain('"$ref"');
    expect(JSON.parse(text)).toEqual(schema);
  });
});
