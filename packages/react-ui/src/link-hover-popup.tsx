import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";
import type { Bounds } from "@oh-just-another/types";
import { useDiagramOptional } from "./hooks.js";

/**
 * Hover link popup. When the pointer is over an element that carries a
 * (safe) `href`, a small chip appears above it showing the URL and an
 * open button. The pointer can move onto the chip to click it; it closes
 * after a short grace once the pointer leaves both the element and the
 * chip. Hidden while editing text.
 *
 * Reads the hovered link via `editor.linkAt(worldPoint)` on host
 * `pointermove`; positions itself in screen space from the element's
 * world bounds and viewport. Portaled to `document.body`.
 *
 * Opening also works via Cmd/Ctrl-click on the element (state layer).
 */
const CLOSE_GRACE_MS = 220;

export const LinkHoverPopup = () => {
  const editor = useDiagramOptional();
  const [hover, setHover] = useState<{ href: string; bounds: Bounds } | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const overPopup = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return undefined;
    const host = editor.hostElement as HTMLElement | null;
    if (!host) return undefined;

    const clearClose = () => {
      if (closeTimer.current !== null) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
    const scheduleClose = () => {
      clearClose();
      closeTimer.current = setTimeout(() => {
        if (!overPopup.current) setHover(null);
      }, CLOSE_GRACE_MS);
    };

    const onMove = (ev: PointerEvent) => {
      if (editor.editingTextElement !== null) {
        setHover(null);
        return;
      }
      const rect = host.getBoundingClientRect();
      const world = editor.screenToWorld({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
      const link = editor.linkAt(world);
      if (link) {
        clearClose();
        setHover({ href: link.href, bounds: link.bounds });
      } else if (!overPopup.current) {
        scheduleClose();
      }
    };
    const onLeave = () => { scheduleClose(); };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    // Follow pan / zoom while the popup is open.
    const off = editor.on("change", () => { bump(); });
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      off();
      clearClose();
    };
  }, [editor]);

  if (!editor || !hover) return null;
  const host = editor.hostElement as HTMLElement | null;
  if (!host) return null;

  // World bounds → screen (top-centre of the element), then offset by the
  // host's client rect so the body-portaled chip lands in the right place.
  const v = editor.scene.viewport;
  const hostRect = host.getBoundingClientRect();
  const sx = (hover.bounds.x - v.pan.x) * v.zoom + hostRect.left;
  const sy = (hover.bounds.y - v.pan.y) * v.zoom + hostRect.top;
  const sw = hover.bounds.width * v.zoom;

  const display = hover.href.replace(/^mailto:/, "").replace(/^https?:\/\//, "");

  return createPortal(
    <div
      className="du-link-popup"
      style={{ position: "fixed", left: sx + sw / 2, top: sy, transform: "translate(-50%, -100%)" }}
      onPointerEnter={() => {
        overPopup.current = true;
      }}
      onPointerLeave={() => {
        overPopup.current = false;
        setHover(null);
      }}
    >
      <a
        className="du-link-popup-url"
        href={hover.href}
        title={hover.href}
        onClick={(ev) => {
          ev.preventDefault();
          editor.openLink(hover.href);
        }}
      >
        <span className="du-link-popup-text">{display}</span>
        <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
      </a>
    </div>,
    document.body,
  );
};
