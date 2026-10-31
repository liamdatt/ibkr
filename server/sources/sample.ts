import type { Portfolio, PortfolioSource } from "./portfolio.ts";

const HOLDINGS: [string, string, number, number, number][] = [
  ["NVDA", "Technology", 120, 96, 186],
  ["MSFT", "Technology", 60, 310, 512],
  ["AAPL", "Technology", 110, 148, 344],
  ["JPM", "Financial", 70, 141, 298],
  ["XOM", "Energy", 150, 104, 118],
  ["COST", "Consumer, Non-cyclical", 18, 610, 930],
  ["UNH", "Consumer, Non-cyclical", 22, 520, 340],
];

/** Made-up holdings for trying the app. The interface labels them as a sample everywhere. */
export class SampleSource implements PortfolioSource {
  async read(): Promise<Portfolio> {
    const positions = HOLDINGS.map(([symbol, sector, quantity, avgPrice, price], i) => ({
      conid: String(1000 + i), symbol, description: symbol, assetClass: "STK", sector, quantity, avgPrice,
      price, marketValue: quantity * price, marketValueBase: quantity * price,
      unrealizedPnl: quantity * (price - avgPrice), realizedPnl: 0, currency: "USD",
    })).sort((a, b) => b.marketValueBase - a.marketValueBase);
    const cash = 24_500;
    const invested = positions.reduce((sum, p) => sum + p.marketValueBase, 0);
    return {
      status: { state: "sample" }, accountId: "Sample", baseCurrency: "USD",
      netLiquidation: invested + cash, cash,
      unrealizedPnl: positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
      positions, updatedAt: Date.now(),
    };
  }
}
