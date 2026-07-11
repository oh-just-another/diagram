import { bench, describe } from "vitest";
import type { PathCommand } from "@oh-just-another/scene";
import { WasmRasterizer } from "../src/wasm-rasterizer";

// Measures the JS↔WASM marshalling hot path (packCommands + copy-in +
// read-back) with the real bundled module — the per-flatten cost paid on
// every path re-tessellation during freehand drawing / editing.

const makeCommands = (curves: number): readonly PathCommand[] => {
  const cmds: PathCommand[] = [{ kind: "M", to: { x: 0, y: 0 } }];
  for (let i = 1; i <= curves; i++) {
    const x = i * 20;
    if (i % 2 === 0) {
      cmds.push({ kind: "Q", control: { x: x - 10, y: 30 }, to: { x, y: 0 } });
    } else {
      cmds.push({
        kind: "C",
        control1: { x: x - 15, y: -25 },
        control2: { x: x - 5, y: 25 },
        to: { x, y: 0 },
      });
    }
  }
  return cmds;
};

const rasterizer = await WasmRasterizer.loadBundled();
const small = makeCommands(8);
const medium = makeCommands(64);
const large = makeCommands(512);

describe("WasmRasterizer.flatten — bundled wasm", () => {
  bench("8 curves", () => {
    rasterizer.flatten(small, 1);
  });
  bench("64 curves", () => {
    rasterizer.flatten(medium, 1);
  });
  bench("512 curves", () => {
    rasterizer.flatten(large, 1);
  });
});
