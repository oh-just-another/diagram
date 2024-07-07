/**
 * Logical layers the renderer composites in this order (bottom to top).
 *
 * `background` is for static content that changes rarely — grid, watermarks,
 * imported images. `main` carries every shape/edge in the scene. `overlay` is
 * for transient UI — selection handles, drag previews, snap guides.
 *
 * Backends that support multiple draw surfaces (e.g. `renderer-canvas` with
 * stacked `<canvas>` elements) map each `LayerName` to its own surface so the
 * frequently-changing overlay does not invalidate the static main.
 */
export type LayerName = "background" | "main" | "overlay";

export const LAYER_ORDER: readonly LayerName[] = ["background", "main", "overlay"];
