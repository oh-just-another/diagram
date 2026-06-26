import { describe, expect, it } from "vitest";
import { formatTime } from "../src/format-time";

const ISO = "2026-06-16T13:45:30.000Z";

describe("formatTime", () => {
  it("returns a non-empty string for a valid ISO timestamp (default datetime)", () => {
    expect(formatTime(ISO)).not.toBe("");
  });

  it("returns a non-empty string for the explicit datetime style", () => {
    expect(formatTime(ISO, "datetime")).not.toBe("");
  });

  it("returns a non-empty string for the time style", () => {
    expect(formatTime(ISO, "time")).not.toBe("");
  });

  it("datetime and time styles differ (datetime carries the date portion)", () => {
    const datetime = formatTime(ISO, "datetime");
    const time = formatTime(ISO, "time");
    // Locale-independent assertion: the full datetime string is longer/different
    // than the time-only string since it additionally encodes the date.
    expect(datetime).not.toBe(time);
    expect(datetime.length).toBeGreaterThan(time.length);
  });

  it("default style equals the explicit datetime style", () => {
    expect(formatTime(ISO)).toBe(formatTime(ISO, "datetime"));
  });

  it("returns an empty string for an invalid date string", () => {
    expect(formatTime("not-a-date")).toBe("");
    expect(formatTime("not-a-date", "time")).toBe("");
  });

  it("returns an empty string for an empty input", () => {
    expect(formatTime("")).toBe("");
  });
});
