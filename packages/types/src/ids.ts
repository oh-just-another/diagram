declare const shapeIdBrand: unique symbol;
declare const edgeIdBrand: unique symbol;
declare const layerIdBrand: unique symbol;

/**
 * Opaque, stable identifier for a shape.
 * Branded `string` to prevent accidental mixing with other string-shaped IDs.
 */
export type ShapeId = string & { readonly [shapeIdBrand]: true };

/** Opaque, stable identifier for an edge. */
export type EdgeId = string & { readonly [edgeIdBrand]: true };

/** Opaque, stable identifier for a layer. */
export type LayerId = string & { readonly [layerIdBrand]: true };

/**
 * Cast an arbitrary string to ShapeId. The caller is responsible for uniqueness;
 * the type system only guarantees the value flows through ShapeId-typed APIs.
 */
export const shapeId = (raw: string): ShapeId => raw as ShapeId;

/** Cast a raw string to EdgeId. Caller owns uniqueness. */
export const edgeId = (raw: string): EdgeId => raw as EdgeId;

/** Cast a raw string to LayerId. Caller owns uniqueness. */
export const layerId = (raw: string): LayerId => raw as LayerId;
