/**
 * "Automatic" JSX runtime — wires `tsx`/`jsx` transform output (`jsx`,
 * `jsxs`, `jsxDEV`) into our `h()` pragma. Configure your build:
 *
 * - **tsconfig**: `"jsx": "react-jsx"`, `"jsxImportSource": "@oh-just-another/templates-jsx"`
 * - **vite**: `esbuild.jsx: "automatic"`, `esbuild.jsxImportSource:
 *   "@oh-just-another/templates-jsx"`
 *
 * After that, `.tsx` files in your project can use plain JSX and TypeScript
 * will validate the intrinsic elements via the `JSX` namespace below.
 */

import { h, Fragment as FragmentSymbol, type JsxChild } from "./h.js";

export { FragmentSymbol as Fragment };

/**
 * `jsx(type, props, key?)` — automatic-runtime single-child form. The TS
 * compiler emits this when an element has zero or one statically-known child.
 */
export const jsx = (
  type: string | typeof FragmentSymbol,
  props: Record<string, unknown> | null,
  _key?: string,
): ReturnType<typeof h> => {
  const { children, ...rest } = props ?? {};
  const childArr = normaliseChildren(children);
  return h(type, rest, ...childArr);
};

/** `jsxs` is identical to `jsx` for our purposes (static-children variant). */
export const jsxs = jsx;

/** Dev variant — TS only emits this with `"jsx": "react-jsxdev"`. */
export const jsxDEV = jsx;

const normaliseChildren = (raw: unknown): JsxChild[] => {
  if (raw === undefined) return [];
  if (Array.isArray(raw)) return raw as JsxChild[];
  return [raw as JsxChild];
};

// --- JSX type wiring ---

import type {
  ButtonProps,
  ContainerProps,
  DropZoneProps,
  IconProps,
  ImageProps,
  TextProps,
} from "./h.js";
import type { rich } from "@oh-just-another/templates";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = rich.TemplateNode;
    interface IntrinsicElements {
      container: ContainerProps;
      text: TextProps;
      icon: IconProps;
      image: ImageProps;
      button: ButtonProps;
      "drop-zone": DropZoneProps;
    }
    interface ElementChildrenAttribute {
      // matches the `children` key on prop interfaces
      children: object;
    }
  }
}
