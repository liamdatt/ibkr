export type Position = {
  conid: string;
  /** Yahoo symbol for research, or null when there is no stock to look up. */
  symbol: string | null;
  description: string;
  assetClass: string;
  sector: string | null;
  quantity: number;
  avgPrice: number;
  price: number;
  marketValue: number;
  /** Market value in the account's base currency. */
  marketValueBase: number;
  unrealizedPnl: number;
  realizedPnl: number;
  currency: string;
};

export type PortfolioStatus =
  | { state: "live" }
  | { state: "sample" }
  | { state: "gateway_down"; detail: string }
  | { state: "login_required"; detail: string }
  /** Gateway stopped answering after a good read. The figures shown are the last ones received. */
  | { state: "stale"; detail: string };

export type Portfolio = {
  status: PortfolioStatus;
  accountId: string | null;
  baseCurrency: string;
  netLiquidation: number | null;
  cash: number | null;
  unrealizedPnl: number | null;
  positions: Position[];
  updatedAt: number | null;
};

export interface PortfolioSource {
  read(): Promise<Portfolio>;
}
