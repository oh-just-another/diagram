import type { LayoutStyle, NodeStyle } from "./style";

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

export type TemplateNode =
  | ContainerNode
  | TextNode
  | IconNode
  | ImageNode
  | ButtonNode
  | DropZoneNode;

/** Type guard: a node is a container (has `children`). */
export const isContainer = (n: TemplateNode): n is ContainerNode => n.type === "container";

/** True if a node should react to pointer input. */
export const isInteractive = (n: TemplateNode): n is ButtonNode | DropZoneNode =>
  n.type === "button" || n.type === "drop-zone";

/** Iterate every child of `n` lazily, regardless of node kind. */
export const childrenOf = (n: TemplateNode): readonly TemplateNode[] =>
  isContainer(n) ? (n.children ?? []) : [];
