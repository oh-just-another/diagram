/**
 * Behavioural coverage for the comments UI. `<CommentsPanel>` lists every
 * annotation thread and focuses one on click; `<CommentsPopover>` drives
 * the thread actions: reply (add comment), resolve / reopen, delete a
 * comment, delete the thread, and close.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { emptyScene } from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { CommentsPanel, CommentsPopover, DiagramProvider } from "../src/index";

installBuiltinRenderers();

afterEach(cleanup);

const mountEditor = (): Editor => {
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }),
  });
  const noop = new Proxy({} as Record<string, unknown>, {
    get: (_, key) =>
      key === "size"
        ? { width: 800, height: 600 }
        : key === "measureText"
          ? () => ({ width: 0 })
          : () => {},
  }) as never;
  return new Editor({
    host: host as never,
    mainTarget: noop,
    overlayTarget: noop,
    initialScene: emptyScene(),
  });
};

describe("CommentsPanel list", () => {
  it("shows the empty state when there are no annotations", () => {
    const editor = mountEditor();
    const { container } = render(
      <DiagramProvider editor={editor}>
        <CommentsPanel />
      </DiagramProvider>,
    );
    expect(container.textContent).toContain("No comments yet");
    expect(container.textContent).toContain("Comments (0)");
    editor.dispose();
  });

  it("lists threads and focuses one on click", () => {
    const editor = mountEditor();
    editor.setCommentAuthor({ id: "u1", name: "Ada" });
    const id = editor.addAnnotation({ position: { x: 10, y: 10 }, firstComment: "Look here" });
    // addAnnotation focuses the new thread; clear focus to test the click.
    editor.setSelectedAnnotation(null);

    const { container, getByText } = render(
      <DiagramProvider editor={editor}>
        <CommentsPanel />
      </DiagramProvider>,
    );
    expect(container.textContent).toContain("Comments (1)");
    expect(container.textContent).toContain("Ada");
    expect(container.textContent).toContain("Look here");

    act(() => {
      fireEvent.click(getByText("Look here"));
    });
    expect(editor.selectedAnnotation).toBe(id);
    editor.dispose();
  });
});

describe("CommentsPopover thread actions", () => {
  const mountWithOpenThread = () => {
    const editor = mountEditor();
    editor.setCommentAuthor({ id: "u1", name: "Ada" });
    const id = editor.addAnnotation({ position: { x: 10, y: 10 }, firstComment: "First" });
    // addAnnotation already selects it, so the popover renders.
    const view = render(
      <DiagramProvider editor={editor}>
        <CommentsPopover />
      </DiagramProvider>,
    );
    return { editor, id, ...view };
  };

  it("renders nothing when no thread is selected", () => {
    const editor = mountEditor();
    const { container } = render(
      <DiagramProvider editor={editor}>
        <CommentsPopover />
      </DiagramProvider>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    editor.dispose();
  });

  it("adds a reply through the input + Send", () => {
    const { editor, id, container } = mountWithOpenThread();
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    const send = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    // Send is disabled while the draft is empty.
    expect(send.disabled).toBe(true);

    act(() => {
      fireEvent.change(input, { target: { value: "A reply" } });
    });
    expect(send.disabled).toBe(false);
    act(() => {
      fireEvent.click(send);
    });
    const thread = editor.scene.annotations.get(id)?.thread ?? [];
    expect(thread.length).toBe(2);
    expect(thread[1]?.body).toBe("A reply");
    // Draft cleared after send.
    expect(input.value).toBe("");
    editor.dispose();
  });

  it("resolves and reopens the thread", () => {
    const { editor, id, getByText } = mountWithOpenThread();
    expect(editor.scene.annotations.get(id)?.resolved).toBeFalsy();
    act(() => {
      fireEvent.click(getByText("Resolve"));
    });
    expect(editor.scene.annotations.get(id)?.resolved).toBe(true);
    act(() => {
      fireEvent.click(getByText("Reopen"));
    });
    expect(editor.scene.annotations.get(id)?.resolved).toBe(false);
    editor.dispose();
  });

  it("deletes a comment from the thread", () => {
    const { editor, id, container } = mountWithOpenThread();
    editor.addComment(id, "Second");
    const del = container.querySelector('button[aria-label="Delete comment"]') as HTMLButtonElement;
    act(() => {
      fireEvent.click(del);
    });
    // One of the two comments removed.
    expect(editor.scene.annotations.get(id)?.thread.length).toBe(1);
    editor.dispose();
  });

  it("deletes the whole thread", () => {
    const { editor, id, container } = mountWithOpenThread();
    const del = container.querySelector('button[aria-label="Delete thread"]') as HTMLButtonElement;
    act(() => {
      fireEvent.click(del);
    });
    expect(editor.scene.annotations.has(id)).toBe(false);
    editor.dispose();
  });

  it("closes the popover via the close button", () => {
    const { editor, container } = mountWithOpenThread();
    const close = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    act(() => {
      fireEvent.click(close);
    });
    expect(editor.selectedAnnotation).toBeNull();
    editor.dispose();
  });
});
