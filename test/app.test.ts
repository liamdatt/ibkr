import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app.ts";
import { config } from "../server/config.ts";
import { SampleSource } from "../server/sources/sample.ts";

const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);
const app = createApp(new SampleSource(), { models, model: faux.getModel() });
const local = { host: "127.0.0.1:8787" };

describe("local-only guard", () => {
  it("answers this machine", async () => {
    expect((await app.request("/api/status", { headers: local })).status).toBe(200);
  });

  it("refuses a rebinding host", async () => {
    expect((await app.request("/api/status", { headers: { host: "evil.example" } })).status).toBe(403);
  });

  it("refuses another website's page", async () => {
    const res = await app.request("/api/ai/review", { method: "POST", headers: { ...local, origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("refuses a lookalike origin", async () => {
    const res = await app.request("/api/status", { headers: { ...local, origin: "http://localhost.evil.example" } });
    expect(res.status).toBe(403);
  });
});

it("rejects bad tickers before calling Yahoo", async () => {
  expect((await app.request("/api/stock/a%20b%3Bc/technicals", { headers: local })).status).toBe(400);
});

describe("hosted mode", () => {
  const hosted = { host: "desk.example.com" };
  const basic = (password: string) => `Basic ${btoa(`desk:${password}`)}`;

  afterAll(() => {
    config.publicHost = undefined;
    config.password = undefined;
  });

  it("requires the password on every route", async () => {
    config.publicHost = "desk.example.com";
    config.password = "correct-horse-battery";
    const secured = createApp(new SampleSource(), { models, model: faux.getModel() });
    expect((await secured.request("/api/portfolio", { headers: hosted })).status).toBe(401);
    expect((await secured.request("/", { headers: hosted })).status).toBe(401);
    expect((await secured.request("/api/ai/review", { method: "POST", headers: hosted })).status).toBe(401);
    expect((await secured.request("/api/portfolio", { headers: { ...hosted, authorization: basic("wrong") } })).status).toBe(401);
    expect((await secured.request("/api/status", { headers: { ...hosted, authorization: basic("correct-horse-battery") } })).status).toBe(200);
  });
});
