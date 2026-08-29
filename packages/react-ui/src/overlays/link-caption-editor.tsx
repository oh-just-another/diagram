import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDiagramOptional } from "../core/hooks.js";
import { usePortalContainer } from "../core/portal-container.js";
import { LINK_CAPTION_EDITOR_MAX_ROWS } from "../core/constants.js";

/**
 * Inline editor for a link's caption. Opens on double-click of a link
 * (state layer sets `editor.editingLinkCaption`). Renders a small multiline
 * textarea at the link's label anchor. Enter / blur commits, Shift+Enter
 * inserts a newline, Escape cancels. Empty text removes the label. Portaled.
 */
export const LinkCaptionEditor = () => {
  const editor = useDiagramOptional();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (!editor) return undefined;
    return editor.on("change", () => {
      bump();
    });
  }, [editor]);

  const editingId = editor?.editingLinkCaption ?? null;

  // Seed the field and focus whenever a new caption edit begins.
  useEffect(() => {
    if (!editor || editingId === null) return;
    const edge = editor.scene.links.get(editingId);
    setValue(edge?.label?.text ?? "");
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => {
      clearTimeout(t);
    };
  }, [editor, editingId]);

  if (!editor || editingId === null) return null;
  const host = editor.hostElement as HTMLElement | null;
  if (!host) return null;
  const world = editor.linkLabelWorld(editingId);
  if (!world) return null;

  const v = editor.scene.viewport;
  const hostRect = host.getBoundingClientRect();
  const sx = (world.x - v.pan.x) * v.zoom + hostRect.left;
  const sy = (world.y - v.pan.y) * v.zoom + hostRect.top;

  const commit = () => {
    editor.commitLinkCaptionEdit(value);
  };

  // Grow with the content: one visual row per line, capped so a long caption
  // doesn't cover half the canvas while being edited.
  const rows = Math.min(LINK_CAPTION_EDITOR_MAX_ROWS, value.split("\n").length);

  return createPortal(
    <textarea
      ref={inputRef}
      className="du-link-caption-input"
      value={value}
      placeholder="Label"
      rows={rows}
      style={{
        position: "fixed",
        left: sx,
        top: sy,
        transform: "translate(-50%, -50%)",
        zIndex: "calc(var(--du-z-popover) + 2)",
      }}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          editor.cancelLinkCaptionEdit();
        }
        e.stopPropagation();
      }}
    />,
    portalContainer,
  );
};
