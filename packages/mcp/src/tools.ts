import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Bounds } from "@oh-just-another/types";
import { elementId, linkId } from "@oh-just-another/types";
import type { Element, Link, LinkRouting, Scene } from "@oh-just-another/scene";
import {
  DEFAULT_LAYER_ID,
  FALLBACK_SCENE_HEIGHT,
  FALLBACK_SCENE_WIDTH,
  addLink,
  emptyScene,
  getElementRenderBounds,
  orderForTop,
  removeElement,
} from "@oh-just-another/scene";
import {
  DeserializationError,
  deserializeScene,
  parseScene,
  sceneJsonSchema,
  serializeScene,
  stringifyScene,
} from "@oh-just-another/serialization";
import { renderToPng, renderToSvg } from "@oh-just-another/headless";
import { importMermaid as importMermaidScene } from "@oh-just-another/importers";
import {
  DEFAULT_ELEMENT_HEIGHT,
  DEFAULT_ELEMENT_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE,
  EXPORT_FIT_MARGIN,
} from "./constants.js";
import { ToolError, type SceneStore } from "./store.js";

/** Raw JSON object as supplied by the MCP client. */
export type RawObject = Record<string, unknown>;

// --- Scene lifecycle ---

/** `create_scene`: register a fresh empty scene, return its id. */
export const createScene = (store: SceneStore): { sceneId: string } => ({
  sceneId: store.add(emptyScene()),
});

