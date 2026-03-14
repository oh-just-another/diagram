import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDiagramOptional } from "./hooks.js";

/**
 * Inline editor for a link's caption. Opens on double-click of a link
 * (state layer sets `editor.editingLinkCaption`). Renders a small input at
 * the link's label point (midpoint of its path). Enter / blur commits,
 * Escape cancels. Empty text removes the label. Portaled to body.
 */
export const LinkCaptionEditor = () => {
  const editor = useDiagramOptional();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editor) return undefined;
    return editor.on("change", () => { bump(); });
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
    return () => { clearTimeout(t); };
  }, [editor, editingId]);

  if (!editor || editingId === null) return null;
  const host = editor.hostElement;
  if (!host) return null;
  const world = editor.linkLabelWorld(editingId);
  if (!world) return null;

  const v = editor.scene.viewport;
  const hostRect = host.getBoundingClientRect();
  const sx = (world.x - v.pan.x) * v.zoom + hostRect.left;
  const sy = (world.y - v.pan.y) * v.zoom + hostRect.top;

  const commit = () => { editor.commitLinkCaptionEdit(value); };

  return createPortal(
    <input
      ref={inputRef}
      className="du-link-caption-input"
      value={value}
      placeholder="Label"
      style={{
        position: "fixed",
        left: sx,
        top: sy,
        transform: "translate(-50%, -50%)",
        zIndex: 1602,
      }}
      onChange={(e) => { setValue(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          editor.cancelLinkCaptionEdit();
        }
        e.stopPropagation();
      }}
    />,
    document.body,
  );
};
