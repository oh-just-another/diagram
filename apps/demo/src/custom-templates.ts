import type { TemplateLibrarySpec } from "@oh-just-another/templates";

/**
 * Example of a *programmatically* imported template library — the kind of
 * JSON a user could ship in a `.json` file. In a real editor we'd resolve it
 * from a `<input type=file>` or a URL; here it's just inlined so the demo
 * runs without external assets.
 *
 * Once (rich templates) lands, the same `loadTemplateLibrary` entry
 * point will accept the richer node-tree blueprint.
 */
export const CUSTOM_TEMPLATES: TemplateLibrarySpec = {
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
   id: "custom.star",
   name: "Star",
   category: "custom",
   icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2 L14.5 8.5 L21 9 L16 14 L17.5 21 L12 17 L6.5 21 L8 14 L3 9 L9.5 8.5 Z"/></svg>',
   blueprint: {
    type: "polygon",
    style: { fill: "#fff3a8", stroke: "#b18a00", strokeWidth: 2 },
    // 5-pointed star centered at (50, 50) with outer radius 50 / inner 22.
    points: starPoints(5, 50, 50, 50, 22, -Math.PI / 2),
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
  // --- Rich templates () ---
  {
   id: "custom.swimlane",
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
    defaults: { title: "Swim-lane", hint: "Drop a shape here" },
    root: {
     type: "container",
     id: "lane",
     style: { fill: "#ffffff", stroke: "#2f7a2f", strokeWidth: 2 },
     layout: { flexDirection: "column", padding: 0, width: 360, height: 200 },
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
  {
   id: "custom.task-card",
   name: "Task card",
   category: "rich",
   icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="14" y2="13"/></svg>',
   blueprint: {
    type: "template",
    width: 260,
    height: 120,
    // Resize constraints — keep children visible at all times.
    minWidth: 260,
    minHeight: 120,
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
     style: {
      fill: "#efffe2",
      stroke: "#1a73e8",
      strokeWidth: 1.5,
     },
     layout: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      gap: 12,
      width: 220,
      height: 96,
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
 ],
};

function starPoints(
 count: number,
 cx: number,
 cy: number,
 outer: number,
 inner: number,
 startAngle: number,
): { x: number; y: number }[] {
 const out: { x: number; y: number }[] = [];
 const step = Math.PI / count;
 for (let i = 0; i < count * 2; i++) {
  const r = i % 2 === 0 ? outer : inner;
  const angle = startAngle + i * step;
  out.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
 }
 return out;
}
