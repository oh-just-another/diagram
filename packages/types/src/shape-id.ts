declare const shapeIdBrand: unique symbol;

/**
 * Opaque, stable identifier for a shape or edge.
 * Branded `string` to prevent accidental mixing with other string-shaped IDs.
 */
export type ShapeId = string & { readonly [shapeIdBrand]: true };

/**
 * Cast an arbitrary string to ShapeId. The caller is responsible for uniqueness;
 * the type system only guarantees the value flows through ShapeId-typed APIs.
 */
export const shapeId = (raw: string): ShapeId => raw as ShapeId;
