import type { LayerId } from "@oh-just-another/types";
import type { FractionalIndex } from "fractional-keys";

/**
 * Layer is a named, ordered container for shapes and edges. Membership is
 * stored on the children (via `shape.layerId` / `edge.layerId`), not on the
 * layer itself, so cross-layer moves are O(1) updates of a single field.
 *
 * Layer z-order is governed by `order` (fractional index). Within a layer,
 * child z-order is governed by each child's `order`.
 */
export interface Layer {
  readonly id: LayerId;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly order: FractionalIndex;
}
