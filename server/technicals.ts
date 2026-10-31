import type { Bar } from "./sources/market.ts";

type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= period) sum -= values[i - period]!;
    return i >= period - 1 ? sum / period : null;
  });
}

export function ema(values: number[], period: number): Series {
  const k = 2 / (period + 1);
  let prev: number | null = null;
  return values.map((v, i) => {
    if (i < period - 1) return null;
    if (prev === null) prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    else prev = v * k + prev * (1 - k);
    return prev;
  });
}

/** Wilder's RSI. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = values.map(() => null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = value();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

export function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const line = values.map((_, i) => (fast[i] != null && slow[i] != null ? fast[i]! - slow[i]! : null));
  const start = line.findIndex((v) => v !== null);
  const signalTail = start < 0 ? [] : ema(line.slice(start) as number[], 9);
  const signal: Series = values.map((_, i) => (start >= 0 && i >= start ? (signalTail[i - start] ?? null) : null));
  const histogram = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i]! : null));
  return { line, signal, histogram };
}

export function bollinger(values: number[], period = 20, width = 2) {
  const middle = sma(values, period);
  const deviation = values.map((_, i) => {
    const m = middle[i];
    if (m == null) return null;
    const window = values.slice(i - period + 1, i + 1);
    return Math.sqrt(window.reduce((sum, v) => sum + (v - m) ** 2, 0) / period);
  });
  return {
    upper: middle.map((m, i) => (m == null ? null : m + width * deviation[i]!)),
    lower: middle.map((m, i) => (m == null ? null : m - width * deviation[i]!)),
  };
}

export function atr(bars: Bar[], period = 14): Series {
  const ranges = bars.map((b, i) => {
    const prev = bars[i - 1]?.close;
    return prev == null ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
  });
  const out: Series = bars.map(() => null);
  if (bars.length < period) return out;
  let value = ranges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = value;
  for (let i = period; i < bars.length; i++) {
    value = (value * (period - 1) + ranges[i]!) / period;
    out[i] = value;
  }
  return out;
}

export type Reading = { label: string; detail: string; lean: "bullish" | "bearish" | "neutral" };

const pct = (a: number, b: number) => ((a - b) / b) * 100;
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;

export function analyze(bars: Bar[]) {
  const closes = bars.map((b) => b.close);
  const series = {
    sma20: sma(closes, 20), sma50: sma(closes, 50), sma200: sma(closes, 200),
    rsi: rsi(closes), macd: macd(closes), bollinger: bollinger(closes), atr: atr(bars),
  };
  const i = bars.length - 1;
  const price = closes[i]!;
  const year = bars.slice(-252);
  const high = Math.max(...year.map((b) => b.high));
  const low = Math.min(...year.map((b) => b.low));
  const s50 = series.sma50[i];
  const s200 = series.sma200[i];
  const r = series.rsi[i];
  const hist = series.macd.histogram[i];
  const prevHist = series.macd.histogram[i - 1];
  const avgVolume = sma(bars.map((b) => b.volume), 20)[i];
  const relativeVolume = avgVolume ? bars[i]!.volume / avgVolume : null;
  const returnOver = (days: number) => (closes[i - days] ? pct(price, closes[i - days]!) : null);

  const readings: Reading[] = [];
  if (s50 != null && s200 != null) {
    const up = price > s200 && s50 > s200;
    const down = price < s200 && s50 < s200;
    readings.push({
      label: up ? "Long-term uptrend" : down ? "Long-term downtrend" : "Mixed long-term trend",
      detail: `Price is ${signed(pct(price, s200))} from the 200-day average; the 50-day is ${s50 > s200 ? "above" : "below"} it.`,
      lean: up ? "bullish" : down ? "bearish" : "neutral",
    });
  }
  if (r != null) {
    readings.push({
      label: r >= 70 ? "Overbought" : r <= 30 ? "Oversold" : "Momentum in normal range",
      detail: `RSI is ${r.toFixed(0)}.`,
      lean: r >= 70 ? "bearish" : r <= 30 ? "bullish" : "neutral",
    });
  }
  if (hist != null && prevHist != null) {
    const crossed = Math.sign(hist) !== Math.sign(prevHist);
    readings.push({
      label: crossed ? (hist > 0 ? "MACD just turned up" : "MACD just turned down") : hist > 0 ? "MACD above signal" : "MACD below signal",
      detail: `Short-term momentum is ${hist > prevHist ? "improving" : "fading"}.`,
      lean: hist > 0 ? "bullish" : "bearish",
    });
  }
  readings.push({
    label: "52-week range",
    detail: `${signed(pct(price, high))} from the high, ${signed(pct(price, low))} from the low.`,
    lean: "neutral",
  });
  if (relativeVolume != null && relativeVolume >= 1.5) {
    readings.push({ label: "Heavy volume", detail: `${relativeVolume.toFixed(1)} times the 20-day average.`, lean: "neutral" });
  }

  return {
    series,
    summary: {
      asOf: bars[i]!.time,
      price,
      sma20: series.sma20[i], sma50: s50, sma200: s200, rsi14: r,
      macdHistogram: hist, atr14: series.atr[i],
      atrPercent: series.atr[i] != null ? (series.atr[i]! / price) * 100 : null,
      high52w: high, low52w: low, relativeVolume,
      return1m: returnOver(21), return3m: returnOver(63), return1y: returnOver(252),
      readings,
    },
  };
}
