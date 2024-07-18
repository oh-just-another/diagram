# @oh-just-another/templates

L2 palette presets for `@oh-just-another/scene`. A `Template` is a factory for a shape — given a runtime context (id / layer / position / order) it returns a typed `Shape`. Templates have an SVG icon for the palette and live in a registry that the host UI iterates.

Phase 6a covers **simple presets** (one shape per template). Phase 6b will add **rich templates** (nested node-trees with flex-layout, data binding, interactive sub-elements) reusing the same registry + JSON-library entry points.

## Quick start

```ts
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import {
  defaultRegistry,
  installBuiltinTemplates,
  loadTemplateLibrary,
} from "@oh-just-another/templates";

installBuiltinRenderers();
installBuiltinTemplates(); // 12 built-ins under basic + flowchart
loadTemplateLibrary(myLibraryJson); // programmatic .json import

const template = defaultRegistry.get("flowchart.process")!;
const shape = template.factory({
  id: shapeId("my-id"),
  layerId: DEFAULT_LAYER_ID,
  position: { x: 100, y: 100 },
  order: orderForTop([]),
});
editor.addShape(shape);
```

## JSON library format

```json
{
  "format": "oh-just-another/template-library",
  "version": 1,
  "templates": [
    {
      "id": "mylib.cloud",
      "name": "Cloud",
      "category": "custom",
      "icon": "<svg>...</svg>",
      "blueprint": { "type": "polygon", "style": {...}, "points": [...] }
    }
  ]
}
```

- `blueprint` is everything about the shape **except** identity fields (id, layerId, position, rotation, scale, order) — those come from the runtime `TemplateContext`.
- All six built-in shape types are supported in `blueprint` (rectangle / ellipse / polygon / path / text / image).

## API

| Name                                                                                                                | Purpose                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Template`, `TemplateContext`, `Category`, `StandardCategory`                                                       | Core types.                                                                                                   |
| `TemplateRegistry`, `defaultRegistry`                                                                               | In-process registry. `register` / `replace` / `get` / `has` / `list` / `byCategory` / `categories` / `clear`. |
| `BUILTIN_TEMPLATES`, `installBuiltinTemplates(registry?)`                                                           | Built-in basic + flowchart presets.                                                                           |
| `TemplateSpec`, `TemplateLibrarySpec`, `ShapeBlueprint`                                                             | JSON spec types.                                                                                              |
| `templateFromSpec(spec)`                                                                                            | Reconstruct a callable `Template` from a spec.                                                                |
| `parseTemplateLibrary(input)` / `templatesFromLibrary(lib)` / `loadTemplateLibrary(input, registry?, { replace? })` | Programmatic library import. `loadTemplateLibrary` validates + materialises + registers in one call.          |
| `TemplateLibraryError`                                                                                              | Thrown on invalid input. `reason` carries the underlying `ZodError`.                                          |
| `icons.*`                                                                                                           | Inline SVG icons used by the built-ins; re-exportable for custom palettes.                                    |

## Design notes

- **Templates own factories, not shape data.** A factory closes over a static blueprint plus a tiny runtime context. JSON specs serialise the blueprint; the runtime factory is reconstructed on import via `templateFromSpec`.
- **One registry per app.** The `defaultRegistry` singleton is enough for almost every host; advanced cases (multi-tenant editors, plugin sandboxes) build their own `TemplateRegistry`.
- **Built-in icons are inline SVG.** No external image deps; trivially replaceable via `registry.replace({ ...template, icon })`.
- **`category` is `string`.** `"basic"` and `"flowchart"` are conventions surfaced as `StandardCategory`; plugins are free to introduce their own category name.
- **`installBuiltinTemplates()` is explicit.** Same trade-off as `installBuiltinRenderers()` — keeps `sideEffects: false` and gives the host control over what's available.

