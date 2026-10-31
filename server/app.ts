import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { existsSync } from "node:fs";
import { aiConfigured, type Llm } from "./agent/llm.ts";
import { latestReview, runChat, runReview, type Progress } from "./agent/runner.ts";
import { config } from "./config.ts";
import * as market from "./sources/market.ts";
import type { PortfolioSource } from "./sources/portfolio.ts";
import { analyze } from "./technicals.ts";

const SYMBOL = /^[A-Za-z0-9.^=-]{1,15}$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function createApp(source: PortfolioSource, llm: Llm) {
  const app = new Hono();

  // The server holds account data and can spend API credit, so it only answers its own pages.
  // The Host check stops DNS rebinding; the Origin check stops other websites.
  const allowed = (host: string) => LOCAL_HOST.test(host) || host === config.publicHost;
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    const originHost = origin?.replace(/^https?:\/\//, "");
    if (!allowed(c.req.header("host") ?? "") || (originHost && !allowed(originHost))) {
      return c.json({ error: "This dashboard doesn't accept requests from that address" }, 403);
    }
    await next();
  });

  if (config.password) {
    app.use("*", basicAuth({ username: "desk", password: config.password, realm: "IBKR Desk" }));
  }

  app.onError((err, c) => (err instanceof HTTPException ? err.getResponse() : c.json({ error: err.message }, 502)));

  app.get("/api/status", async (c) => {
    return c.json({ ai: await aiConfigured(llm), model: llm.model.id, source: config.portfolioSource, gatewayUrl: config.gatewayUrl });
  });

  app.get("/api/portfolio", async (c) => {
    const portfolio = await source.read();
    const symbols = portfolio.positions.flatMap((p) => (p.symbol ? [p.symbol] : []));
    const quotes = await market.quotes(symbols).catch(() => []);
    const dayChange = Object.fromEntries(quotes.map((q) => [q.symbol, q.changePercent]));
    return c.json({ ...portfolio, dayChange });
  });

  app.get("/api/market", async (c) => c.json(await market.marketOverview()));
  app.get("/api/market/movers", async (c) => c.json(await market.movers()));
  app.get("/api/news", async (c) => c.json(await market.news(c.req.query("q")?.slice(0, 80) || "stock market", 20)));
  app.get("/api/symbols", async (c) => c.json(await market.searchSymbols((c.req.query("q") ?? "").slice(0, 40))));

  app.use("/api/stock/:symbol/*", async (c, next) => {
    if (!SYMBOL.test(c.req.param("symbol")!)) return c.json({ error: "That isn't a valid ticker" }, 400);
    await next();
  });

  app.get("/api/stock/:symbol/technicals", async (c) => {
    const bars = await market.history(c.req.param("symbol"));
    if (bars.length < 30) return c.json({ error: "Not enough price history for this ticker" }, 404);
    const { series, summary } = analyze(bars);
    return c.json({ bars, series, summary });
  });

  app.get("/api/stock/:symbol/fundamentals", async (c) => c.json(await market.fundamentals(c.req.param("symbol"))));

  const streamAgent = (c: any, run: (emit: (p: Progress) => void, signal: AbortSignal) => Promise<unknown>) =>
    streamSSE(c, async (stream) => {
      const aborter = new AbortController();
      stream.onAbort(() => aborter.abort());
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      let writes = Promise.resolve();
      const emit = (p: Progress) => {
        writes = writes.then(() => send("progress", p));
      };
      try {
        const done = await run(emit, aborter.signal);
        await writes;
        await send("done", done ?? {});
      } catch (e) {
        await writes;
        await send("failed", { error: (e as Error).message });
      }
    });

  app.get("/api/ai/review", async (c) => c.json(await latestReview()));

  app.post("/api/ai/review", async (c) => {
    if (!(await aiConfigured(llm))) return c.json({ error: "Add ANTHROPIC_API_KEY to .env to use the advisor" }, 400);
    const { goals } = await c.req.json<{ goals?: string }>().catch(() => ({ goals: "" }));
    return streamAgent(c, (emit, signal) => runReview(llm, source, (goals ?? "").slice(0, 2000), emit, signal));
  });

  app.post("/api/ai/chat", async (c) => {
    if (!(await aiConfigured(llm))) return c.json({ error: "Add ANTHROPIC_API_KEY to .env to use the advisor" }, 400);
    const { chatId, message } = await c.req.json<{ chatId: string; message: string }>();
    if (!chatId || !message?.trim()) return c.json({ error: "Type a question first" }, 400);
    return streamAgent(c, (emit, signal) => runChat(llm, source, chatId, message.slice(0, 4000), emit, signal));
  });

  if (existsSync("dist")) {
    app.use("/*", serveStatic({ root: "./dist" }));
    app.get("*", serveStatic({ path: "./dist/index.html" }));
  }
  return app;
}
