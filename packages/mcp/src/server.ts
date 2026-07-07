import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { SceneStore, ToolError } from "./store.js";
import {
  addElements,
  addLinkTool,
  createScene,
  exportPng,
  exportSvg,
  getScene,
  getSceneSchema,
  importMermaid,
  loadScene,
  queryScene,
  removeElements,
  updateElementTool,
} from "./tools.js";

interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const text = (value: unknown): ToolResult => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
});

/** Run a handler, converting thrown errors into MCP error results. */
const guard = async (fn: () => unknown): Promise<ToolResult> => {
  try {
    return text(await fn());
  } catch (err) {
    const message = err instanceof ToolError || err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
};

const routingSchema = z.enum(["straight", "orthogonal", "bezier"]);
const rawObjectSchema = z.record(z.string(), z.unknown());

/**
 * Build the MCP server with all scene tools registered. The store is
 * injectable for tests; production entry (`bin.ts`) uses a fresh one.
 */
export const createMcpServer = (store: SceneStore = new SceneStore()): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "create_scene",
    { description: "Create a new empty scene. Returns its sceneId." },
    () => guard(() => createScene(store)),
  );

  server.registerTool(
    "load_scene",
    {
      description: "Load a serialized scene document (JSON string). Returns a new sceneId.",
      inputSchema: { json: z.string().describe("Serialized scene document JSON") },
    },
    ({ json }) => guard(() => loadScene(store, json)),
  );

  server.registerTool(
    "get_scene",
    {
      description: "Get the full serialized scene document as JSON.",
      inputSchema: { sceneId: z.string() },
    },
    ({ sceneId }) => guard(() => getScene(store, sceneId)),
  );

  server.registerTool(
    "add_elements",
    {
      description:
        "Add elements to a scene. Each element needs at least a `type` " +
        "(rectangle | ellipse | polygon | path | text | image | group | brush) " +
        "and typically `position` {x,y}; width/height/style/order default " +
        "sensibly. Call get_scene_schema for the full element schema. " +
        "Returns the assigned element ids.",
      inputSchema: {
        sceneId: z.string(),
        elements: z.array(rawObjectSchema).describe("Elements to add (see get_scene_schema)"),
      },
    },
    ({ sceneId, elements }) => guard(() => addElements(store, sceneId, elements)),
  );

  server.registerTool(
    "update_element",
    {
      description:
        "Update an element by id. `patch` is shallow-merged into the element " +
        "(`style` is deep-merged); the result is validated against the scene schema.",
      inputSchema: { sceneId: z.string(), id: z.string(), patch: rawObjectSchema },
    },
    ({ sceneId, id, patch }) => guard(() => updateElementTool(store, sceneId, id, patch)),
  );

  server.registerTool(
    "remove_elements",
    {
      description: "Remove elements by id.",
      inputSchema: { sceneId: z.string(), ids: z.array(z.string()) },
    },
    ({ sceneId, ids }) => guard(() => removeElements(store, sceneId, ids)),
  );

  server.registerTool(
    "add_link",
    {
      description:
        "Connect two elements with a link (arrow). Routing: straight | " +
        "orthogonal | bezier (default straight). Optional text label.",
      inputSchema: {
        sceneId: z.string(),
        from: z.string().describe("Source element id"),
        to: z.string().describe("Target element id"),
        routing: routingSchema.optional(),
        label: z.string().optional(),
      },
    },
    ({ sceneId, from, to, routing, label }) =>
      guard(() => addLinkTool(store, sceneId, from, to, routing, label)),
  );

  server.registerTool(
    "query_scene",
    {
      description:
        "Compact scene summary: element/link/layer counts, content bounds, " +
        "and elements with id/type/text. Cheaper than get_scene.",
      inputSchema: { sceneId: z.string() },
    },
    ({ sceneId }) => guard(() => queryScene(store, sceneId)),
  );

  server.registerTool(
    "export_svg",
    {
      description: "Render the scene to an SVG string.",
      inputSchema: { sceneId: z.string() },
    },
    ({ sceneId }) => guard(() => exportSvg(store, sceneId)),
  );

  server.registerTool(
    "export_png",
    {
      description:
        "Render the scene to a base64-encoded PNG. Requires the optional " +
        "peer dependency @resvg/resvg-js.",
      inputSchema: { sceneId: z.string(), scale: z.number().positive().optional() },
    },
    ({ sceneId, scale }) => guard(() => exportPng(store, sceneId, scale)),
  );

  server.registerTool(
    "import_mermaid",
    {
      description: "Import a Mermaid flowchart into a new scene. Returns its sceneId.",
      inputSchema: { text: z.string().describe("Mermaid source") },
    },
    ({ text: source }) => guard(() => importMermaid(store, source)),
  );

  server.registerTool(
    "get_scene_schema",
    { description: "JSON Schema of the serialized scene document (elements, links, layers)." },
    () => guard(() => getSceneSchema()),
  );

  return server;
};
