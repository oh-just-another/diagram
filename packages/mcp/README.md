# @oh-just-another/mcp

MCP (Model Context Protocol) server for LLM agents. Exposes headless scene tools — create, edit, query, render — over stdio. No browser, no network IO.

## Install

```bash
npx @oh-just-another/mcp        # run directly
pnpm add @oh-just-another/mcp   # or install; binary: oja-mcp
pnpm add @resvg/resvg-js        # only needed for export_png
```

Client config (Claude Desktop / Claude Code / any MCP client):

```json
{
  "mcpServers": {
    "oja": { "command": "npx", "args": ["-y", "@oh-just-another/mcp"] }
  }
}
```

## Tools

| Tool                                            | Purpose                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `create_scene`                                  | New empty scene → `sceneId`. Scenes live in process memory for the session.         |
| `load_scene(json)` / `get_scene(sceneId)`       | Serialized scene document in / out (validated, migrated).                           |
| `add_elements(sceneId, elements)`               | Add elements; validated against the scene schema, missing base fields get defaults. |
| `update_element(sceneId, id, patch)`            | Shallow-merge a patch (`style` deep-merged), revalidate.                            |
| `remove_elements(sceneId, ids)`                 | Delete elements by id.                                                              |
| `add_link(sceneId, from, to, routing?, label?)` | Connect two elements with an arrow (`straight` / `orthogonal` / `bezier`).          |
| `query_scene(sceneId)`                          | Compact summary: counts, content bounds, elements with id/type/text.                |
| `export_svg(sceneId)`                           | SVG string.                                                                         |
| `export_png(sceneId, scale?)`                   | Base64 PNG. Requires optional peer `@resvg/resvg-js`; clear error when missing.     |
| `import_mermaid(text)`                          | Mermaid flowchart → new scene → `sceneId`.                                          |
| `get_scene_schema`                              | JSON Schema of the serialized scene document.                                       |

## Programmatic use

```ts
import { createMcpServer, SceneStore } from "@oh-just-another/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

await createMcpServer(new SceneStore()).connect(new StdioServerTransport());
```

Tool handlers (`createScene`, `addElements`, `queryScene`, …) are exported and callable directly against a `SceneStore` — no transport needed, useful for tests and embedding.
