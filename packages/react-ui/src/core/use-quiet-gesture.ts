import { useEffect, useRef, useState } from "react";
import type { Editor } from "@oh-just-another/state";
import { GESTURE_QUIET_MS } from "./constants.js";

/**
 * `true` while no element gesture (move / resize / rotate — anything
 * running through the editor's gesture transaction or element drag — or
 * a library drag-to-place) is active, plus a `GESTURE_QUIET_MS` settle delay after it ends. The
 * floating selection toolbar hides while this is `false`: repositioning
 * it (floating-ui autoUpdate + a React re-render of the whole property
 * toolbar) on every frame of a drag makes the element visibly lag.
 */
export const useQuietGesture = (editor: Editor | null): boolean => {
  const [quiet, setQuiet] = useState(true);
  const quietRef = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Scene identity at gesture start. A press alone (`dragElementId` is
  // set on pointer-DOWN) must not hide the toolbar — a plain
  // click-select would blink it. Only a gesture that actually CHANGED
  // the scene (moved / resized / rotated something) counts.
  const gestureBaseScene = useRef<Editor["scene"] | null>(null);

  useEffect(() => {
    if (!editor) return undefined;
    const off = editor.on("change", () => {
      // A library placement is a drag from its first frame — no press-only
      // phase to wait out, hide at once.
      const placing = editor.placementId !== null;
      const active = placing || editor.gestureTx !== null || editor.dragElementId !== null;
      if (active) {
        gestureBaseScene.current ??= editor.scene;
        if (!placing && editor.scene === gestureBaseScene.current) return; // press, no movement yet
        if (timer.current !== null) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        if (quietRef.current) {
          quietRef.current = false;
          setQuiet(false);
        }
      } else if (gestureBaseScene.current !== null || !quietRef.current) {
        gestureBaseScene.current = null;
        if (quietRef.current || timer.current !== null) return;
        // Gesture over — reappear after the settle delay.
        timer.current = setTimeout(() => {
          timer.current = null;
          quietRef.current = true;
          setQuiet(true);
        }, GESTURE_QUIET_MS);
      }
    });
    return () => {
      off();
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [editor]);

  return quiet;
};
