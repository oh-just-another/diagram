import type { rich } from "@oh-just-another/templates";

// h() pragma + JSX runtime over @oh-just-another/templates rich nodes.
//
// Pure JSON-builder — no DOM, no virtual DOM. Output is a plain
// TemplateNode consumed as-is by layout / render / hit-test.
//
// To enable JSX in a host project, set "jsx": "react-jsx" and
// "jsxImportSource": "@oh-just-another/templates-jsx" in tsconfig.

/** Marker for `<>...</>` fragments. Same convention as React. */
export const Fragment = Symbol.for("@oh-just-another/templates-jsx/Fragment");
export type Fragment = typeof Fragment;

type TemplateNode = rich.TemplateNode;

export interface ContainerProps {
  id?: string;
  style?: rich.NodeStyle;
  layout?: rich.LayoutStyle;
  children?: JsxChild | readonly JsxChild[];
}

export interface TextProps {
  id?: string;
  style?: rich.NodeStyle;
  layout?: rich.LayoutStyle;
  children?: JsxChild | readonly JsxChild[];
  text?: rich.Binding<string>;
}

export interface IconProps {
  id?: string;
  style?: rich.NodeStyle;
  layout?: rich.LayoutStyle;
  svg: rich.Binding<string>;
}

export interface ImageProps {
  id?: string;
  style?: rich.NodeStyle;
  layout?: rich.LayoutStyle;
  src: rich.Binding<string>;
}

export interface ButtonProps {
  id?: string;
  style?: rich.NodeStyle;
  layout?: rich.LayoutStyle;
  action: string;
  label?: rich.Binding<string>;
  children?: JsxChild | readonly JsxChild[];
}

export interface DropZoneProps {
  id?: string;
  style?: rich.NodeStyle;
  layout?: rich.LayoutStyle;
  accepts?: readonly string[];
  label?: rich.Binding<string>;
}

/**
 * Anything JSX can sit between `>` and `<`. Includes data bindings
 * (`{bind("key")}`) so they can be used as direct children of `<text>` and
 * `<button>` to set their resolved value.
 */
export type JsxChild =
  | TemplateNode
  | string
  | number
  | false
  | null
  | undefined
  | rich.Binding<string>
  | readonly JsxChild[];

/** `{ bind: "key" }` shortcut for use in JSX expressions. */
export const bind = <T>(key: string): rich.Binding<T> => ({ bind: key });

/**
 * Classic `h(type, props, ...children)` factory.
 *
 * `type` is one of the intrinsic element names (`"container"`, `"text"`,
 * `"icon"`, `"image"`, `"button"`, `"drop-zone"`) or the `Fragment` symbol.
 * `props` is per-element — see the `*Props` interfaces — but typed as
 * `Record<string, unknown>` at the factory boundary so the same body can
 * dispatch on every element kind. Type-safety comes from the JSX layer in
 * `jsx-runtime.ts` (via `JSX.IntrinsicElements`).
 */
export function h(
  type: string | Fragment,
  props: Record<string, unknown> | null,
  ...children: JsxChild[]
): TemplateNode {
  const allProps = props ?? {};
  // Children passed via spread args win over `children` prop, matching React.
  const childList = children.length > 0 ? children : ([] as JsxChild[]);
  if (childList.length === 0 && "children" in allProps) {
    const inProp = allProps.children as JsxChild | readonly JsxChild[] | undefined;
    if (Array.isArray(inProp)) for (const c of inProp as readonly JsxChild[]) childList.push(c);
    else if (inProp !== undefined) childList.push(inProp);
  }
  return buildNode(type, allProps, childList);
}

