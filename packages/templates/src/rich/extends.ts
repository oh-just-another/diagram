import type { RichTemplate } from "./define.js";

/**
 * Recipe for building a rich template by extending another. The base
 * template is looked up by id in a registry-like map; `overrides` is
 * deep-merged on top.
 *
 *   extendRichTemplate({
 *     id: "myorg.bigger-card",
 *     extends: "myorg.card",
 *     overrides: { width: 360, defaults: { title: "Big" } },
 *   }, registry)
 */
export interface RichTemplateExtension {
  readonly id: string;
  readonly extends: string;
  readonly name?: string;
  readonly category?: string;
  readonly icon?: string;
  readonly overrides?: DeepPartial<RichTemplate>;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Readonly<Record<string, unknown>>
    ? DeepPartial<T[K]>
    : T[K] extends readonly (infer U)[]
      ? readonly U[]
      : T[K];
};

/**
 * Resolve a `RichTemplateExtension` (and any chain of base templates it
 * references) into a fully-merged `RichTemplate`. Each layer's
 * `overrides` are deep-merged on top of the previous (base first, leaf
 * last) so child layers naturally win.
 *
 * `lookup` is the registry accessor — usually `(id) => registry.get(id)`.
 * Throws if the chain references a missing base id.
 */
export const resolveRichTemplateChain = (
  ext: RichTemplateExtension,
  lookup: (id: string) => RichTemplate | RichTemplateExtension | undefined,
): RichTemplate => {
  const chain: RichTemplateExtension[] = [ext];
  let current: RichTemplate | RichTemplateExtension | undefined = lookup(ext.extends);
  while (current && "extends" in current) {
    chain.unshift(current);
    current = lookup(current.extends);
  }
  if (!current) {
    const first = chain[0];
    throw new Error(
      `Rich template "${ext.id}" extends "${first ? first.extends : ext.extends}", which is not registered.`,
    );
  }
  // `current` is the concrete base `RichTemplate` now.
  let result: RichTemplate = current;
  for (const layer of chain) {
    result = mergeRichTemplate(result, {
      id: layer.id,
      ...(layer.name !== undefined ? { name: layer.name } : {}),
      ...(layer.category !== undefined ? { category: layer.category } : {}),
      ...(layer.icon !== undefined ? { icon: layer.icon } : {}),
      ...(layer.overrides ?? {}),
    });
  }
  return result;
};

const mergeRichTemplate = (
  base: RichTemplate,
  patch: { id: string } & DeepPartial<RichTemplate>,
): RichTemplate => {
  return {
    ...base,
    ...patch,
    // Defaults merge object-shallow — overriding individual keys is the
    // common case; full replacement is rare and authors can pass the
    // whole object.
    ...(patch.defaults !== undefined ? { defaults: { ...base.defaults, ...patch.defaults } } : {}),
    // Same for metadata.
    ...(patch.metadata !== undefined ? { metadata: { ...base.metadata, ...patch.metadata } } : {}),
  };
};
