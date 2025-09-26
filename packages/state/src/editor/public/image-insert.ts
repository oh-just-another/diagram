import {
  apply,
  createBinaryFile,
  orderForTop,
  type Scene,
  type Element,
  type Patch,
  type BinaryFile,
} from "@oh-just-another/scene";
import type { FileId, LayerId, ElementId, Vec2 } from "@oh-just-another/types";
import { fileId as castFileId } from "@oh-just-another/types";

/**
 * Pure: build the image-shape object for `insertImage`. Caller
 * threads it through `addShape` (which itself goes through
 * `Editor.addShape` to pick up selection + history wiring).
 */
export const buildImageShape = (
  scene: Scene,
  input: {
    src: string;
    width: number;
    height: number;
    position: Vec2;
    image?: HTMLImageElement;
    animated?: boolean;
    fileId?: FileId;
    animationKind?: string;
    animationData?: unknown;
  },
  id: ElementId,
  layerId: LayerId,
): Element => {
  const order = orderForTop(
    Array.from(scene.shapes.values())
      .filter((s) => s.layerId === layerId)
      .map((s) => s.order),
  );
  const metadata: Record<string, unknown> = {};
  if (input.image) metadata.image = input.image;
  if (input.animated) metadata.animated = true;
  return {
    id,
    layerId,
    type: "image",
    position: input.position,
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
    style: {},
    width: input.width,
    height: input.height,
    src: input.src,
    ...(input.fileId ? { fileId: input.fileId } : {}),
    ...(input.animationKind ? { animationKind: input.animationKind } : {}),
    ...(input.animationData !== undefined ? { animationData: input.animationData } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  } as Element;
};

/**
 * Read the blob, register it as a `BinaryFile`, and return the next
 * scene + patch (caller pushes the patch). `nextIdSeed` is the
 * editor's monotonic counter, bumped to produce a fresh `FileId`.
 */
export const computeAddBinaryFile = async (
  scene: Scene,
  blob: Blob,
  name: string | undefined,
  nextIdSeed: () => number,
): Promise<{ readonly scene: Scene; readonly patch: Patch; readonly id: FileId }> => {
  const data = await blob.arrayBuffer();
  const id = castFileId(`file-${nextIdSeed()}-${Date.now().toString(36)}`);
  const file: BinaryFile = createBinaryFile(id, data, {
    mime: blob.type || "application/octet-stream",
    ...(name !== undefined ? { name } : {}),
  });
  const patch: Patch = { kind: "file", id, before: null, after: file };
  return { scene: apply(scene, patch), patch, id };
};

/** True if any shape in the scene carries `metadata.animated`. */
export const hasAnimatedShape = (scene: Scene): boolean => {
  for (const s of scene.shapes.values()) {
    if (s.metadata?.animated === true) return true;
  }
  return false;
};
