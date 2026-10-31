import YahooFinance from "yahoo-finance2";
import { cached } from "../cache.ts";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number };

export type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  delayMinutes: number;
};

const INDICES = [
  ["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["DIA", "Dow Jones"], ["IWM", "Russell 2000"],
  ["^VIX", "Volatility (VIX)"], ["^TNX", "10-year yield"], ["DX-Y.NYB", "US dollar"],
  ["GC=F", "Gold"], ["CL=F", "Crude oil"], ["BTC-USD", "Bitcoin"],
] as const;

const SECTORS = [
  ["XLK", "Technology"], ["XLF", "Financials"], ["XLV", "Health care"], ["XLY", "Consumer discretionary"],
  ["XLP", "Consumer staples"], ["XLE", "Energy"], ["XLI", "Industrials"], ["XLB", "Materials"],
  ["XLU", "Utilities"], ["XLRE", "Real estate"], ["XLC", "Communication"],
] as const;

export function quotes(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols)].sort();
  if (unique.length === 0) return Promise.resolve([]);
  return cached(`quotes:${unique.join()}`, 30_000, async () => {
    const rows = await yahoo.quote(unique, {}, { validateResult: false });
    return (rows as any[]).map((q) => ({
      symbol: q.symbol,
      name: q.shortName ?? q.longName ?? q.symbol,
      price: q.regularMarketPrice ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      delayMinutes: q.exchangeDataDelayedBy ?? 0,
    }));
  });
}

export function history(symbol: string, years = 2): Promise<Bar[]> {
  return cached(`history:${symbol}:${years}`, 15 * 60_000, async () => {
    const period1 = new Date(Date.now() - years * 365.25 * 864e5);
    const { quotes: rows } = await yahoo.chart(symbol, { period1, interval: "1d" });
    return rows
      .filter((r) => r.open != null && r.high != null && r.low != null && r.close != null)
      .map((r) => ({
        time: r.date.toISOString().slice(0, 10),
        open: r.open!, high: r.high!, low: r.low!, close: r.close!, volume: r.volume ?? 0,
      }));
  });
}

export type NewsItem = { title: string; publisher: string; link: string; publishedAt: string; tickers: string[] };

export function news(query: string, count = 12): Promise<NewsItem[]> {
  return cached(`news:${query}:${count}`, 5 * 60_000, async () => {
    const result = await yahoo.search(query, { newsCount: count, quotesCount: 0 }, { validateResult: false });
    return ((result as any).news ?? []).map((n: any) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishedAt: new Date(n.providerPublishTime).toISOString(),
      tickers: n.relatedTickers ?? [],
    }));
  });
}

export async function marketOverview() {
  const symbols = [...INDICES, ...SECTORS].map(([s]) => s);
  const rows = new Map((await quotes(symbols)).map((q) => [q.symbol, q]));
  const label = ([symbol, name]: readonly [string, string]) => ({
    symbol, name, price: rows.get(symbol)?.price ?? null, changePercent: rows.get(symbol)?.changePercent ?? null,
  });
  return { indices: INDICES.map(label), sectors: SECTORS.map(label) };
}

export function movers() {
  return cached("movers", 5 * 60_000, async () => {
    const list = async (scrIds: "day_gainers" | "day_losers" | "most_actives") => {
      const r = await yahoo.screener({ scrIds, count: 8 }, undefined, { validateResult: false });
      return ((r as any).quotes as any[]).map((q) => ({
        symbol: q.symbol, name: q.shortName ?? q.symbol, price: q.regularMarketPrice ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
      }));
    };
    const [gainers, losers, active] = await Promise.all([list("day_gainers"), list("day_losers"), list("most_actives")]);
    return { gainers, losers, active };
  });
}

const raw = (v: any): number | null => (typeof v === "number" ? v : (v?.raw ?? null));

export function fundamentals(symbol: string) {
  return cached(`fundamentals:${symbol}`, 60 * 60_000, async () => {
    const period1 = new Date(Date.now() - 2.5 * 365.25 * 864e5);
    const [s, statements] = await Promise.all([
      yahoo.quoteSummary(
        symbol,
        { modules: ["price", "summaryDetail", "financialData", "defaultKeyStatistics", "assetProfile", "calendarEvents", "recommendationTrend"] },
        { validateResult: false },
      ) as Promise<any>,
      yahoo
        .fundamentalsTimeSeries(symbol, { period1, type: "quarterly", module: "financials" }, { validateResult: false })
        .catch(() => []) as Promise<any[]>,
    ]);
    const { price: p, summaryDetail: d, financialData: f, defaultKeyStatistics: k, assetProfile: a } = s;
    const earnings = s.calendarEvents?.earnings?.earningsDate?.[0];
    return {
      symbol,
      name: p?.longName ?? p?.shortName ?? symbol,
      currency: p?.currency ?? null,
      sector: a?.sector ?? null,
      industry: a?.industry ?? null,
      summary: a?.longBusinessSummary ?? null,
      nextEarnings: earnings ? new Date(earnings).toISOString().slice(0, 10) : null,
      valuation: {
        marketCap: raw(p?.marketCap), trailingPE: raw(d?.trailingPE), forwardPE: raw(d?.forwardPE ?? k?.forwardPE),
        priceToBook: raw(k?.priceToBook), priceToSales: raw(d?.priceToSalesTrailing12Months),
        evToEbitda: raw(k?.enterpriseToEbitda), pegRatio: raw(k?.pegRatio),
      },
      profitability: {
        grossMargin: raw(f?.grossMargins), operatingMargin: raw(f?.operatingMargins), netMargin: raw(f?.profitMargins),
        returnOnEquity: raw(f?.returnOnEquity), returnOnAssets: raw(f?.returnOnAssets),
      },
      growth: { revenueGrowth: raw(f?.revenueGrowth), earningsGrowth: raw(f?.earningsGrowth) },
      health: {
        totalCash: raw(f?.totalCash), totalDebt: raw(f?.totalDebt), debtToEquity: raw(f?.debtToEquity),
        currentRatio: raw(f?.currentRatio), freeCashFlow: raw(f?.freeCashflow),
      },
      income: { dividendYield: raw(d?.dividendYield), payoutRatio: raw(d?.payoutRatio) },
      analysts: {
        rating: f?.recommendationKey ?? null, opinions: raw(f?.numberOfAnalystOpinions),
        targetLow: raw(f?.targetLowPrice), targetMean: raw(f?.targetMeanPrice), targetHigh: raw(f?.targetHighPrice),
      },
      quarters: statements
        .filter((q) => q.totalRevenue != null)
        .slice(-8)
        .map((q) => ({
          date: new Date(q.date).toISOString().slice(0, 10),
          revenue: q.totalRevenue as number,
          netIncome: (q.netIncome ?? null) as number | null,
        })),
    };
  });
}

export function searchSymbols(query: string) {
  return cached(`symbols:${query}`, 60 * 60_000, async () => {
    const r = await yahoo.search(query, { quotesCount: 8, newsCount: 0 }, { validateResult: false });
    return ((r as any).quotes as any[])
      .filter((q) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"))
      .map((q) => ({ symbol: q.symbol as string, name: (q.shortname ?? q.longname ?? q.symbol) as string, exchange: q.exchDisp as string }));
  });
}
