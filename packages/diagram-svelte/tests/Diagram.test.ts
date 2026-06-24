import { readFileSync } from "node:fs";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { compile, preprocess } from "svelte/compiler";
import { describe, expect, it } from "vitest";

const filename = new URL("../src/Diagram.svelte", import.meta.url);
const source = readFileSync(filename, "utf8");

// `compile` only understands plain JS, so strip the `lang="ts"` types first
// with the same preprocessor a Svelte app would use.
const toJs = async (): Promise<string> => {
  const processed = await preprocess(source, vitePreprocess(), { filename: filename.pathname });
  return processed.code;
};

describe("<Diagram> (Svelte)", () => {
  it("compiles as a valid Svelte 5 component", async () => {
    const code = await toJs();
    const { js, warnings } = compile(code, { name: "Diagram", generate: "client" });
    expect(js.code.length).toBeGreaterThan(0);
    // A well-formed wrapper compiles without warnings (a11y, unused exports…).
    expect(warnings).toEqual([]);
  });

  it("declares the documented props and event callbacks", () => {
    for (const prop of ["scene", "theme", "renderer", "grid", "snap"]) {
      expect(source).toContain(prop);
    }
    for (const cb of ["onready", "onscenechange", "onselectionchange", "onthemechange"]) {
      expect(source).toContain(cb);
    }
  });
});
