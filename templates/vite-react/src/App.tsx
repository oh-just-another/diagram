import { useRef } from "react";
import { Editor, type EditorAPI } from "@oh-just-another/editor";
// The toolbar / panels / menus are styled by this stylesheet — import it once.
import "@oh-just-another/react-ui/styles.css";

export function App() {
  const ref = useRef<EditorAPI>(null);

  return (
    <Editor
      ref={ref}
      style={{ position: "fixed", inset: 0 }}
      theme="system"
      grid={{ enabled: true }}
      snap
      onReady={(editor) => {
        console.log("editor ready", editor);
      }}
      onSceneChange={(scene) => {
        // Persist `scene` however you like (localStorage, server, …).
        console.log("scene changed", scene.elements.size, "elements");
      }}
    />
  );
}
