import { useEffect, useRef, useState } from "react";
import type { Editor } from "@oh-just-another/state";
import { VIEWPORT_QUIET_MS } from "./constants.js";

/**
 * `true` while the viewport has been still for `VIEWPORT_QUIET_MS`.
 * DOM overlays anchored to canvas coordinates (link badges, sticky
 * reactions) hide while this is `false`: re-rendering them on every
 * pan/zoom frame made React reconciliation a per-frame cost on the main
 * thread. They pop back in as soon as the camera settles.
 */
export const useQuietViewport = (editor: Editor | null): boolean => {
  const [quiet, setQuiet] = useState(true);
  const last = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return undefined;
    const off = editor.on("change", () => {
      const v = editor.scene.viewport;
      const prev = last.current;
      last.current = { x: v.pan.x, y: v.pan.y, zoom: v.zoom };
      if (prev?.x === v.pan.x && prev.y === v.pan.y && prev.zoom === v.zoom) return;
      if (prev === null) return; // first observation — nothing moved yet
      setQuiet(false);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setQuiet(true);
      }, VIEWPORT_QUIET_MS);
    });
    return () => {
      off();
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [editor]);

  return quiet;
};
