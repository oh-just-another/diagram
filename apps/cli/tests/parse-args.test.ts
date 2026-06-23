import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/index";

/**
 * Branch-focused coverage of the pure argument parser. The happy paths
 * live in `cli.test.ts`; this file targets the validation / error branches
 * (crop, page-size, orientation, --from, unknown flags, positionals,
 * missing values, defaults) so the parser's error handling is pinned.
 */
describe("parseArgs — defaults", () => {
  it("returns an all-null record for empty argv", () => {
    const a = parseArgs([]);
    expect(a).toEqual({
      command: null,
      input: null,
      output: null,
      width: null,
      height: null,
      scale: null,
      background: null,
      crop: null,
      dpi: null,
      page: null,
      orientation: null,
      margin: null,
      title: null,
      author: null,
      from: null,
      help: false,
    });
  });
});

describe("parseArgs — positional arguments", () => {
  it("first non-flag is the command, second is the input", () => {
    const a = parseArgs(["render", "scene.json"]);
    expect(a.command).toBe("render");
    expect(a.input).toBe("scene.json");
  });

  it("throws on a third positional argument", () => {
    expect(() => parseArgs(["render", "scene.json", "extra"])).toThrow(
      /Unexpected positional argument: extra/,
    );
  });

  it("treats a value that follows an option as that option's value, not a positional", () => {
    // `out.svg` is consumed by `--out`, so `scene.json` is still the input.
    const a = parseArgs(["render", "--out", "out.svg", "scene.json"]);
    expect(a.command).toBe("render");
    expect(a.input).toBe("scene.json");
    expect(a.output).toBe("out.svg");
  });
});

describe("parseArgs — flags & aliases", () => {
  it("supports the -o alias for --out", () => {
    expect(parseArgs(["render", "s.json", "-o", "x.png"]).output).toBe("x.png");
  });

  it("parses string options (background, title, author, page)", () => {
    const a = parseArgs([
      "export",
      "s.json",
      "--out",
      "x.pdf",
      "--background",
      "#fff",
      "--title",
      "T",
      "--author",
      "A",
      "--page",
      "A4",
    ]);
    expect(a.background).toBe("#fff");
    expect(a.title).toBe("T");
    expect(a.author).toBe("A");
    expect(a.page).toBe("A4");
  });

  it("parses every numeric option (width/height/scale/dpi/margin)", () => {
    const a = parseArgs([
      "export",
      "s.json",
      "--out",
      "x.png",
      "--width",
      "300",
      "--height",
      "200",
      "--scale",
      "2",
      "--dpi",
      "300",
      "--margin",
      "12",
    ]);
    expect(a.width).toBe(300);
    expect(a.height).toBe(200);
    expect(a.scale).toBe(2);
    expect(a.dpi).toBe(300);
    expect(a.margin).toBe(12);
  });

  it("yields NaN for a non-numeric numeric option value", () => {
    const a = parseArgs(["render", "s.json", "--out", "x.png", "--width", "wide"]);
    expect(Number.isNaN(a.width)).toBe(true);
  });

  it("rejects unknown long flags", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown option: --nope/);
  });

  it("rejects unknown short flags", () => {
    expect(() => parseArgs(["render", "s.json", "-z"])).toThrow(/Unknown option: -z/);
  });
});

describe("parseArgs — missing values at end of argv", () => {
  it("--out with no following token becomes null", () => {
    expect(parseArgs(["render", "s.json", "--out"]).output).toBeNull();
  });

  it("--background with no following token becomes null", () => {
    expect(parseArgs(["render", "s.json", "--background"]).background).toBeNull();
  });

  it("--page / --title / --author with no following token become null", () => {
    expect(parseArgs(["export", "s.json", "--page"]).page).toBeNull();
    expect(parseArgs(["export", "s.json", "--title"]).title).toBeNull();
    expect(parseArgs(["export", "s.json", "--author"]).author).toBeNull();
  });

  it("--width with no following token becomes NaN (Number(undefined))", () => {
    expect(Number.isNaN(parseArgs(["render", "s.json", "--width"]).width)).toBe(true);
  });
});

describe("parseArgs — --crop validation", () => {
  it("parses a valid X,Y,W,H rectangle", () => {
    expect(parseArgs(["export", "s.json", "--crop", "10,20,400,300"]).crop).toEqual({
      x: 10,
      y: 20,
      width: 400,
      height: 300,
    });
  });

  it("accepts negative and fractional coordinates", () => {
    expect(parseArgs(["export", "s.json", "--crop", "-5,-2.5,400,300"]).crop).toEqual({
      x: -5,
      y: -2.5,
      width: 400,
      height: 300,
    });
  });

  it("throws when fewer than four parts are given", () => {
    expect(() => parseArgs(["export", "s.json", "--crop", "0,0,400"])).toThrow(
      /--crop expects X,Y,W,H/,
    );
  });

  it("throws when more than four parts are given", () => {
    expect(() => parseArgs(["export", "s.json", "--crop", "0,0,400,300,1"])).toThrow(
      /--crop expects X,Y,W,H/,
    );
  });

  it("throws when any part is non-numeric (NaN)", () => {
    expect(() => parseArgs(["export", "s.json", "--crop", "0,0,wide,300"])).toThrow(
      /--crop expects X,Y,W,H/,
    );
  });

  it("throws on an empty crop value (no following token)", () => {
    expect(() => parseArgs(["export", "s.json", "--crop"])).toThrow(/--crop expects X,Y,W,H/);
  });
});

describe("parseArgs — --orientation validation", () => {
  it("accepts portrait", () => {
    expect(parseArgs(["export", "s.json", "--orientation", "portrait"]).orientation).toBe(
      "portrait",
    );
  });

  it("accepts landscape", () => {
    expect(parseArgs(["export", "s.json", "--orientation", "landscape"]).orientation).toBe(
      "landscape",
    );
  });

  it("throws on any other value", () => {
    expect(() => parseArgs(["export", "s.json", "--orientation", "sideways"])).toThrow(
      /--orientation must be portrait or landscape/,
    );
  });

  it("throws when the value is missing (no following token)", () => {
    expect(() => parseArgs(["export", "s.json", "--orientation"])).toThrow(
      /--orientation must be portrait or landscape/,
    );
  });
});

describe("parseArgs — --from validation", () => {
  it.each(["mermaid", "dot", "drawio"] as const)("accepts %s", (fmt) => {
    expect(parseArgs(["import", "src", "--from", fmt]).from).toBe(fmt);
  });

  it("throws on an unsupported format", () => {
    expect(() => parseArgs(["import", "src", "--from", "graphml"])).toThrow(
      /--from must be mermaid \/ dot \/ drawio/,
    );
  });

  it("throws when the value is missing (no following token)", () => {
    expect(() => parseArgs(["import", "src", "--from"])).toThrow(
      /--from must be mermaid \/ dot \/ drawio/,
    );
  });
});

describe("parseArgs — --help", () => {
  it("is false by default and true when present anywhere", () => {
    expect(parseArgs(["render", "s.json"]).help).toBe(false);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["render", "s.json", "-h"]).help).toBe(true);
  });
});
