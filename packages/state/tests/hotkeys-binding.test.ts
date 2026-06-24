// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ActionRegistry, bindEditorHotkeys } from "../src/index";
import type { Editor } from "../src/editor";

// The test actions never touch the editor, so a bare stand-in is enough.
const fakeEditor = {} as Editor;

describe("bindEditorHotkeys", () => {
  it("dispatches a matching hotkey and stops on unbind", () => {
    const perform = vi.fn();
    const registry = new ActionRegistry();
    registry.register({ id: "t", label: "T", category: "other", hotkey: { key: "k" }, perform });
    const target = document.createElement("div");

    const unbind = bindEditorHotkeys(fakeEditor, { target, registry });
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(perform).toHaveBeenCalledOnce();

    unbind();
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(perform).toHaveBeenCalledOnce();
  });

  it("leaves hotkeys alone while typing in an input", () => {
    const perform = vi.fn();
    const registry = new ActionRegistry();
    registry.register({ id: "t", label: "T", category: "other", hotkey: { key: "k" }, perform });
    const input = document.createElement("input");
    document.body.append(input);

    const unbind = bindEditorHotkeys(fakeEditor, { target: input, registry });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(perform).not.toHaveBeenCalled();

    unbind();
    input.remove();
  });
});
