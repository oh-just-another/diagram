/**
 * Mobile bottom-sheet variant of the property panel: a primary row + a ⋮
 * that EXPANDS to reveal the overflow controls. The contract that matters:
 * no property is lost — overflow controls are absent while collapsed and
 * present after tapping ⋮. Desktop (default) keeps everything inline.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, PropertyPanel, TooltipProvider, useMobileLayout } from "../src/index";

installBuiltinRenderers();

const rect: Element = {
  id: elementId("r1"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc", stroke: "#000", strokeWidth: 2 },
  width: 50,
  height: 50,
};

const noop = new Proxy({} as Record<string, unknown>, {
  get: (_, key) =>
    key === "size"
      ? { width: 800, height: 600 }
      : key === "measureText"
        ? () => ({ width: 0 })
        : () => undefined,
}) as never;

const mountEditor = (): Editor => {
  let scene = emptyScene();
  ({ scene } = addElement(scene, rect));
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }),
  });
  return new Editor({ host: host as never, mainTarget: noop, overlayTarget: noop, initialScene: scene });
};

const renderPanel = (editor: Editor, mobile: boolean) =>
  render(
    <TooltipProvider>
      <DiagramProvider editor={editor}>
        <PropertyPanel mobile={mobile} />
      </DiagramProvider>
    </TooltipProvider>,
  );

describe("PropertyPanel — mobile bottom-sheet variant", () => {
  it("collapsed shows the ⋮ but hides overflow controls; expanding reveals them", () => {
    const editor = mountEditor();
    editor.setSelection([rect.id]);
    const { container } = renderPanel(editor, true);

    // ⋮ expand button present in the primary row.
    const expand = container.querySelector('button[aria-label="More properties"]');
    expect(expand).not.toBeNull();

    // An overflow control (stroke style "Dashed") is NOT rendered yet.
    expect(container.querySelector('button[aria-label="Dashed"]')).toBeNull();

    // Tap ⋮ → overflow grid appears, Dashed now reachable.
    act(() => {
      fireEvent.click(expand!);
    });
    expect(container.querySelector('button[aria-label="Dashed"]')).not.toBeNull();

    // ⋮ now collapses.
    expect(
      container.querySelector('button[aria-label="Hide more properties"]'),
    ).not.toBeNull();
    editor.dispose();
  });

  it("desktop (mobile=false) lays everything inline — no ⋮ expand, overflow always present", () => {
    const editor = mountEditor();
    editor.setSelection([rect.id]);
    const { container } = renderPanel(editor, false);
    // No bottom-sheet expand button on desktop…
    expect(container.querySelector('button[aria-label="More properties"]')).toBeNull();
    // …and overflow control is inline from the start.
    expect(container.querySelector('button[aria-label="Dashed"]')).not.toBeNull();
    editor.dispose();
  });
});

// ---------------------------------------------------------------------------
// useMobileLayout hook
// ---------------------------------------------------------------------------

const Probe = () => <span data-testid="m">{useMobileLayout() ? "mobile" : "desktop"}</span>;

describe("useMobileLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubMatchMedia = (matches: boolean) => {
    const listeners = new Set<() => void>();
    const mql = {
      matches,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mql),
    );
    return {
      set: (next: boolean) => {
        mql.matches = next;
        act(() => listeners.forEach((cb) => cb()));
      },
    };
  };

  const probeText = (c: HTMLElement) => c.querySelector('[data-testid="m"]')?.textContent;

  it("reflects matchMedia and reacts to changes", () => {
    const mm = stubMatchMedia(false);
    const { container } = render(<Probe />);
    expect(probeText(container)).toBe("desktop");
    mm.set(true);
    expect(probeText(container)).toBe("mobile");
  });

  it("starts mobile when the media query already matches", () => {
    stubMatchMedia(true);
    const { container } = render(<Probe />);
    expect(probeText(container)).toBe("mobile");
  });
});
