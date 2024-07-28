import type { RichTemplate } from "./define.js";

/**
 * Registry of rich templates, keyed by id. The render layer and the host UI
 * both read from this registry; the host typically installs templates at
 * startup and rarely mutates it afterwards.
 */
export class RichTemplateRegistry {
  private readonly items = new Map<string, RichTemplate>();

  register(template: RichTemplate): void {
    if (this.items.has(template.id)) {
      throw new Error(`Rich template already registered: ${template.id}`);
    }
    this.items.set(template.id, template);
  }

  replace(template: RichTemplate): void {
    this.items.set(template.id, template);
  }

  get(id: string): RichTemplate | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  list(): readonly RichTemplate[] {
    return [...this.items.values()];
  }

  byCategory(category: string): readonly RichTemplate[] {
    return this.list().filter((t) => t.category === category);
  }

  clear(): void {
    this.items.clear();
  }
}

/** Singleton used by the kernel renderer + most hosts. */
export const defaultRichRegistry = new RichTemplateRegistry();
