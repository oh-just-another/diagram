import { describe, expect, it } from "vitest";
import { parseMermaid } from "../src/mermaid";

describe("parseMermaid", () => {
  it("picks up the layout direction from the header", () => {
    const g = parseMermaid("flowchart LR\nA --> B");
    expect(g.layout).toBe("LR");
  });

  it("treats `TD` as `TB`", () => {
    const g = parseMermaid("flowchart TD\nA --> B");
    expect(g.layout).toBe("TB");
  });

  it("collects nodes with bracket shapes + labels", () => {
    const g = parseMermaid(`flowchart TD
A[Start]
B(Round)
C{Decision}
D((Circle))
E`);
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    expect(byId.get("A")?.shape).toBe("rectangle");
    expect(byId.get("A")?.label).toBe("Start");
    expect(byId.get("B")?.shape).toBe("round");
    expect(byId.get("C")?.shape).toBe("diamond");
    expect(byId.get("D")?.shape).toBe("ellipse");
    expect(byId.get("E")?.label).toBeUndefined();
  });

  it("emits edges for `-->` / `---`", () => {
    const g = parseMermaid("flowchart TD\nA --> B\nC --- D");
    expect(g.edges).toEqual([
      { source: "A", target: "B", direction: "directed" },
      { source: "C", target: "D", direction: "undirected" },
    ]);
  });

  it("captures edge labels with pipes", () => {
    const g = parseMermaid("flowchart TD\nA -->|yes| B");
    expect(g.edges[0]?.label).toBe("yes");
  });

  it("supports chained edges", () => {
    const g = parseMermaid("flowchart TD\nA --> B --> C");
    expect(g.edges).toHaveLength(2);
    expect(g.edges[0]?.target).toBe("B");
    expect(g.edges[1]?.source).toBe("B");
  });

  it("merges later-defined node labels back into the original entry", () => {
    const g = parseMermaid(`flowchart TD
A --> B
B[End]`);
    const b = g.nodes.find((n) => n.id === "B")!;
    expect(b.label).toBe("End");
  });

  it("ignores comments and class statements", () => {
    const g = parseMermaid(`flowchart TD
%% a comment
classDef big fill:#fff
A --> B`);
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
  });
});
