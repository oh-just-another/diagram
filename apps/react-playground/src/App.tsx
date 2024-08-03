import { useMemo } from "react";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import {
  defaultRegistry,
  installBuiltinTemplates,
  loadTemplateLibrary,
} from "@oh-just-another/templates";
import {
  DiagramCanvas,
  Palette,
  PropertyPanel,
  Toolbar,
  usePaletteDropHandler,
} from "@oh-just-another/react-ui";

// One-time setup: install built-in templates (only on first import).
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
  const s = emptyScene();
  return { ...s, viewport: { ...s.viewport, size: { width: 800, height: 600 } } };
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

      <main style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <DiagramCanvas
          initialScene={scene}
          initialMode="select"
          style={{ flex: 1, minHeight: 0, position: "relative" }}
        >
          <PlaygroundLayout />
        </DiagramCanvas>
      </main>
    </div>
  );
};

/**
 * Renders inside `<DiagramCanvas>`'s `<DiagramProvider>`. We use absolute
 * positioning to layer toolbar / palette / property panel over the canvas
 * host, since `DiagramCanvas` itself fills its parent.
 */
const PlaygroundLayout = () => {
  const onDrop = usePaletteDropHandler();
  return (
    <>
      <div
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
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", height: "100%", pointerEvents: "auto" }}>
          <Palette style={{ pointerEvents: "auto" }} />
          {/* spacer takes drop events but doesn't block canvas interactions */}
          <div
            style={{
              flex: 1,
              pointerEvents: "none",
            }}
          />
          <PropertyPanel style={{ pointerEvents: "auto" }} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "auto",
          background: "#1a1a1a",
          padding: "4px 6px",
          borderRadius: 6,
          border: "1px solid #2a2a2a",
        }}
      >
        <Toolbar />
      </div>
    </>
  );
};
