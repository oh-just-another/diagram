/**
 * File-drop overlay: hidden until an OS file drag hovers the canvas, then
 * shows the DROP glyph and one chip per labelled file-drop handler;
 * `usePalettePlacement({ onFileDrag })` reports the drag lifecycle.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyScene } from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, FileDropOverlay, usePalettePlacement } from "../src/index";

installBuiltinRenderers();
afterEach(cleanup);

const mountEditor = () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const layered = new LayeredCanvas(host, 200, 100);
  const editor = new Editor({
    host,
    mainTarget: layered.get("main"),
    overlayTarget: layered.get("overlay"),
    initialScene: emptyScene(),
    initialTool: "select",
  });
  editor.registerFileDropHandler({
    id: "host.csv",
    label: "Spreadsheets",
    kind: "data",
    formats: ["CSV"],
    accept: (f) => f.name.endsWith(".csv"),
    handle: () => undefined,
  });
  editor.registerFileDropHandler({
    id: "host.silent",
    accept: () => false,
    handle: () => undefined,
  });
  return {
    editor,
    dispose: () => {
      editor.dispose();
      host.remove();
    },
  };
};

const wrap =
  (editor: Editor) =>
  ({ children }: { children: ReactNode }) => (
    <DiagramProvider editor={editor}>{children}</DiagramProvider>
  );

describe("FileDropOverlay", () => {
  it("renders nothing while inactive", () => {
    const { editor, dispose } = mountEditor();
    try {
      const { container } = render(<FileDropOverlay active={false} />, { wrapper: wrap(editor) });
      expect(container.querySelector(".du-drop-overlay")).toBeNull();
    } finally {
      dispose();
    }
  });

  it("shows DROP and one chip per labelled handler (built-ins + host), formats included", () => {
    const { editor, dispose } = mountEditor();
    try {
      render(<FileDropOverlay active />, { wrapper: wrap(editor) });
      expect(screen.getByText("DROP")).toBeTruthy();
      const chips = screen.getAllByRole("listitem").map((li) => li.textContent);
      expect(chips.some((t) => t?.includes("Images") && t.includes("PNG"))).toBe(true);
      expect(chips.some((t) => t?.includes("Video"))).toBe(true);
      expect(chips.some((t) => t?.includes("Spreadsheets") && t.includes("CSV"))).toBe(true);
      expect(chips.length).toBe(3); // the unlabelled handler stays out
    } finally {
      dispose();
    }
  });
});

describe("usePalettePlacement({ onFileDrag })", () => {
  const Canvas = ({ onFileDrag }: { readonly onFileDrag: (a: boolean) => void }) => {
    const h = usePalettePlacement({ onFileDrag });
    return <div data-testid="canvas" {...h} />;
  };
  const files = { dataTransfer: { types: ["Files"], dropEffect: "none", files: [], items: [] } };

  it("reports true on file dragenter and false on dragleave / drop, once per transition", () => {
    const { editor, dispose } = mountEditor();
    try {
      const onFileDrag = vi.fn();
      render(<Canvas onFileDrag={onFileDrag} />, { wrapper: wrap(editor) });
      const canvas = screen.getByTestId("canvas");
      fireEvent.dragEnter(canvas, files);
      fireEvent.dragOver(canvas, files);
      expect(onFileDrag.mock.calls).toEqual([[true]]);
      fireEvent.dragLeave(canvas, { relatedTarget: document.body });
      expect(onFileDrag.mock.calls).toEqual([[true], [false]]);
      fireEvent.dragEnter(canvas, files);
      fireEvent.drop(canvas, files);
      expect(onFileDrag.mock.calls).toEqual([[true], [false], [true], [false]]);
    } finally {
      dispose();
    }
  });

  it("ignores palette template drags", () => {
    const { editor, dispose } = mountEditor();
    try {
      const onFileDrag = vi.fn();
      render(<Canvas onFileDrag={onFileDrag} />, { wrapper: wrap(editor) });
      fireEvent.dragEnter(screen.getByTestId("canvas"), {
        dataTransfer: { types: ["application/x-template-id"], dropEffect: "none" },
      });
      expect(onFileDrag).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });
});
