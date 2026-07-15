import { describe, it, expect } from "vitest";
import { ema, EMA_ALPHA } from "./ema";

describe("ema", () => {
  it("uses the 7-day smoothing factor", () => {
    expect(EMA_ALPHA).toBe(0.25);
  });

  it("matches the hand-computed fixture week (with gap days)", () => {
    // alpha = 0.25:
    // day0 seed            = 2000
    // day1 .25*2200+.75*2000       = 2050
    // day2 gap → carries           = 2050
    // day3 .25*1800+.75*2050       = 1987.5
    // day4 .25*2400+.75*1987.5     = 2090.625
    // day5 .25*2000+.75*2090.625   = 2067.96875
    // day6 gap → carries           = 2067.96875
    const series = [2000, 2200, null, 1800, 2400, 2000, null];
    expect(ema(series)).toEqual([
      2000, 2050, 2050, 1987.5, 2090.625, 2067.96875, 2067.96875,
    ]);
  });

  it("carries forward across consecutive gap days without resetting", () => {
    const series = [80, null, null, null, 78];
    const out = ema(series);
    expect(out[1]).toBe(80);
    expect(out[2]).toBe(80);
    expect(out[3]).toBe(80);
    // gap days do NOT decay the EMA — day4 smooths against 80, not null/0
    expect(out[4]).toBeCloseTo(0.25 * 78 + 0.75 * 80, 10); // 79.5
  });

  it("leaves leading gaps null until the first real value seeds it", () => {
    expect(ema([null, null, 100, 200])).toEqual([null, null, 100, 125]);
  });

  it("handles empty and all-gap series", () => {
    expect(ema([])).toEqual([]);
    expect(ema([null, undefined, NaN])).toEqual([null, null, null]);
  });

  it("accepts a custom alpha", () => {
    expect(ema([100, 200], 0.5)).toEqual([100, 150]);
  });
});
