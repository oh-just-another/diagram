import { useEffect, useReducer } from "react";
import { createPortal } from "react-dom";
import { defaultRegistry, type Template } from "@oh-just-another/templates";
import { useDiagramOptional } from "./hooks.js";

/**
 * Shape picker shown after a link is dropped on empty canvas. The
 * dropped link keeps a free end; picking a shape here creates it at the
 * drop point and re-points the link end to it (one undo step).
 * Dismissing (Esc / click-away) leaves the free-ended link.
 *
 * Reuses the global template registry's `basic` category — same
 * factories and icons as the main palette. Positioned in screen space
 * from the drop world-point and viewport, portaled to body.
 */
export const LinkDropShapeMenu = () => {
  const editor = useDiagramOptional();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!editor) return undefined;
    // Reflect open/close and follow pan/zoom while open.
    const off = editor.on("change", () => {
      bump();
    });
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && editor.linkDropMenu) editor.dismissLinkDropMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, [editor]);

  if (!editor) return null;
  const menu = editor.linkDropMenu;
  if (!menu) return null;
  const host = editor.hostElement as HTMLElement | null;
  if (!host) return null;

  const v = editor.scene.viewport;
  const hostRect = host.getBoundingClientRect();
  const sx = (menu.world.x - v.pan.x) * v.zoom + hostRect.left;
  const sy = (menu.world.y - v.pan.y) * v.zoom + hostRect.top;

  const templates: readonly Template[] = defaultRegistry.byCategory("basic");

  return createPortal(
    <>
      {/* Click-away catcher — dismiss, leaving the free-ended link. */}
      <div
        className="du-link-drop-backdrop"
        style={{ position: "fixed", inset: 0, zIndex: 1600 }}
        onPointerDown={() => {
          editor.dismissLinkDropMenu();
        }}
      />
      <div
        className="du-link-drop-menu"
        role="menu"
        aria-label="Create shape"
        style={{
          position: "fixed",
          left: sx,
          top: sy,
          transform: "translate(-50%, -100%)",
          zIndex: 1601,
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
      >
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className="du-link-drop-item"
            title={t.name}
            aria-label={`Create ${t.name}`}
            onClick={() => {
              editor.placeShapeAtLinkDrop((ctx) => t.factory(ctx));
            }}
            dangerouslySetInnerHTML={{ __html: t.icon }}
          />
        ))}
      </div>
    </>,
    document.body,
  );
};
