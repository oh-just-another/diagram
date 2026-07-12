import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import "@oh-just-another/react-ui/styles.css";

/**
 * Configurable live-editor embed for the Examples section.
 *
 * Extends the landing page's `LiveEditor` idea with the knobs the example
 * pages demonstrate: arbitrary `<Editor>` props (`editorProps`), a scene
 * sourced from a Mermaid string (`mermaid`, run through
 * `@oh-just-another/importers`), a scene fetched from a static JSON file
 * (`sceneUrl`, parsed by `@oh-just-another/serialization`), and a `readOnly`
 * switch applied through the engine once it is ready.
 *
 * Everything browser-only loads via dynamic `import()` inside an effect so
 * the static (SSR) build never executes it.
 */
export default function ExampleEditor({
  height = "420px",
  editorProps,
  mermaid,
  sceneUrl,
  readOnly = false,
}: {
  height?: string;
  editorProps?: Record<string, unknown>;
  mermaid?: string;
  sceneUrl?: string;
  readOnly?: boolean;
}): ReactNode {
  const [Editor, setEditor] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [scene, setScene] = useState<unknown>(undefined);
  const [sceneReady, setSceneReady] = useState(!mermaid && !sceneUrl);
  const resolvedSceneUrl = useBaseUrl(sceneUrl ?? "/");

  useEffect(() => {
    let alive = true;
    void import("@oh-just-another/editor").then((mod) => {
      if (alive) setEditor(() => mod.Editor as ComponentType<Record<string, unknown>>);
    });
    if (mermaid) {
      void import("@oh-just-another/importers").then((mod) => {
        if (!alive) return;
        setScene(mod.importMermaid(mermaid));
        setSceneReady(true);
      });
    } else if (sceneUrl) {
      void Promise.all([import("@oh-just-another/serialization"), fetch(resolvedSceneUrl)]).then(
        async ([ser, res]) => {
          const json = await res.text();
          if (!alive) return;
          setScene(ser.parseScene(json));
          setSceneReady(true);
        },
      );
    }
    return () => {
      alive = false;
    };
    // Intentionally mount-only: the example knobs are static per page.
  }, []);

  return (
    <div
      style={{
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: "8px",
        border: "1px solid var(--ifm-color-emphasis-300)",
        marginBottom: "1rem",
      }}
    >
      {Editor && sceneReady ? (
        <Editor
          {...(scene !== undefined ? { initialScene: scene } : {})}
          {...(readOnly
            ? {
                onReady: (engine: { setReadOnly: (on: boolean) => void }) => {
                  engine.setReadOnly(true);
                },
              }
            : {})}
          {...editorProps}
        />
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
