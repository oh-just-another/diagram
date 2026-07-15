import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import "@oh-just-another/react-ui/styles.css";

/**
 * Working demo for the "driving the editor" example: a few host buttons that
 * mutate the live engine through the same public surface any host app would
 * use — `EditorAPI.setActiveTool`, the `editor` escape hatch for scene
 * operations, and `zoomToFit`.
 */
export default function DrivingDemo({ height = "780px" }: { height?: string }): ReactNode {
  const [Editor, setEditor] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const ref = useRef<{
    setActiveTool: (tool: string) => void;
    zoomToFit: () => void;
    editor: {
      addElement: (el: unknown) => void;
      scene: { elements: ReadonlyMap<string, unknown> };
    } | null;
  } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    void import("@oh-just-another/editor").then((mod) => {
      if (alive) setEditor(() => mod.Editor as ComponentType<Record<string, unknown>>);
    });
    return () => {
      alive = false;
    };
  }, []);

  const addRectangleTo = async (engine: { addElement: (el: unknown) => void }) => {
    const { orderBetween, DEFAULT_LAYER_ID } = await import("@oh-just-another/scene");
    const { elementId } = await import("@oh-just-another/types");
    const n = seq.current++;
    engine.addElement({
      id: elementId(`docs-rect-${String(n)}`),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 80 + (n % 5) * 150, y: 80 + Math.floor(n / 5) * 110 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: { fill: "#dbeafe", stroke: "#1d4ed8" },
      width: 120,
      height: 80,
    });
  };

  const addRectangle = async () => {
    const engine = ref.current?.editor;
    if (engine) await addRectangleTo(engine);
  };

  // Seed the canvas through the same public surface the buttons use — the
  // starting content is itself "driven from code".
  const seed = async (engine: { addElement: (el: unknown) => void }) => {
    await addRectangleTo(engine);
    await addRectangleTo(engine);
    await addRectangleTo(engine);
  };

  const button = (label: string, onClick: () => void) => (
    <button
      type="button"
      className="button button--secondary button--sm"
      style={{ marginRight: 8 }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ marginBottom: 8 }}>
        {button("Add rectangle", () => void addRectangle())}
        {button("Link tool", () => ref.current?.setActiveTool("draw-edge"))}
        {button("Zoom to fit", () => ref.current?.zoomToFit())}
      </div>
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
          <Editor
            ref={ref}
            onReady={(engine: { addElement: (el: unknown) => void }) => void seed(engine)}
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
    </div>
  );
}
