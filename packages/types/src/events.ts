import type { Vec2 } from "./vec2.js";

export interface Modifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

export type PointerKind = "mouse" | "pen" | "touch";

export type PointerPhase = "down" | "move" | "up" | "cancel" | "enter" | "leave";

/**
 * Framework-agnostic pointer input. Coordinates are in whatever space the
 * caller has decided (world / canvas / screen); the type does not enforce this.
 */
export interface PointerEventData {
  readonly kind: PointerKind;
  readonly phase: PointerPhase;
  readonly point: Vec2;
  /** Bitmask of currently pressed buttons (Web PointerEvent.buttons). */
  readonly buttons: number;
  readonly modifiers: Modifiers;
  readonly pointerId: number;
  /** Monotonic timestamp in milliseconds. */
  readonly timestamp: number;
}

export type KeyPhase = "down" | "up";

export interface KeyboardEventData {
  readonly phase: KeyPhase;
  /** Logical key, e.g. "a", "ArrowLeft", "Escape". */
  readonly key: string;
  /** Physical key code, e.g. "KeyA", "ArrowLeft". */
  readonly code: string;
  readonly modifiers: Modifiers;
  readonly repeat: boolean;
  readonly timestamp: number;
}

export interface WheelEventData {
  readonly point: Vec2;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaZ: number;
  readonly modifiers: Modifiers;
  readonly timestamp: number;
}
