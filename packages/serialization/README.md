# @oh-just-another/serialization

L2 wire format for `@oh-just-another/scene`. Validates and round-trips a scene through a versioned JSON document. Pure logic — no DOM, no Node API.

## Quick start

```ts
import { serializeScene, stringifyScene, parseScene } from "@oh-just-another/serialization";

// Save
localStorage.setItem("scene", stringifyScene(editor.scene));

// Load
const scene = parseScene(localStorage.getItem("scene")!);
editor.loadScene(scene);
```

## Wire format

```json
{
  "format": "oh-just-another/scene",
  "version": 1,
  "shapes": [...],
  "edges": [...],
  "layers": [...],
  "viewport": { "pan": {...}, "zoom": 1, "rotation": 0, "size": {...} }
}
```

- **`format`** — magic constant, lets a file be recognized without sniffing.
- **`version`** — incremented on any breaking schema change. Migrations live in `migrations.ts`.
- The shape sub-schema is a `z.discriminatedUnion` over every built-in `type`, plus a `passthrough` arm for plugin-registered types.

## API

| Name                                                                  | Purpose                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CURRENT_VERSION`, `SceneDocument`, `SceneDocumentZ`                  | Wire-format constants and types.                                                                      |
| `serializeScene(scene)` / `stringifyScene(scene, indent?)`            | In-memory `Scene` → wire document / JSON string.                                                      |
| `deserializeScene(raw, options?)` / `parseScene(json, options?)`      | Wire document / JSON string → typed `Scene`. Runs migrations + zod validation + brand re-application. |
| `DeserializationError`                                                | Thrown on validation failure. `reason` carries the original `ZodError`.                               |
| `registerMigration(fromVersion, fn)` / `runMigrations(doc, from, to)` | Forward migrations between schema versions.                                                           |
| `MissingMigrationError`                                               | Thrown when an intermediate version has no migration registered.                                      |

## Design notes

- **One `version` field, forward-only migrations.** No back-migrations — exporting always lands at `CURRENT_VERSION`. Loading an older version walks through every migration in order.
- **Strict schemas with a `passthrough` arm for unknown shape `type`s.** Plugins that register a custom shape can persist it without modifying the wire schema; the kernel just hands the raw object to the bounder/renderer registry on load.
- **Deserialise re-brands ids.** `ShapeId` / `EdgeId` / `LayerId` are branded strings in the kernel but plain strings in JSON; `hydrate` casts them back through `shapeId()` / `edgeId()` / `layerId()`.
- **`exactOptionalPropertyTypes` workaround.** Zod's parsed output exposes optional fields as `T | undefined`, which the kernel rejects. The hydrate path strips `undefined`-valued keys before constructing the typed shape.

