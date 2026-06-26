import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDismissTimer } from "../src/use-dismiss-timer";

describe("useDismissTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedule(ms) runs cb after the delay", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDismissTimer(cb));
    act(() => {
      result.current.schedule(1000);
    });
    expect(cb).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(cb).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("cancel() before the delay prevents cb", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDismissTimer(cb));
    act(() => {
      result.current.schedule(1000);
      result.current.cancel();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it("scheduling again resets the pending timer (only the latest fires once)", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDismissTimer(cb));
    act(() => {
      result.current.schedule(1000);
    });
    act(() => {
      vi.advanceTimersByTime(500);
      result.current.schedule(1000);
    });
    // The original 1000ms deadline would have passed at t=1000, but it was reset.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(cb).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("uses the latest cb closure when the timer fires", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ cb }) => useDismissTimer(cb), {
      initialProps: { cb: first },
    });
    act(() => {
      result.current.schedule(1000);
    });
    rerender({ cb: second });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clears the timer on unmount (no cb after unmount)", () => {
    const cb = vi.fn();
    const { result, unmount } = renderHook(() => useDismissTimer(cb));
    act(() => {
      result.current.schedule(1000);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it("cancel() with no pending timer is a no-op", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDismissTimer(cb));
    expect(() => {
      act(() => {
        result.current.cancel();
      });
    }).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });
});
