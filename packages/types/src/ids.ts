declare const shapeIdBrand: unique symbol;
declare const edgeIdBrand: unique symbol;
declare const layerIdBrand: unique symbol;
declare const annotationIdBrand: unique symbol;
declare const commentIdBrand: unique symbol;
declare const fileIdBrand: unique symbol;

/**
 * Opaque, stable identifier for a shape.
 * Branded `string` to prevent accidental mixing with other string-shaped IDs.
 */
export type ElementId = string & { readonly [shapeIdBrand]: true };

/** Opaque, stable identifier for an edge. */
export type LinkId = string & { readonly [edgeIdBrand]: true };

/** Opaque, stable identifier for a layer. */
export type LayerId = string & { readonly [layerIdBrand]: true };

/**
 * Cast an arbitrary string to ElementId. The caller is responsible for uniqueness;
 * the type system only guarantees the value flows through ElementId-typed APIs.
 */
export const elementId = (raw: string): ElementId => raw as ElementId;

/** Cast a raw string to LinkId. Caller owns uniqueness. */
export const linkId = (raw: string): LinkId => raw as LinkId;

/** Cast a raw string to LayerId. Caller owns uniqueness. */
export const layerId = (raw: string): LayerId => raw as LayerId;

/** Opaque identifier for an annotation (pin + thread). */
export type AnnotationId = string & { readonly [annotationIdBrand]: true };

/** Cast a raw string to AnnotationId. Caller owns uniqueness. */
export const annotationId = (raw: string): AnnotationId => raw as AnnotationId;

/** Opaque identifier for a single comment inside an annotation thread. */
export type CommentId = string & { readonly [commentIdBrand]: true };

/** Cast a raw string to CommentId. Caller owns uniqueness. */
export const commentId = (raw: string): CommentId => raw as CommentId;

/**
 * Opaque identifier for a binary file in `Scene.files`.
 * `ImageElement.fileId` resolves through this registry instead of embedding
 * `src` directly, so large bitmaps don't bloat the scene JSON. Files are
 * serialised separately (blob-aware transport) and re-attached on load.
 */
export type FileId = string & { readonly [fileIdBrand]: true };

/** Cast a raw string to FileId. Caller owns uniqueness. */
export const fileId = (raw: string): FileId => raw as FileId;
