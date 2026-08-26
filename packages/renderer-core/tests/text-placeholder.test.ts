/**
 * Empty-text placeholder: deterministic per element id, weighted across the
 * list, drawn in grey only when the render context asks for it.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import {
  installBuiltinRenderers,
  pickTextPlaceholder,
  renderScene,
  TEXT_PLACEHOLDERS,
  TEXT_PLACEHOLDER_COLOR,
  type RenderTarget,
} from "../src/index";

const makeRecorder = () => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const target = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "size") return { width: 1000, height: 1000 };
        if (prop === "then") return undefined;
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          if (prop === "measureText") return { width: 10 };
          return undefined;
        };
      },
    },
  ) as RenderTarget;
  return { target, calls };
};

const emptyText = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text: "",
  fontFamily: "sans",
  fontSize: 16,
});

describe("pickTextPlaceholder", () => {
  it("is deterministic per seed and always returns a listed prompt", () => {
    const texts = new Set(TEXT_PLACEHOLDERS.map((p) => p.text));
    for (let i = 0; i < 50; i++) {
      const seed = `el-${String(i)}`;
      expect(pickTextPlaceholder(seed)).toBe(pickTextPlaceholder(seed));
      expect(texts.has(pickTextPlaceholder(seed))).toBe(true);
    }
  });

  it("spreads across the list with the heavy prompts leading", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const t = pickTextPlaceholder(`seed-${String(i)}`);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    // Every prompt (even weight 1) shows up over enough seeds…
    for (const p of TEXT_PLACEHOLDERS) expect(counts.get(p.text) ?? 0).toBeGreaterThan(0);
    // …and the default prompt is the most frequent.
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    expect(top).toBe("Type something");
  });
});

describe("drawText placeholder", () => {
  beforeAll(() => {
    installBuiltinRenderers();
  });

  const render = (opts: { textPlaceholders?: boolean }) => {
    const { target, calls } = makeRecorder();
    let scene = emptyScene();
    ({ scene } = addElement(scene, emptyText("t-empty")));
    renderScene(scene, target, opts);
    return calls;
  };

  it("draws the element's prompt in the placeholder grey when asked", () => {
    const calls = render({ textPlaceholders: true });
    const drawn = calls.filter((c) => c.method === "fillText").map((c) => c.args[0]);
    expect(drawn).toContain(pickTextPlaceholder("t-empty"));
    expect(calls.some((c) => c.method === "setFill" && c.args[0] === TEXT_PLACEHOLDER_COLOR)).toBe(
      true,
    );
  });

  it("draws no prompt for empty text otherwise (exports stay blank)", () => {
    const calls = render({});
    const drawn = calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(drawn.filter((t) => t !== "")).toEqual([]);
    expect(calls.some((c) => c.method === "setFill" && c.args[0] === TEXT_PLACEHOLDER_COLOR)).toBe(
      false,
    );
  });
});
