import type { AnnotationId, CommentId, ShapeId, Vec2 } from "@oh-just-another/types";

/**
 * Threaded comment inside an annotation. `body` is plain text — host can
 * render mentions / markdown / etc. on top. `createdAt` is an ISO-8601
 * string for serialization stability across timezones.
 */
export interface Comment {
  readonly id: CommentId;
  readonly authorId: string;
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
}

/**
 * Pin + comment thread anchored either to a free world-space position
 * or to a specific shape. When `shapeId` is set, the position is
 * resolved as `shape.position + offset`; if the shape moves, the pin
 * follows it. `position` is the world-space (or local-to-shape when
 * `shapeId` is set) offset.
 *
 * `resolved` is a UI-only flag: marks the thread as closed. Doesn't
 * delete history.
 */
export interface Annotation {
  readonly id: AnnotationId;
  readonly shapeId: ShapeId | null;
  readonly position: Vec2;
  readonly resolved: boolean;
  readonly thread: readonly Comment[];
  readonly createdAt: string;
}
