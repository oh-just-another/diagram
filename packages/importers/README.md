# @oh-just-another/importers

[![npm version](https://img.shields.io/npm/v/@oh-just-another/importers.svg)](https://www.npmjs.com/package/@oh-just-another/importers)

Convert popular diagram source formats into `@oh-just-another/scene` documents:

- **Mermaid flowchart** — `flowchart TD … A[Start] --> B{Decide}`
- **Graphviz dot** — `digraph G { a -> b }`
- **drawio XML** — the uncompressed `<mxGraphModel>` payload
- **.excalidraw JSON** — import _and_ export (round-trippable)
- **JSON Canvas** — the `.canvas` format from [jsoncanvas.org](https://jsoncanvas.org)

Layout for graphs without explicit coordinates is computed by `@dagrejs/dagre`. drawio, .excalidraw and JSON Canvas files keep their original positions and skip layout entirely.

## Install

```bash
pnpm add @oh-just-another/importers
```

`@dagrejs/dagre` is a direct dependency (pure JS, ~80 KB).

## Quick start

```ts
import { writeFile, readFile } from "node:fs/promises";
import { importMermaid } from "@oh-just-another/importers";
import { stringifyScene } from "@oh-just-another/serialization";

const src = await readFile("flow.mmd", "utf8");
const scene = importMermaid(src);
await writeFile("scene.json", stringifyScene(scene, 2));
```

For other formats use `importDot` / `importDrawio` / `importExcalidraw` / `importJsonCanvas`. If you need the intermediate `GraphDocument` (e.g. to inspect or transform nodes/edges before materialising), call `parseMermaid` / `parseDot` / `parseDrawio` followed by `graphToScene`. The .excalidraw and JSON Canvas importers convert directly to a `Scene` — those formats already carry coordinates and styles, so there is no `GraphDocument` step.

## API

| Name                                                                                                            | Purpose                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `parseMermaid(source)`                                                                                          | Mermaid → `GraphDocument`.                                                                          |
| `parseDot(source)`                                                                                              | Graphviz dot → `GraphDocument`.                                                                     |
| `parseDrawio(source)`                                                                                           | drawio XML → `GraphDocument` (positions preserved).                                                 |
| `graphToScene(graph)`                                                                                           | Layout (via dagre) + materialise into `Scene`. Skips layout if every node already has a `position`. |
| `importMermaid` / `importDot` / `importDrawio`                                                                  | Convenience one-shots: parse + `graphToScene` in one call.                                          |
| `importExcalidraw(json)`                                                                                        | .excalidraw JSON → `Scene` (positions, styles, groups, frames, links preserved).                    |
| `exportExcalidraw(scene)`                                                                                       | `Scene` → .excalidraw JSON string (format version 2).                                               |
| `importJsonCanvas(json)`                                                                                        | JSON Canvas (`.canvas`) → `Scene`.                                                                  |
| `layoutGraph(graph)`                                                                                            | Standalone layout step — returns nodes with `position`/`width`/`height` filled in.                  |
| `GraphDocument`, `GraphNode`, `GraphEdge`, `NodeShape`, `EdgeDirection`, `GraphLayoutDirection`, `LayoutedNode` | Public types.                                                                                       |

## Supported feature subsets

### Mermaid flowchart

- Direction headers: `flowchart TD` / `TB` / `BT` / `LR` / `RL`; `graph` alias.
- Node bracket shapes: `A`, `A[Label]`, `A(Round)`, `A((Circle))`, `A{Decision}`.
- Edges: `-->` (directed), `---` (undirected), `-->|label|` (labelled), chained: `A --> B --> C`.
- Comments (`%%`), `class` / `classDef` / `style` / `subgraph` — silently ignored.

### Graphviz dot

- `digraph` / `graph`, `strict` modifier.
- `rankdir=TB/BT/LR/RL`.
- Edges: `a -> b` (directed) / `a -- b` (undirected). Chains allowed.
- Node attrs: `label`, `shape` (box/rect/rectangle/ellipse/oval/circle/diamond), `fillcolor`, `color`.
- Edge attrs: `label`.
- Comments: `//`, `/* … */`, leading `#`.

### drawio XML

- `<mxCell vertex="1" value="..." style="...">` + `<mxGeometry x y width height>`.
- `<mxCell edge="1" source="..." target="..." value="...">` (label decoded from HTML entities).
- Shape inferred from `style`: `ellipse`, `rhombus`/`diamond`, `rounded=1` → round, else rectangle.
- Subgraphs, groups, swimlanes, custom mxgraph shapes, splines, fonts — **not** supported.

### .excalidraw (import)

- `rectangle` / `ellipse` → the matching built-in shape; `diamond` → 4-point `polygon`; closed `line` → `polygon`.
- `text` → `text` element (colour, size, alignment, monospace family preserved).
- `freedraw` → `brush` element; per-point `pressures` become variable stroke widths.
- `image` → `image` element (data URL resolved from the document's `files`).
- `frame` → `frame` element; children keep frame membership.
- `arrow` / open `line` → `Link` with `straight` routing: bound ends become `center`-anchor endpoints, free ends point endpoints, interior points waypoints; arrowheads mapped.
- Centre-based `angle` converted to our origin-based `rotation` (silhouettes coincide).
- **Limitations:** nested groups are flattened to the outermost group; embeds / iframes / mermaid-plugin elements and images without embedded data are skipped; hachure / cross-hatch fills import as solid.

### .excalidraw (export)

- `rectangle` / `ellipse` / `frame` / `text` / `image` (data-URL sources) → the matching element type.
- `polygon` → `diamond` when its 4 points sit on the bbox edge midpoints, otherwise a closed `line`.
- `brush` → `freedraw` with per-point pressures; one level of group membership → `groupIds`.
- `Link` → `arrow`; anchored ends become bindings (+ `boundElements` back-refs), waypoints interior points.
- **Not carried over:** `template`, `block-arrow`, `path` and plugin shapes, hidden elements, images with external URLs, link labels; orthogonal / bezier routing flattens to point sequences.

### JSON Canvas

- `text` node → `text` element (raw Markdown, node width as wrap budget); `file` / `link` nodes → `text` element showing the path / URL (`link` gets `href`).
- `group` node → `frame` element (label → name).
- Edges → `Link` with `straight` routing; `fromSide` / `toSide` → named anchors, `label` → link label, `toEnd` defaults to an arrow per the spec.
- Preset colours `"1"`–`"6"` map to hex; hex colours pass through.

## Design notes

- **Two-stage pipeline (parser → `GraphDocument` → `graphToScene`)**. Lets hosts mutate the intermediate model: rename nodes, override shapes, pre-assign colours from a theme, etc. Without this split each importer would have to know about scene internals.
- **dagre for layout**, not WebCola or ELK. Compact (~80 KB), pure JS, no DOM. The trade-off is that orthogonal/spline edge routing isn't available — we emit straight connectors and let the renderer draw them.
- **drawio skips layout entirely** when every node has a `position` — there's no point relaying-out a hand-crafted diagram.
- **Per-format parsers are hand-rolled** (no `mermaid` / `pegjs-dot` / `xmldom` deps). The supported subset is intentionally minimal — hosts needing full fidelity can pre-process with the official tool and hand the output to us as a `GraphDocument`.
- **Each node spawns two elements** (the geometry + a centered text label), not a single composite "labelled node". Keeps `BuiltinElement` open-element semantics intact — labels are normal `text` elements hosts can move / edit independently.
