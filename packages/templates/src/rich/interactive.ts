import type { ShapeBase, TemplateShape as SceneTemplateShape } from "@oh-just-another/scene";
import type { ElementId, Vec2 } from "@oh-just-another/types";
import { resolveBindings } from "./binding.js";
import { fallbackMeasureText, layoutTree } from "./layout.js";
import { defaultRichRegistry } from "./registry.js";
import { interactiveNodeAtPoint } from "./hit-test.js";

/**
 * Emit-shaped payload returned by `templateInteractiveHitTester`. Mirrors the
 * `InteractionEmit` "TEMPLATE_TAP" variant from `@state` without taking a
 * compile-time dependency on it — the host wires both sides together.
 */
export interface TemplateTapPayload {
  readonly type: "TEMPLATE_TAP";
  readonly elementId: ElementId;
  readonly action: string;
  readonly nodeId?: string;
}

/**
 * Host-side helper compatible with `@oh-just-another/state`'s
 * `InteractiveHitTester` signature. Returns a `TEMPLATE_TAP` payload when
 * `localPoint` lands on a `button` node inside the template tree, or `null`
 * otherwise.
 *
 * Wire it up once during app startup:
 *
 * ```ts
 * import { registerInteractiveHitTester } from "@oh-just-another/state";
 * import { rich } from "@oh-just-another/templates";
 *
 * registerInteractiveHitTester("template", rich.templateInteractiveHitTester);
 * ```
 */
export const templateInteractiveHitTester = (
  shape: ShapeBase,
  localPoint: Vec2,
): TemplateTapPayload | null => {
  if (shape.type !== "template") return null;
  const ts = shape as SceneTemplateShape;
  const template = defaultRichRegistry.get(ts.templateId);
  if (!template) return null;
  const root = resolveBindings(template.root, { ...template.defaults, ...ts.data });
  // Same root-size override as the renderer — keeps hit-test coordinates in
  // sync with what the user actually sees after a resize.
  const rootWithSize = {
    ...root,
    layout: { ...(root.layout ?? {}), width: ts.width, height: ts.height },
  };
  const layouted = layoutTree(rootWithSize, {
    measureText: fallbackMeasureText,
    available: { width: ts.width, height: ts.height },
  });
  const hit = interactiveNodeAtPoint(layouted, localPoint);
  if (hit?.node.type !== "button") return null;
  return {
    type: "TEMPLATE_TAP",
    elementId: ts.id,
    action: hit.node.action,
    ...(hit.node.id !== undefined ? { nodeId: hit.node.id } : {}),
  };
};

export interface DropZoneHit {
  readonly elementId: ElementId;
  readonly nodeId: string | undefined;
  /** Whitelist from the drop-zone node. `undefined` = accept anything. */
  readonly accepts: readonly string[] | undefined;
}

/**
 * Find the drop-zone node under `localPoint` for the given template shape.
 * Returns `null` when the point misses every drop-zone (or the shape is not a
 * template). The host uses this from DOM `dragover` / `drop` listeners to
 * decide whether to allow the drop and to construct the `TEMPLATE_DROP`
 * payload.
 */
export const findDropZoneAt = (shape: ShapeBase, localPoint: Vec2): DropZoneHit | null => {
  if (shape.type !== "template") return null;
  const ts = shape as SceneTemplateShape;
  const template = defaultRichRegistry.get(ts.templateId);
  if (!template) return null;
  const root = resolveBindings(template.root, { ...template.defaults, ...ts.data });
  const rootWithSize = {
    ...root,
    layout: { ...(root.layout ?? {}), width: ts.width, height: ts.height },
  };
  const layouted = layoutTree(rootWithSize, {
    measureText: fallbackMeasureText,
    available: { width: ts.width, height: ts.height },
  });
  const hit = interactiveNodeAtPoint(layouted, localPoint);
  if (hit?.node.type !== "drop-zone") return null;
  return {
    elementId: ts.id,
    nodeId: hit.node.id,
    accepts: hit.node.accepts,
  };
};
