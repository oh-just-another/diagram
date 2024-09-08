import type { Patch } from "@oh-just-another/scene";

/**
 * Best-effort short label for a patch, suitable for a history side-panel.
 * The wording is deliberately generic ("Update shape", "Move/resize shape",
 * "Create rectangle") because the kernel does not know enough about user
 * intent to say more. Hosts that want richer labels can attach `metadata` to
 * their shapes and read it here.
 */
export const describe = (patch: Patch): string => {
  switch (patch.kind) {
    case "shape": {
      if (patch.before === null) {
        return labelForCreate(patch.after);
      }
      if (patch.after === null) {
        return labelForRemove(patch.before);
      }
      return labelForUpdate(patch.before, patch.after);
    }
    case "edge": {
      if (patch.before === null) return "Create edge";
      if (patch.after === null) return "Delete edge";
      return "Update edge";
    }
    case "layer": {
      if (patch.before === null) return "Create layer";
      if (patch.after === null) return "Delete layer";
      return "Update layer";
    }
    case "annotation": {
      if (patch.before === null) return "Add comment";
      if (patch.after === null) return "Delete comment";
      return "Update comment";
    }
    case "viewport":
      return "Camera change";
    case "batch": {
      if (patch.patches.length === 0) return "Empty batch";
      if (patch.patches.length === 1) return describe(patch.patches[0]!);
      // If every inner patch describes to the same label, surface it; otherwise
      // give a generic n-count.
      const first = describe(patch.patches[0]!);
      const allSame = patch.patches.every((p) => describe(p) === first);
      return allSame ? `${first} (×${patch.patches.length})` : `${patch.patches.length} changes`;
    }
  }
};

const titleCase = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

const labelForCreate = (shape: { type: string } | null): string =>
  shape ? `Create ${titleCase(shape.type)}` : "Create shape";

const labelForRemove = (shape: { type: string } | null): string =>
  shape ? `Delete ${titleCase(shape.type)}` : "Delete shape";

interface MaybeShape {
  type?: unknown;
  position?: { x: number; y: number };
  rotation?: number;
  scale?: { x: number; y: number };
  width?: number;
  height?: number;
  text?: string;
}

const labelForUpdate = (before: MaybeShape, after: MaybeShape): string => {
  const type = typeof after.type === "string" ? titleCase(after.type) : "shape";
  const positionChanged =
    before.position &&
    after.position &&
    (before.position.x !== after.position.x || before.position.y !== after.position.y);
  const sizeChanged =
    (before.width !== undefined && before.width !== after.width) ||
    (before.height !== undefined && before.height !== after.height);
  const rotationChanged = before.rotation !== after.rotation;
  const scaleChanged =
    before.scale &&
    after.scale &&
    (before.scale.x !== after.scale.x || before.scale.y !== after.scale.y);
  const textChanged = before.text !== after.text;

  if (sizeChanged && positionChanged) return `Resize ${type}`;
  if (sizeChanged) return `Resize ${type}`;
  if (positionChanged) return `Move ${type}`;
  if (rotationChanged) return `Rotate ${type}`;
  if (scaleChanged) return `Scale ${type}`;
  if (textChanged) return `Edit ${type}`;
  return `Update ${type}`;
};
