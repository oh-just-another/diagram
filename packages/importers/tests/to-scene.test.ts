import { describe, expect, it } from "vitest";
import { importDot, importDrawio, importMermaid } from "../src/index";

describe("importMermaid", () => {
  it("produces a scene with one shape per node + label + an edge", () => {
    const scene = importMermaid("flowchart TD\nA[Start] --> B[End]");
    // Two nodes (rectangles) + two labels + one edge.
    expect(scene.shapes.size).toBe(4);
    expect(scene.edges.size).toBe(1);
  });

  it("dagre lays nodes out (no node ends up at the same point as another)", () => {
    const scene = importMermaid(`flowchart TD
A --> B
A --> C`);
    const positions = [...scene.shapes.values()]
      .filter((s) => s.type !== "text")
      .map((s) => `${s.position.x.toFixed(0)},${s.position.y.toFixed(0)}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("viewport size fits the laid-out content", () => {
    const scene = importMermaid("flowchart TD\nA --> B --> C");
    expect(scene.viewport.size.width).toBeGreaterThan(0);
    expect(scene.viewport.size.height).toBeGreaterThan(0);
  });
});

describe("importDot", () => {
  it("converts a tiny digraph", () => {
    const scene = importDot('digraph { a -> b; a [shape=box label="A"]; b [shape=ellipse]; }');
    expect(scene.shapes.size).toBeGreaterThanOrEqual(2);
    expect(scene.edges.size).toBe(1);
  });
});

describe("importDrawio", () => {
  it("keeps explicit positions from drawio geometry", () => {
    const xml = `
      <mxGraphModel><root>
        <mxCell id="n1" value="X" vertex="1"><mxGeometry x="100" y="50" width="60" height="40"/></mxCell>
      </root></mxGraphModel>`;
    const scene = importDrawio(xml);
    const node = [...scene.shapes.values()].find((s) => s.type !== "text")!;
    expect(node.position).toEqual({ x: 100, y: 50 });
  });
});
