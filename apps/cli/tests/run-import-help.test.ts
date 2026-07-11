import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/index";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Behavioural coverage for the `run` paths not exercised by `cli.test.ts`:
 * the help short-circuit, the whole `import` command (format inference,
 * `--from` override, error branches) and PDF custom `WxH` page sizes.
 */

const PDF_SIG = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

let counter = 0;
const tempDir = async (): Promise<string> => {
  const dir = join(tmpdir(), `diagram-cli-run-test-${process.pid}-${++counter}`);
  await mkdir(dir, { recursive: true });
  process.on("exit", () => {
    rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });
  return dir;
};

const captureStdout = (): { text: () => string; restore: () => void } => {
  let buf = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    buf += String(chunk);
    return true;
  });
  return { text: () => buf, restore: () => spy.mockRestore() };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("run — help output", () => {
  it("prints usage on --help and does not run a command", async () => {
    const out = captureStdout();
    await run(["--help"]);
    out.restore();
    expect(out.text()).toContain("Usage:");
    expect(out.text()).toContain("diagram render");
  });

  it("prints usage when no command is given", async () => {
    const out = captureStdout();
    await run([]);
    out.restore();
    expect(out.text()).toContain("Usage:");
  });

  it("-h wins even when a command is present", async () => {
    const out = captureStdout();
    await run(["render", "missing.json", "-h"]);
    out.restore();
    expect(out.text()).toContain("Usage:");
  });
});

describe("run (import) — format inference from extension", () => {
  it("imports .mmd as mermaid and writes a scene.json", async () => {
    const dir = await tempDir();
    const input = join(dir, "flow.mmd");
    const output = join(dir, "scene.json");
    await writeFile(input, "flowchart TD\nA[Start] --> B[End]");
    await run(["import", input, "--out", output]);
    const scene = JSON.parse(await readFile(output, "utf8")) as {
      elements: unknown[];
      links: unknown[];
    };
    expect(scene.elements.length).toBeGreaterThanOrEqual(2);
    expect(scene.links.length).toBe(1);
  });

  it("imports .gv as dot", async () => {
    const dir = await tempDir();
    const input = join(dir, "graph.gv");
    const output = join(dir, "scene.json");
    await writeFile(input, "digraph { a -> b; }");
    await run(["import", input, "--out", output]);
    const scene = JSON.parse(await readFile(output, "utf8")) as {
      elements: unknown[];
      links: unknown[];
    };
    expect(scene.elements.length).toBeGreaterThanOrEqual(2);
    expect(scene.links.length).toBe(1);
  });

  it("imports .drawio as drawio XML", async () => {
    const dir = await tempDir();
    const input = join(dir, "board.drawio");
    const output = join(dir, "scene.json");
    await writeFile(
      input,
      `<mxGraphModel><root>
        <mxCell id="n1" value="X" vertex="1"><mxGeometry x="100" y="50" width="60" height="40"/></mxCell>
      </root></mxGraphModel>`,
    );
    await run(["import", input, "--out", output]);
    const scene = JSON.parse(await readFile(output, "utf8")) as { elements: unknown[] };
    expect(scene.elements.length).toBeGreaterThanOrEqual(1);
  });

  it("--from overrides the extension-based inference", async () => {
    const dir = await tempDir();
    // A `.txt` extension is not inferable — --from dot must take over.
    const input = join(dir, "graph.txt");
    const output = join(dir, "scene.json");
    await writeFile(input, "digraph { a -> b; }");
    await run(["import", input, "--out", output, "--from", "dot"]);
    const scene = JSON.parse(await readFile(output, "utf8")) as { links: unknown[] };
    expect(scene.links.length).toBe(1);
  });
});

describe("run (import) — error branches", () => {
  it("throws when the extension is not inferable and --from is absent", async () => {
    const dir = await tempDir();
    const input = join(dir, "graph.txt");
    await writeFile(input, "digraph { a -> b; }");
    await expect(run(["import", input, "--out", join(dir, "s.json")])).rejects.toThrow(
      /Could not infer source format/,
    );
  });

  it("requires a source positional", async () => {
    await expect(run(["import", "--out", "s.json"])).rejects.toThrow(/missing source file/);
  });

  it("requires --out", async () => {
    await expect(run(["import", "flow.mmd"])).rejects.toThrow(/--out is required/);
  });
});

describe("run (export) — custom page size", () => {
  const fixture = JSON.stringify({
    format: "oh-just-another/scene",
    version: 1,
    elements: [
      {
        id: "a",
        layerId: "default",
        type: "rectangle",
        position: { x: 10, y: 10 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: "a0",
        style: { fill: "#1a73e8" },
        width: 80,
        height: 40,
      },
    ],
    links: [],
    layers: [{ id: "default", name: "Default", visible: true, locked: false, order: "a0" }],
    viewport: { pan: { x: 0, y: 0 }, zoom: 1, rotation: 0, size: { width: 120, height: 80 } },
  });

  it("accepts --page WxH in points", async () => {
    const dir = await tempDir();
    const input = join(dir, "scene.json");
    const output = join(dir, "out.pdf");
    await writeFile(input, fixture);
    await run(["export", input, "--out", output, "--page", "400x300"]);
    const pdf = await readFile(output);
    expect(PDF_SIG.every((b, i) => pdf[i] === b)).toBe(true);
  });

  it("accepts fractional WxH", async () => {
    const dir = await tempDir();
    const input = join(dir, "scene.json");
    const output = join(dir, "out.pdf");
    await writeFile(input, fixture);
    await run(["export", input, "--out", output, "--page", "420.5x300.25"]);
    const pdf = await readFile(output);
    expect(PDF_SIG.every((b, i) => pdf[i] === b)).toBe(true);
  });

  it("rejects a malformed --page value", async () => {
    const dir = await tempDir();
    const input = join(dir, "scene.json");
    await writeFile(input, fixture);
    await expect(
      run(["export", input, "--out", join(dir, "out.pdf"), "--page", "banana"]),
    ).rejects.toThrow(/--page expects/);
  });

  it("requires a scene positional for export", async () => {
    await expect(run(["export", "--out", "x.png"])).rejects.toThrow(/missing scene file/);
  });

  it("requires --out for export", async () => {
    await expect(run(["export", "scene.json"])).rejects.toThrow(/--out is required/);
  });
});

describe("run (render) — remaining branches", () => {
  const fixture = JSON.stringify({
    format: "oh-just-another/scene",
    version: 1,
    elements: [],
    links: [],
    layers: [{ id: "default", name: "Default", visible: true, locked: false, order: "a0" }],
    viewport: { pan: { x: 0, y: 0 }, zoom: 1, rotation: 0, size: { width: 120, height: 80 } },
  });

  it("honours --width/--height overrides for SVG", async () => {
    const dir = await tempDir();
    const input = join(dir, "scene.json");
    const output = join(dir, "out.svg");
    await writeFile(input, fixture);
    await run(["render", input, "--out", output, "--width", "333", "--height", "222"]);
    const svg = await readFile(output, "utf8");
    expect(svg).toContain('width="333"');
    expect(svg).toContain('height="222"');
  });

  it("applies --background to PNG renders", async () => {
    const dir = await tempDir();
    const input = join(dir, "scene.json");
    const output = join(dir, "out.png");
    await writeFile(input, fixture);
    await run(["render", input, "--out", output, "--background", "#ff0000"]);
    const png = await readFile(output);
    expect(png.length).toBeGreaterThan(8);
  });

  it("requires a scene positional for render", async () => {
    await expect(run(["render", "--out", "x.svg"])).rejects.toThrow(/missing scene file/);
  });
});
