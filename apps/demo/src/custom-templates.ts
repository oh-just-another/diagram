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
