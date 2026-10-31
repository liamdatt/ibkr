import { join } from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "127.0.0.1",
  // Set both of these when the app is reachable from anywhere but this machine.
  publicHost: process.env.PUBLIC_HOST || undefined,
  password: process.env.APP_PASSWORD || undefined,
  portfolioSource: process.env.PORTFOLIO_SOURCE === "sample" ? ("sample" as const) : ("ibkr" as const),
  gatewayUrl: (process.env.IBKR_GATEWAY_URL ?? "https://localhost:5000").replace(/\/$/, ""),
  // Where you open the gateway in a browser, when that differs from where the server reaches it.
  gatewayLoginUrl: (process.env.IBKR_LOGIN_URL ?? process.env.IBKR_GATEWAY_URL ?? "https://localhost:5000").replace(/\/$/, ""),
  accountId: process.env.IBKR_ACCOUNT_ID || undefined,
  aiModel: process.env.AI_MODEL ?? "claude-opus-5-5",
  dataDir: process.env.DATA_DIR ?? join(process.cwd(), "data"),
};
