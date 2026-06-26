"use client";

import { useRef } from "react";
import { Editor, type EditorAPI } from "@oh-just-another/editor";
// The toolbar / panels / menus are styled by this stylesheet.
import "@oh-just-another/react-ui/styles.css";

/**
 * Client-only editor wrapper. The editor uses canvas / WASM / Web Workers, so
 * it can't render on the server — the page loads this with `ssr: false`.
 */
export default function Diagram() {
  const ref = useRef<EditorAPI>(null);

  return (
    <Editor
      ref={ref}
      style={{ position: "fixed", inset: 0 }}
      theme="system"
      grid={{ enabled: true }}
      snap
      onSceneChange={(scene) => {
        console.log("scene changed", scene.elements.size, "elements");
      }}
    />
  );
}
