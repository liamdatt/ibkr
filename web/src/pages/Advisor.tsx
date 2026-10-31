import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import { Link } from "react-router-dom";
import { get, stream, type Progress, type Recommendation, type SavedReview, type Status } from "../api";
import { Failure, Section } from "../components/Common";

const ACTIONS: Record<Recommendation["action"], string> = {
  add: "Add", hold: "Hold", trim: "Trim", exit: "Exit", buy_new: "Buy new", watch: "Watch",
};

const STEPS: Record<string, string> = {
  get_portfolio: "Reading your portfolio", get_market_overview: "Checking the market", get_market_movers: "Scanning movers",
  get_technicals: "Technicals", get_fundamentals: "Fundamentals", get_news: "News", submit_review: "Writing up the review",
};

function RecommendationRow({ r }: { r: Recommendation }) {
  return (
    <details className="rec">
      <summary>
        <span className={`action action-${r.action}`}>{ACTIONS[r.action]}</span>
        <b>{r.symbol}</b>
        <span className="rec-summary">{r.summary}</span>
        <small>{r.conviction} conviction, {r.horizon}</small>
      </summary>
      <div className="rec-body">
        <p>{r.reasoning}</p>
        <h4>Evidence</h4>
        <ul>{r.evidence.map((e) => <li key={e.point}><b>{e.kind}:</b> {e.point}</li>)}</ul>
        <h4>What could go wrong</h4>
        <ul>{r.risks.map((x) => <li key={x}>{x}</li>)}</ul>
        <h4>What would change this view</h4>
        <p>{r.changeMyMind}</p>
        <Link to={`/stock/${encodeURIComponent(r.symbol)}`}>Open {r.symbol}</Link>
      </div>
    </details>
  );
}

function ReviewPanel({ saved }: { saved: SavedReview }) {
  const { review } = saved;
  return (
    <article className="review">
      <p className="review-meta">
        Written {new Date(saved.createdAt).toLocaleString()} by {saved.model}, cost ${saved.costUsd.toFixed(2)}
        {saved.sample && ". Based on sample holdings"}
      </p>
      <h2>{review.headline}</h2>
      <p>{review.assessment}</p>
      {review.portfolioRisks.length > 0 && (
        <>
          <h3>Portfolio risks</h3>
          <ul className="risks">
            {review.portfolioRisks.map((r) => (
              <li key={r.title}><b>{r.title}</b> <small>{r.severity}</small><span>{r.detail}</span></li>
            ))}
          </ul>
        </>
      )}
      <h3>Recommendations</h3>
      {review.recommendations.map((r) => <RecommendationRow key={r.symbol} r={r} />)}
      {review.dataGaps.length > 0 && (
        <>
          <h3>Gaps in the data</h3>
          <ul>{review.dataGaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </>
      )}
    </article>
  );
}

function Chat() {
  const chatId = useRef(crypto.randomUUID());
  const [turns, setTurns] = useState<{ role: "you" | "advisor"; text: string }[]>([]);
  const [text, setText] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setError(null);
    setBusy(true);
    setTurns((t) => [...t, { role: "you", text: message }, { role: "advisor", text: "" }]);
    try {
      await stream("/api/ai/chat", { chatId: chatId.current, message }, (p: Progress) => {
        if (p.type === "tool") setActivity(p.ok === undefined ? `${STEPS[p.label] ?? p.label}${p.symbol ? `: ${p.symbol}` : ""}` : null);
        else setTurns((t) => [...t.slice(0, -1), { role: "advisor", text: t.at(-1)!.text + p.delta }]);
      });
    } catch (err) {
      setError(err as Error);
    }
    setActivity(null);
    setBusy(false);
  };

  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        {turns.length === 0 && <p className="quiet">Ask about a holding, a sector or the market. The advisor can read your portfolio and look up current data.</p>}
        {turns.map((t, i) => (
          <div key={i} className={`turn turn-${t.role}`}>{t.role === "advisor" ? <Markdown>{t.text}</Markdown> : t.text}</div>
        ))}
        {busy && <p className="quiet" role="status">{activity ?? "Thinking"}</p>}
        {error && <Failure error={error} />}
      </div>
      <form onSubmit={send}>
        <input aria-label="Ask the advisor" placeholder="How exposed am I to a rate cut?" value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy || !text.trim()}>Ask</button>
      </form>
    </div>
  );
}

export function AdvisorPage() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["status"], queryFn: () => get<Status>("/api/status"), staleTime: 60_000 });
  const saved = useQuery({ queryKey: ["review"], queryFn: () => get<SavedReview | null>("/api/ai/review") });
  const [goals, setGoals] = useState(() => localStorage.getItem("goals") ?? "");
  const [steps, setSteps] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const aborter = useRef<AbortController | null>(null);

  const run = async () => {
    localStorage.setItem("goals", goals);
    setError(null);
    setSteps([]);
    setRunning(true);
    aborter.current = new AbortController();
    try {
      const result = await stream<SavedReview>("/api/ai/review", { goals }, (p) => {
        if (p.type === "tool" && p.ok === undefined) {
          setSteps((s) => [...s, `${STEPS[p.label] ?? p.label}${p.symbol ? `: ${p.symbol}` : ""}`]);
        }
      }, aborter.current.signal);
      queryClient.setQueryData(["review"], result);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e as Error);
    }
    setRunning(false);
  };

  if (status.data && !status.data.ai) {
    return (
      <section className="connect">
        <h1>Connect Claude to use the advisor</h1>
        <p>Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart the app.</p>
      </section>
    );
  }

  return (
    <>
      <h1 className="page-title">Advisor</h1>
      <div className="advisor">
        <div>
          <section className="review-form">
            <label htmlFor="goals">Your goals and limits</label>
            <textarea
              id="goals" rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} disabled={running}
              placeholder="Long-term growth, 15-year horizon. No single stock above 15%. Keep $20k in cash."
            />
            <div className="review-actions">
              {running
                ? <button className="secondary" onClick={() => aborter.current?.abort()}>Stop review</button>
                : <button onClick={run}>Review my portfolio</button>}
              <span className="quiet">Uses your Anthropic credit and takes a few minutes.</span>
            </div>
          </section>
          {running && (
            <ol className="steps" role="status">
              {steps.slice(-6).map((s, i) => <li key={`${s}${i}`}>{s}</li>)}
              {steps.length === 0 && <li>Starting</li>}
            </ol>
          )}
          {error && <Failure error={error} />}
          {saved.error && <Failure error={saved.error} />}
          {saved.data
            ? <ReviewPanel saved={saved.data} />
            : !running && !saved.isPending && <p className="quiet">No review yet. Your first one will appear here.</p>}
        </div>
        <Section title="Ask the advisor"><Chat /></Section>
      </div>
    </>
  );
}
