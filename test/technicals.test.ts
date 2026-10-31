import { describe, expect, it } from "vitest";
import { analyze, atr, bollinger, ema, macd, rsi, sma } from "../server/technicals.ts";

const bar = (close: number, i: number) => ({
  time: `2025-01-${String(i + 1).padStart(2, "0")}`, open: close, high: close + 1, low: close - 1, close, volume: 100,
});

describe("indicators", () => {
  it("sma", () => expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]));

  it("ema seeds from the simple average", () => {
    expect(ema([2, 4, 6, 8], 3)).toEqual([null, null, 4, 6]);
  });

  it("rsi is 100 on a straight rise and 0 on a straight fall", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up).at(-1)).toBe(100);
    expect(rsi([...up].reverse()).at(-1)).toBe(0);
  });

  it("rsi matches Wilder's published worked example", () => {
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(rsi(closes)[14]).toBeCloseTo(70.5, 0);
  });

  it("macd histogram is line minus signal", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const m = macd(closes);
    expect(m.line[24]).toBeNull();
    expect(m.signal.at(-1)).not.toBeNull();
    expect(m.histogram.at(-1)!).toBeCloseTo(m.line.at(-1)! - m.signal.at(-1)!);
  });

  it("bollinger bands collapse on a flat series", () => {
    const b = bollinger(Array(25).fill(10));
    expect(b.upper.at(-1)).toBe(10);
    expect(b.lower.at(-1)).toBe(10);
  });

  it("atr equals the range when price is flat", () => {
    expect(atr(Array.from({ length: 20 }, (_, i) => bar(50, i))).at(-1)).toBeCloseTo(2);
  });
});

describe("analyze", () => {
  it("reads a steady rise as an overbought uptrend", () => {
    const bars = Array.from({ length: 260 }, (_, i) => bar(100 + i, i));
    const { summary } = analyze(bars);
    const labels = summary.readings.map((r) => r.label);
    expect(labels).toContain("Long-term uptrend");
    expect(labels).toContain("Overbought");
  });

  it("does not crash on short histories", () => {
    const { summary } = analyze(Array.from({ length: 30 }, (_, i) => bar(100, i)));
    expect(summary.sma200).toBeNull();
    expect(summary.return1y).toBeNull();
  });
});
