import type { TemplateNode } from "./node.js";

/**
 * Description of a rich template's data shape. Each entry maps a `{ bind: }`
 * key in the tree to its expected runtime type. The kernel does not enforce
 * the schema beyond surfacing it in the registry — host UIs use it to render
 * forms / inspectors.
 */
export type RichTemplateSchema = Readonly<Record<string, "string" | "number" | "boolean">>;

/**
 * A rich template definition: tree + binding schema + version. Versioning is
 * the template's own — kernel migrations apply to the scene document, not to
 * individual templates.
 */
export interface RichTemplate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** SVG markup for the palette thumbnail. */
  readonly icon: string;
  /** Root of the layout tree. */
  readonly root: TemplateNode;
  readonly schema?: RichTemplateSchema;
  readonly version?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * Default values for the `data` argument the host will pass to the editor
   * when an instance is created. Optional; the host can substitute its own.
   */
  readonly defaults?: Readonly<Record<string, unknown>>;

  /**
   * Interactive-resize constraints. Copied onto the spawned `TemplateElement`'s
   * `minWidth` / `minHeight` / `maxWidth` / `maxHeight` / `noFlip` fields so
   * the editor enforces them. Omitted = no constraint on that axis.
   */
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  /** Disable mirroring when overshooting the opposite edge. Defaults to `false`. */
  readonly noFlip?: boolean;
}

/** Type-safe constructor for `RichTemplate`. Identity function. */
export const defineRichTemplate = (template: RichTemplate): RichTemplate => template;
