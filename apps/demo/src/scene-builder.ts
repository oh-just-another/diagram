import { layerId, shapeId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderForTop,
  resize,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";

/**
 * Builds a sample scene exercising every built-in shape type. The scene is
 * laid out roughly in a 3-column grid so a human can eyeball that each kind
 * draws correctly.
 */
export const buildSampleScene = (width: number, height: number): Scene => {
  let scene = emptyScene();
  const orders: string[] = [];
  const nextOrder = () => {
    const o = orderForTop(orders as never);
    orders.push(o);
    return o as never;
  };

  const shapes: Shape[] = [
    {
      id: shapeId("rect-1"),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 80, y: 80 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      style: { fill: "#4f80ff", stroke: "#1a40b0", strokeWidth: 2 },
      width: 180,
      height: 100,
    },
    {
      id: shapeId("rect-2"),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 340, y: 80 },
      rotation: Math.PI / 12,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      style: { fill: "#ffd14f", stroke: "#a07a00", strokeWidth: 3 },
      width: 160,
      height: 100,
    },
    {
      id: shapeId("ellipse-1"),
      layerId: DEFAULT_LAYER_ID,
      type: "ellipse",
      position: { x: 600, y: 80 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      style: { fill: "#ff6b6b", opacity: 0.85 },
      width: 220,
      height: 110,
    },
    {
      id: shapeId("ellipse-2"),
      layerId: DEFAULT_LAYER_ID,
      type: "ellipse",
      position: { x: 80, y: 230 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      style: { stroke: "#222", strokeWidth: 2, dashArray: [6, 4] },
      width: 180,
      height: 80,
    },
    {
      id: shapeId("polygon-1"),
      layerId: DEFAULT_LAYER_ID,
      type: "polygon",
      position: { x: 360, y: 230 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      style: { fill: "#3ec47a", stroke: "#1f6c40", strokeWidth: 2 },
      points: [
        { x: 60, y: 0 },
        { x: 120, y: 50 },
        { x: 95, y: 110 },
        { x: 25, y: 110 },
        { x: 0, y: 50 },
      ],
    },
    {
      id: shapeId("path-1"),
      layerId: DEFAULT_LAYER_ID,
      type: "path",
      position: { x: 600, y: 230 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      style: { stroke: "#8a4dff", strokeWidth: 3 },
      commands: [
        { kind: "M", to: { x: 0, y: 80 } },
        { kind: "Q", control: { x: 60, y: -20 }, to: { x: 120, y: 80 } },
        { kind: "Q", control: { x: 180, y: 180 }, to: { x: 240, y: 80 } },
      ],
    },
    {
      id: shapeId("text-1"),
      layerId: DEFAULT_LAYER_ID,
      type: "text",
      position: { x: 80, y: 380 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      text: "Hello, world!",
      fontFamily: "system-ui, sans-serif",
      fontSize: 32,
      style: { fill: "#222" },
    },
    {
      id: shapeId("text-2"),
      layerId: DEFAULT_LAYER_ID,
      type: "text",
      position: { x: 80, y: 440 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      text: "This text wraps at 360 CSS pixels and spans multiple lines, demonstrating wrapText.",
      fontFamily: "system-ui, sans-serif",
      fontSize: 14,
      maxWidth: 360,
      style: { fill: "#555" },
    },
    {
      id: shapeId("rect-3"),
      layerId: layerId("default"),
      type: "rectangle",
      position: { x: 520, y: 400 },
      rotation: -Math.PI / 16,
      scale: { x: 1.2, y: 1.2 },
      order: nextOrder(),
      style: {
        fill: "rgba(80, 200, 200, 0.4)",
        stroke: "#0a8a8a",
        strokeWidth: 2,
        lineJoin: "round",
      },
      width: 220,
      height: 120,
    },
  ];

  for (const s of shapes) {
    ({ scene } = addShape(scene, s));
  }

  return { ...scene, viewport: resize(scene.viewport, width, height) };
};
