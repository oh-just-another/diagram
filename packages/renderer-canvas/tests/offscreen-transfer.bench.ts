import { bench, describe } from "vitest";
import { RecordingTarget, type RenderCommand } from "../src/index";
import { packReplayFrame } from "../src/offscreen/replay-codec";

/**
 * Bench for the CPU-side cost of the offscreen (worker) backend's
 * per-frame transfer: `LayeredSurface.present()` flushes each layer's
 * `RecordingTarget` and ships the command buffer to the worker via
 * `postMessage`, which structured-clones the payload.
 *
 * Three parts:
 *  - "record frame": buffering a representative frame's command stream
 *    (~500 shapes: fills, multi-segment paths, text) into a
 *    RecordingTarget — includes the rolling content-signature mixing
 *    that `emit()` folds into every command.
 *  - "structuredClone(commands)": what shipping the raw command objects
 *    used to cost — `structuredClone` uses the same HTML structured-clone
 *    algorithm as `postMessage`, so it is the Node-measurable proxy for
 *    that payload. Kept as the comparison baseline.
 *  - "packReplayFrame(commands)": the codec that replaced it — encode
 *    into one transferable ArrayBuffer + deduplicated string table.
 *    Pack cost is the new per-layer CPU price; the buffer itself is
 *    transferred (not cloned) by postMessage.
 */

const SHAPES = 500;
const SURFACE = { width: 1920, height: 1080 };

/**
 * Record one representative frame: per shape a fill/stroke state change +
 * a path (rect, or a 6-segment bezier blob every 4th shape), and a text
 * label every 10th shape. ~7 commands per shape → ~3.5k commands/frame.
 */
const recordFrame = (t: RecordingTarget): void => {
  t.clear();
  t.setTransform({ a: 1, b: 0, c: 0, d: 1, e: -12.5, f: -7.25 });
  for (let i = 0; i < SHAPES; i++) {
    const x = (i % 40) * 48;
    const y = Math.floor(i / 40) * 80;
    t.setFill(i % 2 === 0 ? "#1a73e8" : "#e6f0ff");
    t.setStroke("#333333");
    t.setStrokeWidth(1 + (i % 3));
    t.beginPath();
    if (i % 4 === 0) {
      // Curve-heavy shape: hand-drawn stroke / rounded outline stand-in.
      t.moveTo(x, y);
      for (let s = 1; s <= 6; s++) {
        t.bezierCurveTo(x + s * 4, y - 6, x + s * 4 + 2, y + 6, x + s * 8, y);
      }
      t.closePath();
    } else {
      t.rect(x, y, 40, 30);
    }
    t.fill();
    t.stroke();
    if (i % 10 === 0) {
      t.setFont("Inter", 14);
      t.fillText(`node ${String(i)}`, x + 4, y + 18);
    }
  }
};

// Pre-warmed fixtures: the recorder is reused across iterations (flush
// resets its buffer), and the clone bench works on one pre-recorded frame.
const recorder = new RecordingTarget(SURFACE.width, SURFACE.height);
recordFrame(recorder);
recorder.flush();

const cloneSource = new RecordingTarget(SURFACE.width, SURFACE.height);
recordFrame(cloneSource);
const frameCommands: readonly RenderCommand[] = cloneSource.flush();

describe(`offscreen transfer — ${String(SHAPES)}-shape frame (${String(frameCommands.length)} commands)`, () => {
  bench("record frame into RecordingTarget (+signature) & flush", () => {
    recordFrame(recorder);
    recorder.flush();
  });

  bench("structuredClone(commands) — postMessage serialisation proxy", () => {
    structuredClone(frameCommands);
  });

  // What present() actually pays per changed layer since the packed-frame
  // codec landed: flatten the stream into one transferable ArrayBuffer +
  // deduplicated string table. The buffer then moves across postMessage
  // for free (transfer list) instead of being structured-cloned.
  bench("packReplayFrame(commands) — transferable packed-frame encode", () => {
    packReplayFrame(frameCommands);
  });
});
