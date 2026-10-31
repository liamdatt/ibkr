import { describe, expect, it, vi } from "vitest";
import { assertReadOnly, IbkrSource, yahooSymbol } from "../server/sources/ibkr.ts";

// Response shapes follow the examples in IBKR's Web API documentation.
const ledger = {
  BASE: { currency: "BASE", netliquidationvalue: 50_000, cashbalance: 4_000, unrealizedpnl: 900 },
  USD: { exchangerate: 1 },
  EUR: { exchangerate: 1.1 },
};
const positions = [
  { position: 12.0, conid: "9408", avgPrice: 266.2, currency: "USD", description: "MCD", marketPrice: 258.83, marketValue: 3105.96, realizedPnl: 0, secType: "STK", unrealizedPnl: 88.5, assetClass: "STK", sector: "Consumer, Cyclical" },
  { position: 10, conid: "2", avgPrice: 90, currency: "EUR", description: "SAP", mktPrice: 100, mktValue: 1000, unrealizedPnl: 100, secType: "STK", assetClass: "STK" },
  { position: 0, conid: "3", description: "CLOSED", secType: "STK", assetClass: "STK", currency: "USD" },
];

function gateway(overrides: Record<string, () => Response> = {}) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace("https://gw/v1/api", "");
    calls.push(`${init.method} ${path}`);
    const route = overrides[path];
    if (route) return route();
    if (path === "/tickle") return Response.json({ session: "x" });
    if (path === "/portfolio/accounts") return Response.json([{ id: "U1234567", currency: "USD" }]);
    if (path.endsWith("/positions")) return Response.json(positions);
    if (path.endsWith("/ledger")) return Response.json(ledger);
    return new Response("nope", { status: 404 });
  });
  return { calls, fetchImpl };
}

describe("read-only guard", () => {
  it.each([
    ["POST", "/iserver/account/U1/orders"],
    ["POST", "/iserver/auth/ssodh/init"],
    ["GET", "/iserver/marketdata/snapshot"],
    ["DELETE", "/iserver/account/U1/order/1"],
    ["POST", "/portfolio/accounts"],
    ["GET", "/portfolio/U1/../../iserver/accounts"],
  ])("blocks %s %s", (method, path) => {
    expect(() => assertReadOnly(method, path)).toThrow(/Blocked/);
  });

  it("allows the portfolio reads", () => {
    expect(() => assertReadOnly("GET", "/portfolio2/U1234567/positions")).not.toThrow();
  });
});

describe("IbkrSource", () => {
  it("reads accounts before positions, and never touches /iserver", async () => {
    const { calls, fetchImpl } = gateway();
    await new IbkrSource("https://gw", undefined, fetchImpl).read();
    expect(calls).toEqual([
      "POST /tickle",
      "GET /portfolio/accounts",
      "GET /portfolio2/U1234567/positions",
      "GET /portfolio/U1234567/ledger",
    ]);
  });

  it("normalises both price field spellings and converts to base currency", async () => {
    const p = await new IbkrSource("https://gw", undefined, gateway().fetchImpl).read();
    expect(p.status).toEqual({ state: "live" });
    expect(p.netLiquidation).toBe(50_000);
    expect(p.baseCurrency).toBe("USD");
    expect(p.positions.map((h) => h.description)).toEqual(["MCD", "SAP"]);
    const sap = p.positions[1]!;
    expect(sap.price).toBe(100);
    expect(sap.marketValueBase).toBeCloseTo(1100);
    expect(sap.symbol).toBe("SAP.DE");
  });

  it("asks for a login on 401", async () => {
    const { fetchImpl } = gateway({ "/tickle": () => new Response("", { status: 401 }) });
    const p = await new IbkrSource("https://gw", undefined, fetchImpl).read();
    expect(p.status.state).toBe("login_required");
    expect(p.positions).toEqual([]);
  });

  it("reports a stopped gateway with no made-up figures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const p = await new IbkrSource("https://gw", undefined, fetchImpl).read();
    expect(p.status.state).toBe("gateway_down");
    expect(p.netLiquidation).toBeNull();
  });

  it("keeps the last figures but marks them stale when the gateway drops", async () => {
    let up = true;
    const live = gateway().fetchImpl;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (!up) throw new Error("ECONNREFUSED");
      return live(url, init);
    });
    const source = new IbkrSource("https://gw", undefined, fetchImpl);
    await source.read();
    up = false;
    vi.useFakeTimers({ now: Date.now() + 120_000 });
    const p = await source.read();
    vi.useRealTimers();
    expect(p.status.state).toBe("stale");
    expect(p.positions).toHaveLength(2);
  });

  it("rejects an account that isn't on the login", async () => {
    const p = await new IbkrSource("https://gw", "U999", gateway().fetchImpl).read();
    expect(p.status.state).toBe("login_required");
  });
});

describe("yahooSymbol", () => {
  it("maps IBKR symbols", () => {
    expect(yahooSymbol("BRK B", "STK", "USD")).toBe("BRK-B");
    expect(yahooSymbol("VOD", "STK", "GBP")).toBe("VOD.L");
    expect(yahooSymbol("AAPL  OCT2026 200 C", "OPT", "USD")).toBeNull();
  });
});
