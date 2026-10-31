import { Agent as Dispatcher, fetch as undiciFetch } from "undici";
import type { Portfolio, PortfolioSource, PortfolioStatus, Position } from "./portfolio.ts";

/**
 * Talks to the IBKR Client Portal Gateway using the read-only side of the Web API.
 *
 * Nothing under /iserver is used: those endpoints need a brokerage session, which would
 * compete with TWS or the mobile app, and they include order entry. Every request must
 * match READ_ONLY_ROUTES, so this client has no way to reach a trading endpoint.
 */
const READ_ONLY_ROUTES: { method: string; path: RegExp }[] = [
  { method: "POST", path: /^\/tickle$/ },
  { method: "GET", path: /^\/portfolio\/accounts$/ },
  { method: "GET", path: /^\/portfolio2\/[\w-]+\/positions$/ },
  { method: "GET", path: /^\/portfolio\/[\w-]+\/ledger$/ },
];

const POSITIONS_MS = 4_000;
const LEDGER_MS = 15_000;
// IBKR allows /portfolio/accounts once per 5 seconds; a session needs it only before reading.
const ACCOUNTS_MS = 5 * 60_000;
// Sessions lapse after a few minutes without traffic.
const TICKLE_MS = 60_000;

// The gateway ships with a self-signed certificate, so this applies to gateway calls only.
const gatewayDispatcher = new Dispatcher({ connect: { rejectUnauthorized: false } });

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly kind: "down" | "auth",
  ) {
    super(message);
  }
}

