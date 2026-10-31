import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { latestReview, runChat, runReview, type Progress } from "../server/agent/runner.ts";
import { portfolioForModel, researchTools } from "../server/agent/tools.ts";
import { config } from "../server/config.ts";
import { SampleSource } from "../server/sources/sample.ts";

config.dataDir = mkdtempSync(join(tmpdir(), "desk-"));

function fakeLlm(apiKey = "test") {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  return { faux, llm: { models, model: faux.getModel() }, apiKey };
}

const review = {
  headline: "Technology is most of the book.",
  assessment: "Concentrated.",
  portfolioRisks: [{ title: "Concentration", detail: "NVDA and MSFT dominate.", severity: "high" }],
  recommendations: [{
    symbol: "NVDA", action: "trim", conviction: "medium", horizon: "months", summary: "Trim.", reasoning: "Weight.",
    evidence: [{ kind: "portfolio", point: "Largest holding" }], risks: ["Momentum continues"], changeMyMind: "Weight below 15%",
  }],
  dataGaps: [],
};

describe("research tools", () => {
  it("are all read-only and never expose the account number", async () => {
    const names = researchTools(new SampleSource()).map((t) => t.name);
    expect(names.every((n) => n.startsWith("get_"))).toBe(true);
    const seen = await portfolioForModel(new SampleSource());
    expect(JSON.stringify(seen)).not.toContain("accountId");
  });
});

describe("runReview", () => {
  it("saves the review the agent submits and stops there", async () => {
    const { faux, llm } = fakeLlm();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("get_portfolio", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxToolCall("submit_review", review)], { stopReason: "toolUse" }),
    ]);
    const events: Progress[] = [];
    const saved = await runReview(llm, new SampleSource(), "Retire in 20 years", (p) => events.push(p));
    expect(saved.review.recommendations[0]!.action).toBe("trim");
    expect(saved.sample).toBe(true);
    expect(events.some((e) => e.type === "tool" && e.label === "get_portfolio")).toBe(true);
    expect(faux.state.callCount).toBe(2);
    expect((await latestReview())?.id).toBe(saved.id);
  });

  it("nudges once when the agent forgets to submit, then fails clearly", async () => {
    const { faux, llm } = fakeLlm();
    faux.setResponses([fauxAssistantMessage([fauxText("All done")]), fauxAssistantMessage([fauxText("Still no")])]);
    await expect(runReview(llm, new SampleSource(), "", () => {})).rejects.toThrow(/without handing in/);
    expect(faux.state.callCount).toBe(2);
  });

  it("rejects a malformed review instead of saving it", async () => {
    const { faux, llm } = fakeLlm();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("submit_review", { headline: "only this" })], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("Sorry")]),
      fauxAssistantMessage([fauxText("Sorry")]),
    ]);
    await expect(runReview(llm, new SampleSource(), "", () => {})).rejects.toThrow(/without handing in/);
  });

  it("refuses to run with no holdings", async () => {
    const { llm } = fakeLlm();
    const empty = { read: async () => ({ ...(await new SampleSource().read()), positions: [] }) };
    await expect(runReview(llm, empty, "", () => {})).rejects.toThrow(/no holdings/);
  });

  it("surfaces provider errors", async () => {
    const { faux, llm } = fakeLlm();
    faux.setResponses([fauxAssistantMessage([], { stopReason: "error", errorMessage: "invalid x-api-key" })]);
    await expect(runReview(llm, new SampleSource(), "", () => {})).rejects.toThrow("invalid x-api-key");
  });
});

describe("runChat", () => {
  it("keeps context across turns of one chat", async () => {
    const { faux, llm } = fakeLlm();
    const seen = vi.fn();
    faux.setResponses([
      fauxAssistantMessage([fauxText("First")]),
      (context: any) => {
        seen(context.messages.length);
        return fauxAssistantMessage([fauxText("Second")]);
      },
    ]);
    const text: string[] = [];
    const emit = (p: Progress) => p.type === "text" && text.push(p.delta);
    await runChat(llm, new SampleSource(), "c1", "hello", emit);
    await runChat(llm, new SampleSource(), "c1", "again", emit);
    expect(text.join("")).toContain("First");
    expect(text.join("")).toContain("Second");
    expect(seen.mock.calls[0]![0]).toBeGreaterThanOrEqual(3);
  });
});
