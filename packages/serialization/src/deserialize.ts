import {
  annotationId,
  type AnnotationId,
  commentId,
  type EdgeId,
  edgeId,
  type LayerId,
  layerId,
  shapeId,
  type ShapeId,
} from "@oh-just-another/types";
import type { Annotation, Edge, Layer, Scene, Shape, Viewport } from "@oh-just-another/scene";
import { type FractionalIndex } from "fractional-keys";
import { z } from "zod";
import { CURRENT_VERSION, type SceneDocument, SceneDocumentZ } from "./schema.js";
import { runMigrations } from "./migrations.js";

/**
 * Error thrown when validation fails. Carries the original `z.ZodError` for
 * field-level inspection.
 */
export class DeserializationError extends Error {
  readonly reason: unknown;
  constructor(message: string, reason: unknown) {
    super(message);
    this.name = "DeserializationError";
    this.reason = reason;
  }
}

export interface DeserializeOptions {
  /**
   * Maximum version this build understands. Documents at a higher version
   * trigger an error. Defaults to `CURRENT_VERSION`.
   */
  readonly maxVersion?: number;
}

/**
 * Parse and validate a raw JS object into a typed `Scene`.
 *
 * Pipeline:
 *   1. peek `version` field
 *   2. run migrations until the doc is at the current version
 *   3. validate with zod
 *   4. hydrate Maps + brand the ids back
 */
export const deserializeScene = (raw: unknown, options: DeserializeOptions = {}): Scene => {
  if (typeof raw !== "object" || raw === null) {
    throw new DeserializationError("Expected an object", raw);
  }
  const versionField = (raw as { version?: unknown }).version;
  const version = typeof versionField === "number" ? versionField : 0;
  const maxVersion = options.maxVersion ?? CURRENT_VERSION;
  if (version > maxVersion) {
    throw new DeserializationError(
      `Document version ${version} is newer than this build understands (${maxVersion}). Upgrade your library.`,
      null,
    );
  }

  const migrated = version === CURRENT_VERSION ? raw : runMigrations(raw, version, CURRENT_VERSION);

  let doc: SceneDocument;
  try {
    doc = SceneDocumentZ.parse(migrated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new DeserializationError(`Invalid scene document: ${err.message}`, err);
    }
    throw err;
  }

  return hydrate(doc);
};

/** Parse from a JSON string. Throws `SyntaxError` on bad JSON. */
export const parseScene = (json: string, options?: DeserializeOptions): Scene =>
  deserializeScene(JSON.parse(json), options);

// --- Internal ---

const hydrate = (doc: SceneDocument): Scene => {
  const shapes = new Map<ShapeId, Shape>();
  for (const s of doc.shapes) {
    const id = shapeId(s.id);
    shapes.set(id, hydrateShape(s, id));
  }

  const edges = new Map<EdgeId, Edge>();
  for (const e of doc.edges) {
    const id = edgeId(e.id);
    edges.set(id, hydrateEdge(e, id));
  }

  const layers = new Map<LayerId, Layer>();
  for (const l of doc.layers) {
    const id = layerId(l.id);
    layers.set(id, {
      id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      order: l.order as FractionalIndex,
    });
  }

  // `doc.viewport` is the zod-parsed shape which carries explicit
  // `undefined`s on optional fields; strip them so `exactOptionalPropertyTypes`
  // is happy with the resulting `Viewport`.
  const viewport: Viewport = stripUndefined(doc.viewport) as Viewport;

  const annotations = new Map<AnnotationId, Annotation>();
  if (doc.annotations) {
    for (const a of doc.annotations) {
      const id = annotationId(a.id);
      annotations.set(id, {
        id,
        shapeId: a.shapeId === null ? null : shapeId(a.shapeId),
        position: a.position,
        resolved: a.resolved,
        thread: a.thread.map((c) => ({
          id: commentId(c.id),
          authorId: c.authorId,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt,
        })),
        createdAt: a.createdAt,
      });
    }
  }

  return { shapes, edges, layers, annotations, files: new Map(), viewport };
};

const hydrateShape = (s: SceneDocument["shapes"][number], id: ShapeId): Shape => {
  // zod's parsed shape carries explicit `undefined`s on optional fields, which
  // `exactOptionalPropertyTypes` rejects. Strip them so the resulting object
  // matches the kernel's strict types.
  const cleaned = stripUndefined(s);
  return {
    ...cleaned,
    id,
    layerId: layerId(s.layerId),
    order: s.order as FractionalIndex,
  } as Shape;
};

const hydrateEdge = (e: SceneDocument["edges"][number], id: EdgeId): Edge => {
  const hydrateEndpoint = (ep: SceneDocument["edges"][number]["from"]): Edge["from"] => {
    if (ep.kind === "anchor" || ep.kind === "outline") {
      return { ...ep, shapeId: shapeId(ep.shapeId) };
    }
    return ep;
  };
  const from = hydrateEndpoint(e.from);
  const to = hydrateEndpoint(e.to);
  const cleaned = stripUndefined(e);
  return {
    ...cleaned,
    id,
    layerId: layerId(e.layerId),
    order: e.order as FractionalIndex,
    from,
    to,
  } as Edge;
};

/** Return a shallow copy of `obj` with all `undefined`-valued keys removed. */
const stripUndefined = <T extends object>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
};
