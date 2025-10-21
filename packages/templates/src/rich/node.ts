import type { LayoutStyle, NodeStyle } from "./style.js";

/**
 * Data binding: either a literal value or `{ bind: "<key>" }` that resolves
 * to `data[key]` at render time.
 */
export type Binding<T> = T | { readonly bind: string };

export interface NodeBase {
  /**
   * Stable identifier within the template tree. Optional but recommended —
   * `id` is what hit-test events report back to the host.
   */
  readonly id?: string;
  readonly style?: NodeStyle;
  readonly layout?: LayoutStyle;
}

export interface ContainerNode extends NodeBase {
  readonly type: "container";
  readonly children?: readonly TemplateNode[];
}

export interface TextNode extends NodeBase {
  readonly type: "text";
  readonly text: Binding<string>;
}

export interface IconNode extends NodeBase {
  readonly type: "icon";
  /**
   * Inline SVG markup as a string. The renderer parses + paints it; for
   * `<svg>` markup, `style.fill` / `style.color` are not auto-propagated.
   */
  readonly svg: Binding<string>;
}

export interface ImageNode extends NodeBase {
  readonly type: "image";
  readonly src: Binding<string>;
}

/**
 * Clickable area. The host's `Editor` listens for `TEMPLATE_TAP` emits with
 * the node `id` and the host-defined `action` string and routes them.
 */
export interface ButtonNode extends NodeBase {
  readonly type: "button";
  readonly label?: Binding<string>;
  /** Free-form action identifier; the host decides what to do with it. */
  readonly action: string;
}

/**
 * Region that accepts dropped shapes / templates. Fires `TEMPLATE_DROP` for
 * this kind of node.
 */
export interface DropZoneNode extends NodeBase {
  readonly type: "drop-zone";
  /** Whitelist of template ids or shape `type`s that may be dropped here. */
  readonly accepts?: readonly string[];
  readonly label?: Binding<string>;
}

/**
 * Connection port — a named anchor on the rendered template shape. Links
 * snap to ports during draw / re-bind. Visible-on-hover is up to the host.
 *
 * Position the port the same way as any other node: typically with
 * `layout.position = "spot"` + `anchor` / `anchorFocus` / `offset`.
 * The port's `id` becomes the key in `shape.anchors`.
 *
 * `system` picks which coordinate system the port resolves to in
 * `shape.anchors` (see `extractPorts`):
 *   - `"ratio"` (default) — bounds-relative `{x,y}` in 0..1; scales with
 *     the template under resize. Ports without `system` use this.
 *   - `"absolute"` — fixed local-px offset from the template's origin;
 *     stays put (does not scale) when the template is resized.
 *   - `"edge"` — pinned to polygon edge `index` at parameter `t` (0..1);
 *     stays on the real sloped edge. Requires `edge`; meaningful only
 *     when the instantiated shape is a polygon (falls back to centre on
 *     non-polygons, per the scene anchor resolver).
 */
export interface PortNode extends NodeBase {
  readonly type: "port";
  /** Required for ports — used as `shape.anchors[id]` lookup key. */
  readonly id: string;
  /** Coordinate system for the resulting anchor. Default `"ratio"`. */
  readonly system?: "ratio" | "absolute" | "edge";
  /** Edge index + parameter — required when `system` is `"edge"`. */
  readonly edge?: { readonly index: number; readonly t: number };
}

export type TemplateNode =
  | ContainerNode
  | TextNode
  | IconNode
  | ImageNode
  | ButtonNode
  | DropZoneNode
  | PortNode;

/** Type guard: a node is a container (has `children`). */
export const isContainer = (n: TemplateNode): n is ContainerNode => n.type === "container";

/** True if a node should react to pointer input. */
export const isInteractive = (n: TemplateNode): n is ButtonNode | DropZoneNode =>
  n.type === "button" || n.type === "drop-zone";

/** Iterate every child of `n` lazily, regardless of node kind. */
export const childrenOf = (n: TemplateNode): readonly TemplateNode[] =>
  isContainer(n) ? (n.children ?? []) : [];
