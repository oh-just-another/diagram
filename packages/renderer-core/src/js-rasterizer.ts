import type { Vec2 } from "@oh-just-another/types";
import { bezier } from "@oh-just-another/math";
import type { Rasterizer } from "./rasterizer.js";

const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("packages/renderer-core: index out of range");
  return v;
};

/**
 * Reference JS implementation of the `Rasterizer` interface. Path
 * flattening delegates to the `@math/bezier` adaptive flattener;
 * stroke-to-fill builds a mitre-joined offset polygon.
 */
export const jsRasterizer: Rasterizer = {
  flatten(commands, tolerance) {
    // Smaller tolerance → more samples. Pick a sample count proportional
    // to the rough chord length divided by tolerance, bounded so
    // degenerate inputs don't explode.
    const sampleCount = (chordLen: number): number =>
      Math.min(128, Math.max(8, Math.ceil(chordLen / Math.max(0.1, tolerance))));
    const out: Vec2[] = [];
    let pen: Vec2 = { x: 0, y: 0 };
    for (const cmd of commands) {
      switch (cmd.kind) {
        case "M":
          pen = cmd.to;
          out.push(pen);
          break;
        case "L":
          pen = cmd.to;
          out.push(pen);
          break;
        case "Q": {
          const chord = Math.hypot(cmd.to.x - pen.x, cmd.to.y - pen.y);
          const samples = bezier.flattenQuadratic(pen, cmd.control, cmd.to, sampleCount(chord));
          for (let i = 1; i < samples.length; i++) out.push(req(samples[i]));
          pen = cmd.to;
          break;
        }
        case "C": {
          const chord = Math.hypot(cmd.to.x - pen.x, cmd.to.y - pen.y);
          const samples = bezier.flattenCubic(
            pen,
            cmd.control1,
            cmd.control2,
            cmd.to,
            sampleCount(chord),
          );
          for (let i = 1; i < samples.length; i++) out.push(req(samples[i]));
          pen = cmd.to;
          break;
        }
        case "Z":
          // Close — connect back to the first point if it exists.
          if (out.length > 0) {
            const first = req(out[0]);
            out.push(first);
            pen = first;
          }
          break;
      }
    }
    return out;
  },

  strokeToFill(polyline, width, options) {
    if (polyline.length < 2) return polyline;
    const half = width / 2;
    const cap = options?.cap ?? "butt";
    void options?.join; // mitre-only in this reference implementation
    const left: Vec2[] = [];
    const right: Vec2[] = [];
    for (let i = 0; i < polyline.length; i++) {
      const prev = req(polyline[Math.max(0, i - 1)]);
      const next = req(polyline[Math.min(polyline.length - 1, i + 1)]);
      const cur = req(polyline[i]);
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      left.push({ x: cur.x + nx * half, y: cur.y + ny * half });
      right.push({ x: cur.x - nx * half, y: cur.y - ny * half });
    }
    // Round / square caps would extend the line ends here; butt =
    // just the side offsets.
    if (cap === "round" || cap === "square") {
      // No-op: non-butt endcaps need extra verts; not generated here.
    }
    return [...left, ...right.reverse(), req(left[0])];
  },
};
