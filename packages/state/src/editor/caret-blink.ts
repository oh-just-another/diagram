import { CARET_BLINK_INTERVAL_MS } from "../constants.js";

/**
 * Owns the text-edit caret blink (solid/clear toggle on a DOM interval).
 * Extracted from the Editor god-class. `onTick` is the Editor's `notify` so a
 * blink repaints the overlay; the controller never touches the scene.
 */
export class CaretBlinkController {
  private _on = true;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly onTick: () => void) {}

  get on(): boolean {
    return this._on;
  }

  /** Restart blinking from a solid caret. */
  start(): void {
    this._on = true;
    this.stop();
    // Only run the blink when a DOM clock exists (browser host). Node test
    // envs construct the editor without a window — skip so a dangling interval
    // can't keep the process alive.
    if (typeof window === "undefined") return;
    this.timer = setInterval(() => {
      this._on = !this._on;
      this.onTick();
    }, CARET_BLINK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Reset the caret to solid (called on type / move so it never blinks off mid-action). */
  wake(): void {
    this._on = true;
  }
}
