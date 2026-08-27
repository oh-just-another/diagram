import type { ElementId, FileId, LayerId, LinkId, Vec2 } from "@oh-just-another/types";
import { bounds as B } from "@oh-just-another/math";
import {
  addElement,
  addLink,
  batch,
  createBinaryFile,
  getElementWorldBounds,
  isImage,
  orderForTop,
  type Element,
  type Link,
  type LinkEndpoint,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";

/**
 * Decode a `data:<mime>;base64,…` URL into bytes. `null` for anything else
 * (blob: / http: URLs stay as they are).
 */
const dataUrlToBytes = (url: string): { mime: string; data: ArrayBuffer } | null => {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!m) return null;
  const [, mime = "application/octet-stream", b64 = ""] = m;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime, data: bytes.buffer };
  } catch {
    return null;
  }
};
import type { HistoryProvider } from "@oh-just-another/history";
import { cloneElementForClipboard } from "./clipboard.js";

export interface InsertSceneResult {
  readonly scene: Scene;
  /** Ids of the inserted top-level + nested elements (fragment order). */
  readonly newIds: readonly ElementId[];
}

/**
 * Merge a whole scene fragment (an imported diagram: elements, their
 * links, their binary files) into `scene` as ONE history record, with the
 * fragment's centre landing at `target` (or its original position when
 * `target` is null). Every element and link gets a fresh id; `parentId`
 * and link endpoints are remapped, free link points are offset with the
 * fragment; everything lands on `layerId`. Links whose endpoint element is
 * missing from the fragment are dropped.
 */
export const insertSceneFragment = (
  scene: Scene,
  history: HistoryProvider,
  fragment: Scene,
  target: Vec2 | null,
  layerId: LayerId,
  genElementId: () => ElementId,
  genLinkId: () => LinkId,
  genFileId: () => FileId,
): InsertSceneResult => {
  const elements = [...fragment.elements.values()];
  if (elements.length === 0) return { scene, newIds: [] };

  // Offset: fragment bounds (top-level elements) centred on `target`.
  let box = null as ReturnType<typeof getElementWorldBounds> | null;
  for (const el of elements) {
    if (el.parentId !== undefined) continue;
    const b = getElementWorldBounds(el);
    box = box ? B.union(box, b) : b;
  }
  const delta =
    target && box
      ? { x: target.x - (box.x + box.width / 2), y: target.y - (box.y + box.height / 2) }
      : { x: 0, y: 0 };

  const idMap = new Map<ElementId, ElementId>();
  for (const el of elements) idMap.set(el.id, genElementId());

  const patches: Patch[] = [];
  const newIds: ElementId[] = [];
  let next = scene;
  // Parents before children: `addElement` needs the parent to exist.
  const pending = new Set(elements);
  while (pending.size > 0) {
    let progressed = false;
    for (const el of pending) {
      const parent = el.parentId;
      const parentEl = parent !== undefined ? fragment.elements.get(parent) : undefined;
      if (parentEl !== undefined && pending.has(parentEl)) continue; // parent still pending
      pending.delete(el);
      progressed = true;
      const newId = idMap.get(el.id);
      if (newId === undefined) continue;
      const remappedParent = parent !== undefined ? idMap.get(parent) : undefined;
      const { parentId: _p, ...rest } = cloneElementForClipboard(el);
      // Importers hand images over as inline data URLs; persist the bytes as
      // a `BinaryFile` (same as a dropped image) so the shape survives a
      // reload and the static-image rehydration can decode a live handle.
      let fileId: FileId | undefined;
      if (isImage(el) && el.fileId === undefined) {
        const bytes = dataUrlToBytes(el.src);
        if (bytes) {
          fileId = genFileId();
          const file = createBinaryFile(fileId, bytes.data, { mime: bytes.mime });
          const files = new Map(next.files);
          files.set(fileId, file);
          next = { ...next, files };
          patches.push({ kind: "file", id: fileId, before: null, after: file });
        }
      }
      const clone = {
        ...rest,
        id: newId,
        layerId,
        ...(fileId !== undefined ? { fileId } : {}),
        ...(remappedParent !== undefined ? { parentId: remappedParent } : {}),
        // Children are positioned in their parent's local space — only the
        // top level moves with the fragment.
        position:
          remappedParent === undefined
            ? { x: el.position.x + delta.x, y: el.position.y + delta.y }
            : el.position,
        order: orderForTop(
          [...next.elements.values()].filter((s) => s.layerId === layerId).map((s) => s.order),
        ),
      } as Element;
      const r = addElement(next, clone);
      next = r.scene;
      patches.push(r.patch);
      newIds.push(newId);
    }
    if (!progressed) break; // orphaned children (parent outside the fragment)
  }

  const remapEndpoint = (ep: LinkEndpoint): LinkEndpoint | null => {
    if (ep.kind === "point") {
      return { ...ep, position: { x: ep.position.x + delta.x, y: ep.position.y + delta.y } };
    }
    const mapped = idMap.get(ep.elementId);
    return mapped === undefined ? null : { ...ep, elementId: mapped };
  };
  for (const link of fragment.links.values()) {
    const from = remapEndpoint(link.from);
    const to = remapEndpoint(link.to);
    if (!from || !to) continue;
    const clone: Link = {
      ...structuredClone(link),
      id: genLinkId(),
      layerId,
      from,
      to,
      ...(link.waypoints
        ? { waypoints: link.waypoints.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })) }
        : {}),
    };
    const r = addLink(next, clone);
    next = r.scene;
    patches.push(r.patch);
  }

  for (const [fileId, file] of fragment.files) {
    if (next.files.has(fileId)) continue;
    const files = new Map(next.files);
    files.set(fileId, file);
    next = { ...next, files };
    patches.push({ kind: "file", id: fileId, before: null, after: file });
  }

  const first = patches[0];
  if (first !== undefined) history.push(patches.length === 1 ? first : batch(patches));
  return { scene: next, newIds };
};
