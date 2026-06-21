import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { emptyScene } from "@oh-just-another/scene";
import { DiagramRoot, DiagramSurface, ContextMenu, type ContextMenuItem } from "../src/index";

// jsdom has no Canvas2D; hand the surface a no-op recording context so it mounts.
const mockGetContext = (): CanvasRenderingContext2D => {
  const noop = () => {};
  return {
    canvas: { width: 0, height: 0 },
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    resetTransform: noop,
    clearRect: noop,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    setLineDash: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    rect: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    measureText: () => ({ width: 0 }),
    drawImage: noop,
  } as unknown as CanvasRenderingContext2D;
};

// One always-visible item so an opened menu actually renders (role="menu").
const items: readonly ContextMenuItem[] = [
  { kind: "action", id: "t", label: "Test item", onClick: () => {} },
];

const rightClick = (el: EventTarget): void => {
  act(() => {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
};

describe("ContextMenu listener scope", () => {
  it("never opens from a raw contextmenu DOM event — only via the editor gesture channel", () => {
    const stub = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
      this: HTMLCanvasElement,
      type: string,
    ) {
      if (type !== "2d") return null;
      const ctx = mockGetContext();
      (ctx as { canvas: HTMLCanvasElement }).canvas = this;
      return ctx;
    });

    const result = render(
      <DiagramRoot initialScene={emptyScene()} initialMode="select" skipInstallRenderers={false}>
        <DiagramSurface style={{ width: 800, height: 600 }} />
        <ContextMenu items={items} />
      </DiagramRoot>,
    );

    try {
      const host = result.container.querySelector('[role="application"]');
      expect(host, "DiagramSurface host should mount").not.toBeNull();

      // The menu opens ONLY through the editor's gesture channel
      // (`onLongPress` — fired by a clean right-click or touch long-press,
      // scoped to the host). It must NOT have its own `contextmenu` DOM
      // listener: a window/host one opened the diagram menu for right-clicks
      // anywhere on the page (the regression). So a raw `contextmenu` event
      // opens nothing — neither on the page nor on the host. (The positive
      // path — right-click gesture opens the menu — is covered by manual
      // browser verification.)
      rightClick(document.body);
      expect(
        screen.queryByRole("menu"),
        "a page-level right-click must not open the diagram context menu",
      ).toBeNull();

      rightClick(host as HTMLElement);
      expect(
        screen.queryByRole("menu"),
        "a raw contextmenu event on the host must not open the menu either — it opens via the gesture channel",
      ).toBeNull();
    } finally {
      result.unmount();
      stub.mockRestore();
    }
  });
});
