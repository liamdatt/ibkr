import { serve } from "@hono/node-server";
import { claude } from "./agent/llm.ts";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { IbkrSource } from "./sources/ibkr.ts";
import { SampleSource } from "./sources/sample.ts";

const source = config.portfolioSource === "sample" ? new SampleSource() : new IbkrSource(config.gatewayUrl, config.accountId, undefined, config.gatewayLoginUrl);

const loopback = config.host === "127.0.0.1" || config.host === "localhost";
if (!loopback && (!config.password || config.password.length < 16)) {
  throw new Error("Refusing to listen on a public address without an APP_PASSWORD of at least 16 characters");
}

serve({ fetch: createApp(source, claude()).fetch, hostname: config.host, port: config.port }, ({ port }) => {
  console.log(`IBKR Desk on http://${config.host}:${port} (portfolio: ${config.portfolioSource})`);
});