/** `load_scene`: parse a serialized scene document (JSON string). */
export const loadScene = (store: SceneStore, json: string): { sceneId: string } => {
  let scene: Scene;
  try {
    scene = parseScene(json);
  } catch (err) {
    throw new ToolError(
      `Could not load scene: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { sceneId: store.add(scene) };
};

/** `get_scene`: serialize the scene back to a JSON string. */
export const getScene = (store: SceneStore, sceneId: string): string =>
  stringifyScene(store.get(sceneId), 2);

/** `import_mermaid`: parse Mermaid source into a new scene. */
export const importMermaid = (store: SceneStore, text: string): { sceneId: string } => {
  let scene: Scene;
  try {
    scene = importMermaidScene(text);
  } catch (err) {
    throw new ToolError(
      `Could not import Mermaid: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (scene.elements.size === 0) {
    throw new ToolError(
      "Could not import Mermaid: no nodes recognized. Supported: flowchart/graph with one statement per line.",
    );
  }
  return { sceneId: store.add(scene) };
};

/** `get_scene_schema`: JSON Schema of the serialized scene document. */
export const getSceneSchema = (): Record<string, unknown> => sceneJsonSchema();

// --- Element / link editing ---

/**
 * Revalidate a mutated serialized document through the one true
 * deserialization path (migrations + zod + hydration), preserving the binary
 * file registry which is not part of the JSON document.
 */
const revalidate = (scene: Scene, doc: RawObject): Scene => {
  try {
    const next = deserializeScene(doc);
    return scene.files.size > 0 ? { ...next, files: scene.files } : next;
  } catch (err) {
    if (err instanceof DeserializationError) {
      throw new ToolError(`Invalid element data: ${err.message}`);
    }
    throw err;
  }
};

/** Fill LLM-friendly defaults so clients only need to supply the essentials. */
const withElementDefaults = (raw: RawObject, order: string): RawObject => {
  const el: RawObject = {
    id: randomUUID(),
    layerId: DEFAULT_LAYER_ID,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
    ...raw,
  };
  const type = el.type;
  if (type === "rectangle" || type === "ellipse" || type === "image") {
    el.width ??= DEFAULT_ELEMENT_WIDTH;
    el.height ??= DEFAULT_ELEMENT_HEIGHT;
  }
  if (type === "text") {
    el.fontFamily ??= DEFAULT_FONT_FAMILY;
    el.fontSize ??= DEFAULT_FONT_SIZE;
  }
  if (el.style === undefined && type !== "group" && type !== "template") {
    el.style = { stroke: DEFAULT_STROKE };
  }
  return el;
};

/**
 * `add_elements`: append elements to the scene. Each element is validated
 * against the serialization schema; missing base fields get sensible defaults.
 */
export const addElements = (
  store: SceneStore,
  sceneId: string,
  elements: readonly RawObject[],
): { ids: string[] } => {
  const scene = store.get(sceneId);
  const orders = [...scene.elements.values()].map((el) => el.order);
  const prepared: RawObject[] = [];
  for (const raw of elements) {
    const order = orderForTop(orders);
    orders.push(order);
    prepared.push(withElementDefaults(raw, order));
  }
  const doc = serializeScene(scene);
  const next = revalidate(scene, { ...doc, elements: [...doc.elements, ...prepared] });
  store.set(sceneId, next);
  return { ids: prepared.map((el) => String(el.id)) };
};

/**
 * `update_element`: shallow-merge a patch into an element (with `style`
 * deep-merged) and revalidate.
 */
export const updateElementTool = (
  store: SceneStore,
  sceneId: string,
  id: string,
  patch: RawObject,
): { id: string } => {
  const scene = store.get(sceneId);
  if (!scene.elements.has(elementId(id))) {
    throw new ToolError(`Element not found: ${id}`);
  }
  const doc = serializeScene(scene);
  const elements = doc.elements.map((el) => {
    if (el.id !== id) return el;
    const merged: RawObject = { ...el, ...patch, id };
    if (isObject(el.style) && isObject(patch.style)) {
      merged.style = { ...el.style, ...patch.style };
    }
    return merged;
  });
  const next = revalidate(scene, { ...doc, elements });
  store.set(sceneId, next);
  return { id };
};

const isObject = (value: unknown): value is RawObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `remove_elements`: delete elements by id. */
export const removeElements = (
  store: SceneStore,
  sceneId: string,
  ids: readonly string[],
): { removed: number } => {
  let scene = store.get(sceneId);
  for (const id of ids) {
    if (!scene.elements.has(elementId(id))) {
      throw new ToolError(`Element not found: ${id}`);
    }
    ({ scene } = removeElement(scene, elementId(id)));
  }
  store.set(sceneId, scene);
  return { removed: ids.length };
};

/** `add_link`: connect two elements with a floating-endpoint link. */
export const addLinkTool = (
  store: SceneStore,
  sceneId: string,
  from: string,
  to: string,
  routing?: LinkRouting,
  label?: string,
): { id: string } => {
  const scene = store.get(sceneId);
  for (const id of [from, to]) {
    if (!scene.elements.has(elementId(id))) {
      throw new ToolError(`Element not found: ${id}`);
    }
  }
  const link: Link = {
    id: linkId(randomUUID()),
    layerId: DEFAULT_LAYER_ID,
    from: { kind: "floating", elementId: elementId(from) },
    to: { kind: "floating", elementId: elementId(to) },
    ...(routing !== undefined ? { routing } : {}),
    ...(label !== undefined ? { label: { text: label } } : {}),
    arrowheads: { to: "arrow" },
    order: orderForTop([...scene.links.values()].map((l) => l.order)),
    style: { stroke: DEFAULT_STROKE },
  };
  const { scene: next } = addLink(scene, link);
  store.set(sceneId, next);
  return { id: link.id };
};

// --- Inspection / export ---

/** Compact scene summary returned by `query_scene`. */
export interface SceneSummary {
  readonly counts: { elements: number; links: number; layers: number };
  readonly bounds: Bounds | null;
  readonly elements: { id: string; type: string; text?: string }[];
  readonly links: { id: string; from: string; to: string; label?: string }[];
}

/** Union of element render bounds, or null for an empty scene. */
const contentBounds = (scene: Scene): Bounds | null => {
  let bounds: Bounds | null = null;
  for (const el of scene.elements.values()) {
    const b = getElementRenderBounds(el);
    bounds =
      bounds === null
        ? b
        : {
            x: Math.min(bounds.x, b.x),
            y: Math.min(bounds.y, b.y),
            width: Math.max(bounds.x + bounds.width, b.x + b.width) - Math.min(bounds.x, b.x),
            height: Math.max(bounds.y + bounds.height, b.y + b.height) - Math.min(bounds.y, b.y),
          };
  }
  return bounds;
};

/**
 * Scenes created via `create_scene` have a zero-sized viewport (no client
 * window exists). Renderers reject a zero-sized SVG, so exports derive the
 * viewport from content bounds plus a margin. Scenes with an explicit
 * viewport (loaded / imported) render as-is.
 */
const withRenderableViewport = (scene: Scene): Scene => {
  const { width, height } = scene.viewport.size;
  if (width > 0 && height > 0) return scene;
  const bounds = contentBounds(scene);
  const size = bounds
    ? {
        width: Math.ceil(bounds.width + Math.max(0, bounds.x)) + EXPORT_FIT_MARGIN,
        height: Math.ceil(bounds.height + Math.max(0, bounds.y)) + EXPORT_FIT_MARGIN,
      }
    : { width: FALLBACK_SCENE_WIDTH, height: FALLBACK_SCENE_HEIGHT };
  return { ...scene, viewport: { ...scene.viewport, size } };
};

const endpointDescription = (endpoint: Link["from"]): string =>
  endpoint.kind === "point"
    ? `point(${String(endpoint.position.x)},${String(endpoint.position.y)})`
    : endpoint.elementId;

/** `query_scene`: counts, content bounds, and a compact element/link listing. */
export const queryScene = (store: SceneStore, sceneId: string): SceneSummary => {
  const scene = store.get(sceneId);
  const bounds = contentBounds(scene);
  const elements = [...scene.elements.values()].map((el: Element) => {
    const text = "text" in el && typeof el.text === "string" ? el.text : undefined;
    return { id: el.id, type: el.type, ...(text !== undefined ? { text } : {}) };
  });
  const links = [...scene.links.values()].map((link) => ({
    id: link.id,
    from: endpointDescription(link.from),
    to: endpointDescription(link.to),
    ...(link.label ? { label: link.label.text } : {}),
  }));
  return {
    counts: { elements: scene.elements.size, links: scene.links.size, layers: scene.layers.size },
    bounds,
    elements,
    links,
  };
};

/** `export_svg`: render the scene to an SVG string. */
export const exportSvg = (store: SceneStore, sceneId: string): string =>
  renderToSvg(withRenderableViewport(store.get(sceneId)));

/**
 * `export_png`: render the scene to a base64-encoded PNG. Requires the
 * optional peer dependency `@resvg/resvg-js`; a clear error is raised when it
 * is not installed.
 */
export const exportPng = async (
  store: SceneStore,
  sceneId: string,
  scale?: number,
): Promise<string> => {
  const scene = withRenderableViewport(store.get(sceneId));
  try {
    const png = await renderToPng(scene, scale !== undefined ? { scale } : {});
    return Buffer.from(png).toString("base64");
  } catch (err) {
    throw new ToolError(err instanceof Error ? err.message : String(err));
  }
};
