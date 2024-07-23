import type { Vec2 } from "@oh-just-another/types";
import { isInteractive } from "./node";
import type { LayoutedNode } from "./layout";

const containsPoint = (
  b: { x: number; y: number; width: number; height: number },
  p: Vec2,
): boolean => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

/**
 * Walk the layouted tree top-down (parent before children) and return the
 * deepest node that contains `point`. Returns `null` if `point` lies outside
 * the root bounds. Coordinates are in the template's local space.
 */
export const nodeAtPoint = (root: LayoutedNode, point: Vec2): LayoutedNode | null => {
  if (!containsPoint(root.bounds, point)) return null;
  for (const child of root.children) {
    const hit = nodeAtPoint(child, point);
    if (hit) return hit;
  }
  return root;
};

/**
 * Like `nodeAtPoint` but only returns interactive nodes (`button` or
 * `drop-zone`). Returns the innermost interactive ancestor under `point`.
 */
export const interactiveNodeAtPoint = (root: LayoutedNode, point: Vec2): LayoutedNode | null => {
  const hit = nodeAtPoint(root, point);
  if (!hit) return null;
  return findInteractiveAncestor(root, hit);
};

const findInteractiveAncestor = (root: LayoutedNode, target: LayoutedNode): LayoutedNode | null => {
  if (target === root) {
    return isInteractive(root.node) ? root : null;
  }
  // Walk parent chain top-down. Build the chain by DFS from root.
  const chain = findChain(root, target);
  if (!chain) return null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const node = chain[i]!;
    if (isInteractive(node.node)) return node;
  }
  return null;
};

const findChain = (root: LayoutedNode, target: LayoutedNode): LayoutedNode[] | null => {
  if (root === target) return [root];
  for (const child of root.children) {
    const inner = findChain(child, target);
    if (inner) return [root, ...inner];
  }
  return null;
};
