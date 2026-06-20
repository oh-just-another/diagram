import {
  addAnnotation,
  getAnnotationWorldPosition,
  removeAnnotation,
  updateAnnotation,
  type Annotation,
  type Comment,
  type Scene,
  type Patch,
} from "@oh-just-another/scene";
import type { AnnotationId, CommentId, ElementId, Vec2 } from "@oh-just-another/types";
import {
  annotationId as castAnnotationId,
  commentId as castCommentId,
} from "@oh-just-another/types";
import { ANNOTATION_PIN_HIT_SLOP } from "../../constants.js";

export interface CommentAuthor {
  readonly id: string;
  readonly name: string;
}

/**
 * Build a new annotation plus the patch that adds it. Caller pushes
 * the patch and selects the new id.
 */
export const computeAddAnnotation = (
  scene: Scene,
  opts: {
    position: Vec2;
    elementId?: ElementId | null;
    firstComment?: string;
  },
  author: CommentAuthor,
  uniqueId: (prefix: string) => string,
): { readonly scene: Scene; readonly patch: Patch; readonly id: AnnotationId } => {
  const now = new Date().toISOString();
  const newId = castAnnotationId(uniqueId("ann"));
  const thread: Comment[] = [];
  if (opts.firstComment?.trim()) {
    thread.push({
      id: castCommentId(uniqueId("cmt")),
      authorId: author.id,
      authorName: author.name,
      body: opts.firstComment.trim(),
      createdAt: now,
    });
  }
  const annotation: Annotation = {
    id: newId,
    elementId: opts.elementId ?? null,
    position: opts.position,
    resolved: false,
    thread,
    createdAt: now,
  };
  const result = addAnnotation(scene, annotation);
  return { scene: result.scene, patch: result.patch, id: newId };
};

/** Remove an annotation thread entirely. */
export const computeRemoveAnnotation = (
  scene: Scene,
  id: AnnotationId,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  if (!scene.annotations.has(id)) return null;
  const result = removeAnnotation(scene, id);
  return { scene: result.scene, patch: result.patch };
};

/**
 * Toggle `resolved`. Returns the next scene / patch and the previous
 * value so the caller can announce "reopened" vs "resolved".
 */
export const computeToggleAnnotationResolved = (
  scene: Scene,
  id: AnnotationId,
): {
  readonly scene: Scene;
  readonly patch: Patch;
  readonly wasResolved: boolean;
} | null => {
  const before = scene.annotations.get(id);
  if (!before) return null;
  const result = updateAnnotation(scene, id, (a) => ({ ...a, resolved: !a.resolved }));
  return { scene: result.scene, patch: result.patch, wasResolved: before.resolved };
};

/**
 * Append a reply to a thread. Body is trimmed; empty input is a no-op
 * (returns `null`).
 */
export const computeAddComment = (
  scene: Scene,
  annotationId: AnnotationId,
  body: string,
  author: CommentAuthor,
  uniqueId: (prefix: string) => string,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const trimmed = body.trim();
  if (!trimmed) return null;
  if (!scene.annotations.has(annotationId)) return null;
  const comment: Comment = {
    id: castCommentId(uniqueId("cmt")),
    authorId: author.id,
    authorName: author.name,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  const result = updateAnnotation(scene, annotationId, (a) => ({
    ...a,
    thread: [...a.thread, comment],
  }));
  return { scene: result.scene, patch: result.patch };
};

/** Remove a single comment from a thread. No-op if not found. */
export const computeRemoveComment = (
  scene: Scene,
  annotationId: AnnotationId,
  commentId: CommentId,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const before = scene.annotations.get(annotationId);
  if (!before?.thread.some((c) => c.id === commentId)) return null;
  const result = updateAnnotation(scene, annotationId, (a) => ({
    ...a,
    thread: a.thread.filter((c) => c.id !== commentId),
  }));
  return { scene: result.scene, patch: result.patch };
};

/**
 * Hit-test annotation pins in world coordinates. Returns the topmost
 * annotation whose pin contains the point (within
 * `ANNOTATION_PIN_HIT_SLOP` screen pixels scaled by zoom); last-added
 * wins.
 */
export const hitAnnotation = (scene: Scene, worldPoint: Vec2): AnnotationId | null => {
  const zoom = scene.viewport.zoom;
  const radius = ANNOTATION_PIN_HIT_SLOP / zoom;
  const list = [...scene.annotations.values()];
  for (let i = list.length - 1; i >= 0; i--) {
    const ann = list[i];
    if (ann === undefined) continue;
    const center = getAnnotationWorldPosition(scene, ann);
    const dx = worldPoint.x - center.x;
    const dy = worldPoint.y - center.y;
    if (dx * dx + dy * dy <= radius * radius) return ann.id;
  }
  return null;
};
