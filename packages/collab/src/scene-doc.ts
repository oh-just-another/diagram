import * as Y from "yjs";
import {
  DEFAULT_VIEWPORT,
  type Annotation,
  type Link,
  type Layer,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { annotationId, layerId, linkId, elementId } from "@oh-just-another/types";
import { diffMapInto } from "./diff-map.js";

/**
 * CRDT-backed mirror of a `Scene`. Wraps a `Y.Doc` whose top-level maps
 * are the canonical source of truth for collaborative editing:
 *
 *   - `elements` — `Y.Map<string, Element>`
 *   - `links`    — `Y.Map<string, Link>`
 *   - `layers`   — `Y.Map<string, Layer>`
 *   - `viewport` — `Y.Map<string, unknown>` (single "current" key)
 *
 * Elements / links / layers are stored as deep-cloned JSON snapshots — Yjs
 * happily ships any structured-cloneable object. Concurrent edits to
 * different ids merge automatically (last-writer-wins per id, classic
 * Yjs `Y.Map` semantics).
 */
export class SceneDoc {
  readonly doc: Y.Doc;
  readonly elements: Y.Map<Element>;
  readonly links: Y.Map<Link>;
  readonly layers: Y.Map<Layer>;
  readonly annotations: Y.Map<Annotation>;
  readonly viewport: Y.Map<unknown>;

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc;
    this.elements = doc.getMap<Element>("elements");
    this.links = doc.getMap<Link>("links");
    this.layers = doc.getMap<Layer>("layers");
    this.annotations = doc.getMap<Annotation>("annotations");
    this.viewport = doc.getMap<unknown>("viewport");
  }

  /** Build an in-memory `Scene` snapshot from the current CRDT state. */
  snapshot(): Scene {
    const shapeMap = new Map<Element["id"], Element>();
    for (const [id, shape] of this.elements) shapeMap.set(elementId(id), shape);
    const edgeMap = new Map<Link["id"], Link>();
    for (const [id, edge] of this.links) edgeMap.set(linkId(id), edge);
    const layerMap = new Map<Layer["id"], Layer>();
    for (const [id, layer] of this.layers) layerMap.set(layerId(id), layer);

    const vp = this.viewport.get("current");
    const viewport = (vp ?? DEFAULT_VIEWPORT) as Scene["viewport"];

    const annotationMap = new Map<Annotation["id"], Annotation>();
    for (const [id, ann] of this.annotations) annotationMap.set(annotationId(id), ann);

    return {
      elements: shapeMap,
      links: edgeMap,
      layers: layerMap,
      annotations: annotationMap,
      // BinaryFile registry isn't CRDT-replicated (large bytes, awkward
      // through Yjs); hosts that need collab on file uploads keep their
      // own sidecar transport. Snapshot returns an empty map.
      files: new Map(),
      viewport,
    };
  }

  /**
   * Replace the entire CRDT state with the given `Scene`. Wrapped in a
   * single Yjs transaction so peers receive one update message instead of
   * one per shape. Marks the transaction with `origin` so observers can
   * skip the event they themselves caused.
   */
  replace(scene: Scene, origin?: unknown): void {
    this.doc.transact(() => {
      this.elements.clear();
      for (const [id, shape] of scene.elements) this.elements.set(id, shape);
      this.links.clear();
      for (const [id, edge] of scene.links) this.links.set(id, edge);
      this.layers.clear();
      for (const [id, layer] of scene.layers) this.layers.set(id, layer);
      this.annotations.clear();
      for (const [id, ann] of scene.annotations) this.annotations.set(id, ann);
      this.viewport.set("current", scene.viewport);
    }, origin);
  }

  /**
   * Apply only the *delta* between an old scene and a new one. Cheaper
   * over the wire than `replace` when a single shape changes. Used by
   * `bindEditor` to ferry every editor mutation into the CRDT.
   */
  applyDelta(prev: Scene, next: Scene, origin?: unknown): void {
    this.doc.transact(() => {
      diffMapInto(prev.elements, next.elements, this.elements);
      diffMapInto(prev.links, next.links, this.links);
      diffMapInto(prev.layers, next.layers, this.layers);
      diffMapInto(prev.annotations, next.annotations, this.annotations);
      if (prev.viewport !== next.viewport) {
        this.viewport.set("current", next.viewport);
      }
    }, origin);
  }
}
