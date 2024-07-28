import { describe, expect, it } from "vitest";
import { parseArgs, run } from "../src/index";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const fixture = JSON.stringify({
  format: "oh-just-another/scene",
  version: 1,
  shapes: [
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
  edges: [],
  layers: [{ id: "default", name: "Default", visible: true, locked: false, order: "a0" }],
  viewport: { pan: { x: 0, y: 0 }, zoom: 1, rotation: 0, size: { width: 120, height: 80 } },
});

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("parseArgs", () => {
  it("parses command + input + --out", () => {
    const a = parseArgs(["render", "scene.json", "--out", "out.svg"]);
    expect(a.command).toBe("render");
    expect(a.input).toBe("scene.json");
    expect(a.output).toBe("out.svg");
  });

  it("parses numeric options", () => {
    const a = parseArgs(["render", "s.json", "--out", "x.png", "--width", "300", "--scale", "2"]);
    expect(a.width).toBe(300);
    expect(a.scale).toBe(2);
  });

  it("accepts --help anywhere", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["render", "-h"]).help).toBe(true);
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--what"])).toThrow(/Unknown option/);
  });
});

describe("run (render)", () => {
  it("renders to SVG when output ends with .svg", async () => {
    const dir = await tempDir();
    const input = join(dir, "scene.json");
    const output = join(dir, "out.svg");
    await writeFile(input, fixture);
    await run(["render", input, "--out", output]);
    const svg = await readFile(output, "utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain('fill="#1a73e8"');
  });

  it("renders to PNG when output ends with .png", async () => {
    const dir = await tempDir();
    const input = join(dir, "scene.json");
    const output = join(dir, "out.png");
    await writeFile(input, fixture);
    await run(["render", input, "--out", output, "--scale", "2"]);
    const png = await readFile(output);
    expect(PNG_SIG.every((b, i) => png[i] === b)).toBe(true);
  });

  it("rejects unsupported extensions", async () => {
    const dir = await tempDir();
    const input = join(dir, "scene.json");
    await writeFile(input, fixture);
    await expect(run(["render", input, "--out", "out.jpeg"])).rejects.toThrow(/Unsupported/);
  });

  it("requires --out", async () => {
    await expect(run(["render", "scene.json"])).rejects.toThrow(/--out/);
  });

  it("rejects unknown command", async () => {
    await expect(run(["explode", "scene.json", "--out", "x.svg"])).rejects.toThrow(
      /Unknown command/,
    );
  });
});

let counter = 0;
const tempDir = async (): Promise<string> => {
  const dir = join(tmpdir(), `diagram-cli-test-${process.pid}-${++counter}`);
  await mkdir(dir, { recursive: true });
  // Best-effort cleanup; test runner will tear down the process anyway.
  process.on("exit", () => {
    rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });
  return dir;
};
