import type { Category, Template } from "./types.js";

/**
 * In-process registry of templates. Plugins register at module load; consumers
 * iterate by category to fill a palette.
 *
 * There is no precedence or namespace — registering an existing id throws so
 * collisions are caught early.
 */
export class TemplateRegistry {
  private readonly items = new Map<string, Template>();

  register(template: Template): void {
    if (this.items.has(template.id)) {
      throw new Error(`Template already registered: ${template.id}`);
    }
    this.items.set(template.id, template);
  }

  /** Overwrite a registration. Use in tests / hot-reload paths. */
  replace(template: Template): void {
    this.items.set(template.id, template);
  }

  get(id: string): Template | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  /** All templates in registration order. */
  list(): readonly Template[] {
    return [...this.items.values()];
  }

  /** Templates belonging to a given category, in registration order. */
  byCategory(category: Category): readonly Template[] {
    return this.list().filter((t) => t.category === category);
  }

  /** Distinct categories present in the registry. */
  categories(): readonly Category[] {
    const out = new Set<Category>();
    for (const t of this.items.values()) out.add(t.category);
    return [...out];
  }

  /** Drop everything. */
  clear(): void {
    this.items.clear();
  }
}

/** Default singleton used by `installBuiltinTemplates()` and most hosts. */
export const defaultRegistry = new TemplateRegistry();
