import {
  defaultRegistry,
  installBuiltinTemplates,
  loadTemplateLibrary,
  rich,
} from "@oh-just-another/templates";
import { registerInteractiveHitTester } from "@oh-just-another/state";

/**
 * One-time global template setup. Installs the 12 built-in basic +
 * flowchart presets, registers the rich-template shape renderer + hit
 * tester (so `type: "template"` shapes draw and accept button taps), then
 * loads a few hand-crafted custom + rich examples so the palette
 * demonstrates every category out of the box.
 */
let installed = false;
export const setupTemplates = (): void => {
  if (installed) return;
  installBuiltinTemplates();
  // `installBuiltinRenderers()` registers draw functions for the 6 built-in
  // shape types (rect/ellipse/polygon/path/text/image). Rich templates
  // introduce a 7th type (`"template"`) — register its renderer + bounder
  // and the interactive hit-tester here so Task-card / Swim-lane render
  // and react to clicks.
  rich.installTemplateShapeRenderer();
  registerInteractiveHitTester("template", rich.templateInteractiveHitTester);
  loadTemplateLibrary(
    {
      format: "oh-just-another/template-library",
      version: 1,
      templates: [
        {
          id: "custom.cloud",
          name: "Cloud",
          category: "custom",
          icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 18 a4 4 0 0 1 -1.2 -7.85 a5 5 0 0 1 9.7 -1.65 a4.5 4.5 0 0 1 4.5 4.5 a4 4 0 0 1 -4 5"/></svg>',
          blueprint: {
            type: "path",
            style: { fill: "#e0f0ff", stroke: "#3b82f6", strokeWidth: 2 },
            commands: [
              { kind: "M", to: { x: 30, y: 60 } },
              { kind: "Q", control: { x: 0, y: 60 }, to: { x: 10, y: 35 } },
              { kind: "Q", control: { x: 20, y: 10 }, to: { x: 50, y: 18 } },
              { kind: "Q", control: { x: 70, y: 0 }, to: { x: 95, y: 20 } },
              { kind: "Q", control: { x: 130, y: 25 }, to: { x: 125, y: 50 } },
              { kind: "Q", control: { x: 130, y: 75 }, to: { x: 100, y: 75 } },
              { kind: "L", to: { x: 30, y: 75 } },
              { kind: "Q", control: { x: 5, y: 75 }, to: { x: 30, y: 60 } },
              { kind: "Z" },
            ],
          },
        },
        {
          id: "custom.callout",
          name: "Callout",
          category: "custom",
          icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 4 H20 V14 H12 L8 20 L8 14 H4 Z"/></svg>',
          blueprint: {
            type: "polygon",
            style: { fill: "#fff", stroke: "#444", strokeWidth: 1.5 },
            points: [
              { x: 0, y: 0 },
              { x: 160, y: 0 },
              { x: 160, y: 70 },
              { x: 60, y: 70 },
              { x: 30, y: 100 },
              { x: 30, y: 70 },
              { x: 0, y: 70 },
            ],
          },
        },
        // --- Rich templates ---
        {
          id: "rich.task-card",
          name: "Task card",
          category: "rich",
          icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="14" y2="13"/></svg>',
          blueprint: {
            type: "template",
            width: 260,
            height: 120,
            minWidth: 220,
            minHeight: 100,
            maxWidth: 600,
            maxHeight: 240,
            noFlip: true,
            defaults: {
              title: "New task",
              subtitle: "Click the button to log an action",
              icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-5"/></svg>',
              buttonLabel: "Action",
            },
            root: {
              type: "container",
              id: "card",
              style: { fill: "#ffffff", stroke: "#1a73e8", strokeWidth: 1.5 },
              layout: {
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                gap: 12,
              },
              children: [
                {
                  type: "container",
                  id: "avatar",
                  style: { fill: "#1a73e8" },
                  layout: { width: 36, height: 36, alignSelf: "center", padding: 6 },
                  children: [
                    {
                      type: "icon",
                      id: "avatar-icon",
                      svg: { bind: "icon" },
                      style: { color: "#fff" },
                      layout: { flex: 1 },
                    },
                  ],
                },
                {
                  type: "container",
                  id: "body",
                  layout: { flexDirection: "column", flex: 1, gap: 4 },
                  children: [
                    {
                      type: "text",
                      id: "title",
                      text: { bind: "title" },
                      style: { color: "#222", fontSize: 14, fontWeight: "bold" },
                    },
                    {
                      type: "text",
                      id: "subtitle",
                      text: { bind: "subtitle" },
                      style: { color: "#666", fontSize: 11 },
                    },
                    {
                      type: "button",
                      id: "primary",
                      action: "task.primary",
                      label: { bind: "buttonLabel" },
                      style: {
                        fill: "#1a73e8",
                        stroke: "#1a40b0",
                        color: "#fff",
                        fontSize: 11,
                      },
                      layout: { alignSelf: "start", margin: { top: 4 } },
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          id: "rich.swimlane",
          name: "Swim-lane",
          category: "rich",
          icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
          blueprint: {
            type: "template",
            width: 360,
            height: 200,
            minWidth: 240,
            minHeight: 140,
            maxWidth: 1000,
            maxHeight: 700,
            noFlip: true,
            defaults: { title: "Swim-lane", hint: "Drop an element here" },
            root: {
              type: "container",
              id: "lane",
              style: { fill: "#ffffff", stroke: "#2f7a2f", strokeWidth: 2 },
              layout: { flexDirection: "column", padding: 0 },
              children: [
                {
                  type: "container",
                  id: "header",
                  style: { fill: "#e6ffe6", stroke: "#2f7a2f", strokeWidth: 1 },
                  layout: { padding: 8, height: 32, alignItems: "center" },
                  children: [
                    {
                      type: "text",
                      id: "title",
                      text: { bind: "title" },
                      style: { color: "#1c4a1c", fontSize: 13, fontWeight: "bold" },
                    },
                  ],
                },
                {
                  type: "drop-zone",
                  id: "lane-body",
                  label: { bind: "hint" },
                  accepts: [
                    "basic.rectangle",
                    "basic.ellipse",
                    "flowchart.process",
                    "flowchart.decision",
                  ],
                  style: { stroke: "#9ccc9c", color: "#779977", fontSize: 12 },
                  layout: { flex: 1, margin: 8 },
                },
              ],
            },
          },
        },
        // Gateway with declared ports. Three ports (in, out, err) become
        // entries in `shape.anchors`; drawing an edge near them snaps
        // automatically.
        {
          id: "rich.gateway",
          name: "Gateway",
          category: "rich",
          icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>',
          blueprint: {
            type: "template",
            width: 200,
            height: 100,
            minWidth: 160,
            minHeight: 80,
            maxWidth: 600,
            maxHeight: 400,
            noFlip: true,
            defaults: { title: "Gateway" },
            root: {
              type: "container",
              id: "gateway-root",
              style: { fill: "#fff", stroke: "#3b3b6e", strokeWidth: 2 },
              layout: { flexDirection: "column", padding: 12, alignItems: "center" },
              children: [
                {
                  type: "text",
                  id: "title",
                  text: { bind: "title" },
                  style: { fontSize: 14, fontWeight: "bold", color: "#1f1f4a" },
                },
                // Declared connection ports — Edge mode snaps to them
                // by name via the anchor + outline pipeline.
                {
                  type: "port",
                  id: "in",
                  layout: {
                    position: "spot",
                    anchor: "left",
                    anchorFocus: "center",
                  },
                },
                {
                  type: "port",
                  id: "out",
                  layout: {
                    position: "spot",
                    anchor: "right",
                    anchorFocus: "center",
                  },
                },
                {
                  type: "port",
                  id: "err",
                  layout: {
                    position: "spot",
                    anchor: "bottom",
                    anchorFocus: "center",
                    offset: { x: 0, y: 0 },
                  },
                },
              ],
            },
          },
        },
      ],
    },
    defaultRegistry,
  );

  // Auto-layout container demo. Plain rectangles tagged with
  // `metadata.autoLayout` + `metadata.container` so dragging children in
  // re-parents them (container drop) and the editor's autoLayout
  // signature-check fires `runAutoLayout` in the next microtask.
  // Rectangles (not rich templates) keep the layout pipeline visible
  // without the rich-template engine overlaying its own flex pass.
  const autoLayoutIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><rect x="6" y="6" width="5" height="5"/><rect x="13" y="6" width="5" height="5"/><rect x="6" y="13" width="5" height="5"/><rect x="13" y="13" width="5" height="5"/></svg>';
  defaultRegistry.register({
    id: "layout.auto-grid",
    name: "Auto-grid (2×N)",
    category: "layout",
    icon: autoLayoutIcon,
    factory: (ctx) => ({
      id: ctx.id,
      layerId: ctx.layerId,
      type: "rectangle",
      position: ctx.position,
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: ctx.order,
      style: { fill: "#fafbff", stroke: "#8c9bb6", strokeWidth: 1.5, dashArray: [6, 4] },
      width: 320,
      height: 200,
      metadata: {
        autoLayout: { kind: "grid", cols: 2, gap: 12 },
        container: {
          dropZone: { x: 12, y: 12, width: 296, height: 176 },
          padding: 12,
        },
      },
    }),
  });
  defaultRegistry.register({
    id: "basic.block-arrow",
    name: "Block arrow",
    category: "basic",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10v4h10v3l5-5-5-5v3z"/></svg>',
    factory: (ctx) =>
      ({
        id: ctx.id,
        layerId: ctx.layerId,
        type: "block-arrow",
        position: ctx.position,
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: ctx.order,
        style: { fill: "#cfe1ff", stroke: "#1a40b0", strokeWidth: 1.5 },
        width: 160,
        height: 80,
        direction: "right",
        headRatio: 0.4,
        bodyThickness: 0.55,
      }) as never,
  });
  defaultRegistry.register({
    id: "layout.auto-stack",
    name: "Auto-stack (H)",
    category: "layout",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="1"/><rect x="6" y="9" width="4" height="6"/><rect x="11" y="9" width="4" height="6"/><rect x="16" y="9" width="3" height="6"/></svg>',
    factory: (ctx) => ({
      id: ctx.id,
      layerId: ctx.layerId,
      type: "rectangle",
      position: ctx.position,
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: ctx.order,
      style: { fill: "#f7fbf7", stroke: "#7aa07a", strokeWidth: 1.5, dashArray: [6, 4] },
      width: 360,
      height: 100,
      metadata: {
        autoLayout: { kind: "stack", direction: "horizontal", gap: 10 },
        container: {
          dropZone: { x: 10, y: 10, width: 340, height: 80 },
          padding: 10,
        },
      },
    }),
  });

  installed = true;
};
