import { describe, expect, it } from "vitest";
import { parseDot } from "../src/dot";

describe("parseDot", () => {
  it("parses a tiny directed graph", () => {
    const g = parseDot("digraph G { a -> b; }");
    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(g.edges).toEqual([{ source: "a", target: "b", direction: "directed" }]);
  });

  it("rankdir flows into layout direction", () => {
    const g = parseDot("digraph { rankdir=LR; a -> b; }");
    expect(g.layout).toBe("LR");
  });

  it("node attributes — label + shape", () => {
    const g = parseDot('digraph { a [label="Start" shape=box]; }');
    expect(g.nodes[0]).toMatchObject({ id: "a", label: "Start", shape: "rectangle" });
  });

  it("undirected `--` edges in `graph`", () => {
    const g = parseDot("graph G { a -- b; }");
    expect(g.edges[0]?.direction).toBe("undirected");
  });

  it("chained edges", () => {
    const g = parseDot("digraph { a -> b -> c; }");
    expect(g.edges).toHaveLength(2);
  });

  it("edge labels", () => {
    const g = parseDot('digraph { a -> b [label="x"]; }');
    expect(g.edges[0]?.label).toBe("x");
  });

  it("comments are stripped", () => {
    const g = parseDot(`
      digraph {
        // line comment
        /* block comment */
        a -> b;
        # hash
      }
    `);
    expect(g.edges).toHaveLength(1);
  });
});
