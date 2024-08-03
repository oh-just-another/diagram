import { useMemo } from "react";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { shapeId } from "@oh-just-another/types";
import {
  defaultRegistry,
  installBuiltinTemplates,
  loadTemplateLibrary,
} from "@oh-just-another/templates";
import {
  DiagramRoot,
  DiagramSurface,
  Palette,
  PropertyPanel,
  Toolbar,
  usePaletteDropHandler,
} from "@oh-just-another/react-ui";

// One-time template setup.
let installed = false;
const setupTemplates = () => {
  if (installed) return;
  installBuiltinTemplates();
  loadTemplateLibrary(
    {
      format: "oh-just-another/template-library",
      version: 1,
      templates: [
        {
          id: "demo.welcome",
          name: "Welcome",
          category: "custom",
          icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>',
          blueprint: {
            type: "rectangle",
            style: { fill: "#1a73e8", stroke: "#1a40b0", strokeWidth: 2 },
            width: 200,
            height: 100,
          },
        },
      ],
    },
    defaultRegistry,
  );
  installed = true;
};

const initialScene = (): Scene => {
  let s = emptyScene();
  s = { ...s, viewport: { ...s.viewport, size: { width: 800, height: 600 } } };
  const rect: Shape = {
    id: shapeId("seed-rect"),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 80, y: 80 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#cfe1ff", stroke: "#1a40b0", strokeWidth: 2 },
    width: 200,
    height: 120,
  };
  const ellipse: Shape = {
    id: shapeId("seed-ellipse"),
    layerId: DEFAULT_LAYER_ID,
    type: "ellipse",
    position: { x: 360, y: 220 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(rect.order, null),
    style: { fill: "#fff2a8", stroke: "#b18a00", strokeWidth: 2 },
    width: 200,
    height: 140,
  };
  ({ scene: s } = addShape(s, rect));
  ({ scene: s } = addShape(s, ellipse));
  return s;
};

export const App = () => {
  setupTemplates();
  const scene = useMemo(initialScene, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        <h1 style={{ fontSize: 13, fontWeight: 500, color: "#888", margin: 0 }}>
          react-ui playground
        </h1>
      </header>

      <DiagramRoot initialScene={scene} initialMode="select">
        <main style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <Palette style={{ flex: "0 0 200px" }} />
          <CanvasArea />
          <PropertyPanel style={{ flex: "0 0 240px" }} />
        </main>
      </DiagramRoot>
    </div>
  );
};

/** Canvas surface + floating toolbar. */
const CanvasArea = () => {
  const onDrop = usePaletteDropHandler();
  return (
    <section
      onDragEnter={(ev) => {
        if (ev.dataTransfer.types.includes("application/x-template-id")) ev.preventDefault();
      }}
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes("application/x-template-id")) {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={onDrop}
      style={{
        flex: 1,
        position: "relative",
        background: "#fff",
        minHeight: 0,
      }}
    >
      <DiagramSurface />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#1a1a1a",
          padding: "4px 6px",
          borderRadius: 6,
          border: "1px solid #2a2a2a",
        }}
      >
        <Toolbar />
      </div>
    </section>
  );
};