export function assertReadOnly(method: string, path: string) {
  if (!READ_ONLY_ROUTES.some((r) => r.method === method && r.path.test(path))) {
    throw new Error(`Blocked ${method} ${path}: not on the read-only list`);
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const gatewayFetch: FetchLike = (url, init) =>
  undiciFetch(url, { ...(init as object), dispatcher: gatewayDispatcher }) as unknown as Promise<Response>;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const EXCHANGE_SUFFIX: Record<string, string> = {
  CAD: ".TO", GBP: ".L", AUD: ".AX", HKD: ".HK", JPY: ".T", CHF: ".SW", EUR: ".DE",
};

/** Maps an IBKR local symbol to Yahoo's: "BRK B" becomes "BRK-B", "VOD" in GBP becomes "VOD.L". */
export function yahooSymbol(description: string, secType: string, currency: string): string | null {
  if (secType !== "STK") return null;
  const base = description.trim().replace(/\s+/g, "-");
  if (!base) return null;
  return currency === "USD" ? base : `${base}${EXCHANGE_SUFFIX[currency] ?? ""}`;
}

export class IbkrSource implements PortfolioSource {
  private accountId: string | null = null;
  private baseCurrency = "USD";
  private accountsAt = 0;
  private tickleAt = 0;
  private ledgerAt = 0;
  private positionsAt = 0;
  private ledger: Record<string, Record<string, unknown>> = {};
  private rawPositions: Record<string, unknown>[] = [];
  private lastGood: Portfolio | null = null;
  private pending: Promise<Portfolio> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly preferredAccount?: string,
    private readonly fetchImpl: FetchLike = gatewayFetch,
    private readonly loginUrl = baseUrl,
  ) {}

  private async call<T>(method: "GET" | "POST", path: string): Promise<T> {
    assertReadOnly(method, path);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/api${path}`, {
        method,
        headers: { "User-Agent": "ibkr-desk", Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (e) {
      throw new GatewayError(`Can't reach the gateway at ${this.baseUrl} (${(e as Error).message})`, "down");
    }
    if (res.status === 401 || res.status === 403) {
      throw new GatewayError(`Log in at ${this.loginUrl} to connect your account`, "auth");
    }
    if (!res.ok) throw new GatewayError(`Gateway answered ${res.status} for ${path}`, "down");
    return (await res.json()) as T;
  }

  private async refresh(): Promise<Portfolio> {
    const now = Date.now();
    if (now - this.tickleAt > TICKLE_MS) {
      await this.call("POST", "/tickle");
      this.tickleAt = now;
    }
    if (!this.accountId || now - this.accountsAt > ACCOUNTS_MS) {
      const accounts = await this.call<{ id?: string; accountId?: string; currency?: string }[]>("GET", "/portfolio/accounts");
      const ids = accounts.map((a) => a.id ?? a.accountId).filter((id): id is string => !!id);
      const chosen = this.preferredAccount ?? ids[0];
      if (!chosen || !ids.includes(chosen)) {
        throw new GatewayError(
          this.preferredAccount
            ? `Account ${this.preferredAccount} isn't on this login (found ${ids.join(", ") || "none"})`
            : "This login has no accounts",
          "auth",
        );
      }
      this.accountId = chosen;
      this.baseCurrency = accounts.find((a) => (a.id ?? a.accountId) === chosen)?.currency ?? "USD";
      this.accountsAt = now;
    }
    const id = this.accountId;
    if (now - this.positionsAt > POSITIONS_MS) {
      this.rawPositions = await this.call("GET", `/portfolio2/${id}/positions`);
      this.positionsAt = now;
    }
    if (now - this.ledgerAt > LEDGER_MS) {
      this.ledger = await this.call("GET", `/portfolio/${id}/ledger`);
      this.ledgerAt = now;
    }
    return this.build(id);
  }

  private build(accountId: string): Portfolio {
    const base = this.ledger.BASE ?? {};
    // The ledger calls its summary entry "BASE", so the real currency code comes from the account.
    const baseCurrency = this.baseCurrency;
    // The ledger's exchangerate converts one unit of that currency into the base currency.
    const toBase = (currency: string) =>
      currency === baseCurrency ? 1 : (num(this.ledger[currency]?.exchangerate) ?? 1);

    const positions = this.rawPositions
      .map((p): Position | null => {
        const quantity = num(p.position) ?? 0;
        if (quantity === 0) return null;
        const description = String(p.description ?? p.contractDesc ?? p.conid ?? "");
        const assetClass = String(p.assetClass ?? p.secType ?? "");
        const currency = String(p.currency ?? baseCurrency);
        const marketValue = num(p.marketValue ?? p.mktValue) ?? 0;
        return {
          conid: String(p.conid),
          symbol: yahooSymbol(description, String(p.secType ?? assetClass), currency),
          description,
          assetClass,
          sector: (p.sector as string | undefined) || null,
          quantity,
          avgPrice: num(p.avgPrice) ?? 0,
          price: num(p.marketPrice ?? p.mktPrice) ?? 0,
          marketValue,
          marketValueBase: marketValue * toBase(currency),
          unrealizedPnl: num(p.unrealizedPnl) ?? 0,
          realizedPnl: num(p.realizedPnl) ?? 0,
          currency,
        };
      })
      .filter((p): p is Position => p !== null)
      .sort((a, b) => Math.abs(b.marketValueBase) - Math.abs(a.marketValueBase));

    return {
      status: { state: "live" },
      accountId,
      baseCurrency,
      netLiquidation: num(base.netliquidationvalue),
      cash: num(base.cashbalance),
      unrealizedPnl: num(base.unrealizedpnl),
      positions,
      updatedAt: Date.now(),
    };
  }

  private failed(error: unknown): Portfolio {
    if (!(error instanceof GatewayError)) throw error;
    this.tickleAt = 0;
    const status: PortfolioStatus =
      error.kind === "auth"
        ? { state: "login_required", detail: error.message }
        : { state: "gateway_down", detail: error.message };
    if (this.lastGood) return { ...this.lastGood, status: { state: "stale", detail: error.message } };
    return {
      status, accountId: null, baseCurrency: "USD", netLiquidation: null, cash: null,
      unrealizedPnl: null, positions: [], updatedAt: null,
    };
  }

  read(): Promise<Portfolio> {
    this.pending ??= this.refresh()
      .then((p) => (this.lastGood = p))
      .catch((e) => this.failed(e))
      .finally(() => (this.pending = null));
    return this.pending;
  }
}
