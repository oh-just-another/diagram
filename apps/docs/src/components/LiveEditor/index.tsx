import { useEffect, useState, type ComponentType, type ReactNode } from "react";
// Global stylesheet for the editor chrome. A plain CSS import is SSR-safe
// (webpack extracts it; no browser code runs), so it stays at module scope.
import "@oh-just-another/react-ui/styles.css";

type EditorComponent = ComponentType<{ repositoryUrl?: string | null }>;

/**
 * Mounts the real `<Editor>` from `@oh-just-another/editor` inside the docs.
 *
 * The editor touches browser-only APIs (canvas / WebGL / `window`), so the
 * module is loaded with a dynamic `import()` inside an effect — it never runs
 * during the static (SSR) build, and the `import` resolves the package's ESM
 * `exports` condition. Until it loads, a fallback fills the space.
 */
export default function LiveEditor({ height = "70vh" }: { height?: string }): ReactNode {
  const [Editor, setEditor] = useState<EditorComponent | null>(null);

  useEffect(() => {
    let alive = true;
    void import("@oh-just-another/editor").then((mod) => {
      if (alive) setEditor(() => mod.Editor as EditorComponent);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      style={{
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: "8px",
        border: "1px solid var(--ifm-color-emphasis-300)",
      }}
    >
      {Editor ? (
        <Editor repositoryUrl="https://github.com/oh-just-another/diagram" />
      ) : (
        <div
          style={{
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "var(--ifm-color-emphasis-600)",
          }}
        >
          Loading the editor…
        </div>
      )}
    </div>
  );
}