const buildNode = (
  type: unknown,
  props: Record<string, unknown>,
  rawChildren: readonly JsxChild[],
): TemplateNode => {
  const children = flattenChildren(rawChildren);

  if (type === Fragment) {
    // Fragments collapse to a container without style/layout.
    return { type: "container", children };
  }

  if (type === "container") {
    return {
      type: "container",
      ...(typeof props.id === "string" ? { id: props.id } : {}),
      ...(props.style ? { style: props.style } : {}),
      ...(props.layout ? { layout: props.layout } : {}),
      ...(children.length > 0 ? { children } : {}),
    };
  }

  if (type === "text") {
    const text = readText(props, rawChildren) ?? "";
    return {
      type: "text",
      ...(typeof props.id === "string" ? { id: props.id } : {}),
      ...(props.style ? { style: props.style } : {}),
      ...(props.layout ? { layout: props.layout } : {}),
      text,
    };
  }

  if (type === "icon") {
    return {
      type: "icon",
      ...(typeof props.id === "string" ? { id: props.id } : {}),
      ...(props.style ? { style: props.style } : {}),
      ...(props.layout ? { layout: props.layout } : {}),
      svg: props.svg as rich.Binding<string>,
    };
  }

  if (type === "image") {
    return {
      type: "image",
      ...(typeof props.id === "string" ? { id: props.id } : {}),
      ...(props.style ? { style: props.style } : {}),
      ...(props.layout ? { layout: props.layout } : {}),
      src: props.src as rich.Binding<string>,
    };
  }

  if (type === "button") {
    const label = props.label ?? readText(props, rawChildren);
    return {
      type: "button",
      ...(typeof props.id === "string" ? { id: props.id } : {}),
      ...(props.style ? { style: props.style } : {}),
      ...(props.layout ? { layout: props.layout } : {}),
      action: props.action as string,
      ...(label !== undefined && label !== "" ? { label: label as rich.Binding<string> } : {}),
    };
  }

  if (type === "drop-zone") {
    return {
      type: "drop-zone",
      ...(typeof props.id === "string" ? { id: props.id } : {}),
      ...(props.style ? { style: props.style } : {}),
      ...(props.layout ? { layout: props.layout } : {}),
      ...(props.accepts ? { accepts: props.accepts as readonly string[] } : {}),
      ...(props.label !== undefined ? { label: props.label as rich.Binding<string> } : {}),
    };
  }

  throw new Error(`Unknown JSX element: ${String(type)}`);
};

const flattenChildren = (raw: readonly JsxChild[]): TemplateNode[] => {
  const out: TemplateNode[] = [];
  const walk = (c: JsxChild): void => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) {
      for (const inner of c as readonly JsxChild[]) walk(inner);
      return;
    }
    if (typeof c === "string" || typeof c === "number") {
      out.push({ type: "text", text: String(c) });
      return;
    }
    out.push(c as TemplateNode);
  };
  for (const c of raw) walk(c);
  return out;
};

/** For `text` and `button`: prefer `props.text/label`, fall back to children. */
const readText = (
  props: Record<string, unknown>,
  rawChildren: readonly JsxChild[],
): rich.Binding<string> | undefined => {
  if (props.text !== undefined) return props.text as rich.Binding<string>;
  // Concatenate string/number children; binding objects are taken whole.
  let asString = "";
  let asBinding: rich.Binding<string> | undefined;
  const walk = (c: JsxChild): void => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) {
      for (const inner of c as readonly JsxChild[]) walk(inner);
      return;
    }
    if (typeof c === "string" || typeof c === "number") {
      asString += String(c);
      return;
    }
    if (typeof c === "object" && c !== null && "bind" in c) {
      asBinding = c;
    }
  };
  for (const c of rawChildren) walk(c);
  if (asBinding) return asBinding;
  return asString === "" ? undefined : asString;
};

/**
 * Identity helper for editor symmetry with `tsx2json` — at runtime the JSX
 * factory already produces a JSON-compatible `TemplateNode`, so serialisation
 * is just `JSON.stringify(node)`. Lets callers write
 * `tsx2json(<container>...</container>)` for a clear declarative call site
 * (no transform, no validation).
 */
export const tsx2json = (node: TemplateNode): TemplateNode => node;
