export type Position = {
  conid: string; symbol: string | null; description: string; assetClass: string; sector: string | null;
  quantity: number; avgPrice: number; price: number; marketValue: number; marketValueBase: number;
  unrealizedPnl: number; realizedPnl: number; currency: string;
};
export type Portfolio = {
  status: { state: "live" | "sample" | "gateway_down" | "login_required" | "stale"; detail?: string };
  accountId: string | null; baseCurrency: string; netLiquidation: number | null; cash: number | null;
  unrealizedPnl: number | null; positions: Position[]; updatedAt: number | null;
  dayChange: Record<string, number | null>;
};
export type Status = { ai: boolean; model: string; source: "ibkr" | "sample"; gatewayUrl: string };
export type Row = { symbol: string; name: string; price: number | null; changePercent: number | null };
export type News = { title: string; publisher: string; link: string; publishedAt: string; tickers: string[] };
export type Reading = { label: string; detail: string; lean: "bullish" | "bearish" | "neutral" };
export type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number };
type Series = (number | null)[];
export type Technicals = {
  bars: Bar[];
  series: {
    sma20: Series; sma50: Series; sma200: Series; rsi: Series;
    macd: { line: Series; signal: Series; histogram: Series };
    bollinger: { upper: Series; lower: Series };
  };
  summary: { asOf: string; price: number; rsi14: number | null; atrPercent: number | null; high52w: number; low52w: number;
    return1m: number | null; return3m: number | null; return1y: number | null; readings: Reading[] };
};
export type Fundamentals = {
  symbol: string; name: string; currency: string | null; sector: string | null; industry: string | null;
  summary: string | null; nextEarnings: string | null;
  valuation: Record<string, number | null>; profitability: Record<string, number | null>;
  growth: Record<string, number | null>; health: Record<string, number | null>; income: Record<string, number | null>;
  analysts: { rating: string | null; opinions: number | null; targetLow: number | null; targetMean: number | null; targetHigh: number | null };
  quarters: { date: string; revenue: number; netIncome: number | null }[];
};
export type Recommendation = {
  symbol: string; action: "add" | "hold" | "trim" | "exit" | "buy_new" | "watch"; conviction: string; horizon: string;
  summary: string; reasoning: string; evidence: { kind: string; point: string }[]; risks: string[]; changeMyMind: string;
};
export type SavedReview = {
  id: string; createdAt: string; sample: boolean; model: string; costUsd: number;
  review: {
    headline: string; assessment: string;
    portfolioRisks: { title: string; detail: string; severity: string }[];
    recommendations: Recommendation[]; dataGaps: string[];
  };
};
export type Progress = { type: "tool"; label: string; symbol?: string; ok?: boolean } | { type: "text"; delta: string };

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

/** POSTs to a server-sent-events route. Resolves with the `done` payload. */
export async function stream<T>(path: string, body: unknown, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const failure = await res.json().catch(() => ({}));
    throw new Error(failure.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error("The connection closed before the answer finished");
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1];
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!data) continue;
      const parsed = JSON.parse(data);
      if (event === "progress") onProgress(parsed);
      else if (event === "done") return parsed as T;
      else if (event === "failed") throw new Error(parsed.error);
    }
  }
}
