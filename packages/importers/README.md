# @oh-just-another/importers

Convert popular diagram source formats into `@oh-just-another/scene` documents:

- **Mermaid flowchart** — `flowchart TD … A[Start] --> B{Decide}`
- **Graphviz dot** — `digraph G { a -> b }`
- **drawio XML** — the uncompressed `<mxGraphModel>` payload

Layout for graphs without explicit coordinates is computed by `@dagrejs/dagre`. drawio files keep their original positions and skip layout entirely.

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

For other formats use `importDot` / `importDrawio`. If you need the intermediate `GraphDocument` (e.g. to inspect or transform nodes/edges before materialising), call `parseMermaid` / `parseDot` / `parseDrawio` followed by `graphToScene`.

## API

| Name                                                                                                            | Purpose                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `parseMermaid(source)`                                                                                          | Mermaid → `GraphDocument`.                                                                          |
| `parseDot(source)`                                                                                              | Graphviz dot → `GraphDocument`.                                                                     |
| `parseDrawio(source)`                                                                                           | drawio XML → `GraphDocument` (positions preserved).                                                 |
| `graphToScene(graph)`                                                                                           | Layout (via dagre) + materialise into `Scene`. Skips layout if every node already has a `position`. |
| `importMermaid` / `importDot` / `importDrawio`                                                                  | Convenience one-shots: parse + `graphToScene` in one call.                                          |
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

## Design notes

- **Two-stage pipeline (parser → `GraphDocument` → `graphToScene`)**. Lets hosts mutate the intermediate model: rename nodes, override shapes, pre-assign colours from a theme, etc. Without this split each importer would have to know about scene internals.
- **dagre for layout**, not WebCola or ELK. Compact (~80 KB), pure JS, no DOM. The trade-off is that orthogonal/spline edge routing isn't available — we emit straight connectors and let the renderer draw them.
- **drawio skips layout entirely** when every node has a `position` — there's no point relaying-out a hand-crafted diagram.
- **Per-format parsers are hand-rolled** (no `mermaid` / `pegjs-dot` / `xmldom` deps). The supported subset is intentionally minimal — hosts needing full fidelity can pre-process with the official tool and hand the output to us as a `GraphDocument`.
- **Each node spawns two elements** (the geometry + a centered text label), not a single composite "labelled node". Keeps `BuiltinElement` open-element semantics intact — labels are normal `text` elements hosts can move / edit independently.

