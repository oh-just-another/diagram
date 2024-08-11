import { describe, expect, it } from "vitest";
import { parseDrawio } from "../src/drawio";

const fixture = `
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="Start" style="rounded=0;whiteSpace=wrap;" vertex="1" parent="1">
      <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="3" value="Decide" style="rhombus;" vertex="1" parent="1">
      <mxGeometry x="220" y="40" width="120" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="4" value="" style="" edge="1" source="2" target="3" parent="1"/>
  </root>
</mxGraphModel>
`;

describe("parseDrawio", () => {
  it("extracts vertices with positions and shapes", () => {
    const g = parseDrawio(fixture);
    const start = g.nodes.find((n) => n.id === "2");
    const decide = g.nodes.find((n) => n.id === "3");
    expect(start).toMatchObject({
      label: "Start",
      shape: "rectangle",
      width: 120,
      height: 60,
      position: { x: 40, y: 40 },
    });
    expect(decide?.shape).toBe("diamond");
  });

  it("extracts edges referencing source / target ids", () => {
    const g = parseDrawio(fixture);
    expect(g.edges).toEqual([{ source: "2", target: "3", direction: "directed" }]);
  });

  it("decodes HTML entities in labels", () => {
    const xml = `
      <mxGraphModel><root>
        <mxCell id="x" value="A &amp; B" vertex="1"><mxGeometry x="0" y="0" width="10" height="10"/></mxCell>
      </root></mxGraphModel>`;
    expect(parseDrawio(xml).nodes[0]?.label).toBe("A & B");
  });
});
