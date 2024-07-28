import type { Binding, TemplateNode } from "./node.js";

/**
 * Resolve every `{ bind: "key" }` reference in a tree against `data`. Returns
 * a new tree with literal values in place of bindings. Unknown keys resolve
 * to `undefined`, which the renderer treats as empty.
 *
 * Pure — does not mutate the input tree.
 */
export const resolveBindings = (
  node: TemplateNode,
  data: Readonly<Record<string, unknown>>,
): TemplateNode => {
  switch (node.type) {
    case "container":
      if (!node.children) return node;
      return {
        ...node,
        children: node.children.map((c) => resolveBindings(c, data)),
      };
    case "text":
      return { ...node, text: resolve(node.text, data, "") };
    case "icon":
      return { ...node, svg: resolve(node.svg, data, "") };
    case "image":
      return { ...node, src: resolve(node.src, data, "") };
    case "button":
      return node.label === undefined ? node : { ...node, label: resolve(node.label, data, "") };
    case "drop-zone":
      return node.label === undefined ? node : { ...node, label: resolve(node.label, data, "") };
  }
};

const resolve = <T>(value: Binding<T>, data: Readonly<Record<string, unknown>>, fallback: T): T => {
  if (typeof value === "object" && value !== null && "bind" in value) {
    const key = value.bind;
    const raw = data[key];
    if (raw === undefined || raw === null) return fallback;
    return raw as T;
  }
  return value;
};
