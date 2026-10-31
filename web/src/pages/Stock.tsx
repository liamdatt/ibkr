import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { get, type Fundamentals, type News, type Portfolio, type Technicals } from "../api";
import { Change, Failure, Loading, NewsList, Section } from "../components/Common";
import { PriceChart } from "../components/PriceChart";
import { compact, direction, money, percent, plain, price, ratio } from "../format";

type Metric = [string, string];

const Metrics = ({ title, rows }: { title: string; rows: Metric[] }) => (
  <div className="metrics">
    <h3>{title}</h3>
    <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  </div>
);

function QuarterBars({ title, values, labels }: { title: string; values: (number | null)[]; labels: string[] }) {
  const max = Math.max(...values.map((v) => Math.abs(v ?? 0)), 1);
  return (
    <div className="quarters">
      <h3>{title}</h3>
      <ol>
        {values.map((v, i) => (
          <li key={labels[i]} title={`${labels[i]}: ${compact(v)}`}>
            <i className={(v ?? 0) < 0 ? "down" : ""} style={{ height: `${(Math.abs(v ?? 0) / max) * 100}%` }} />
          </li>
        ))}
      </ol>
      <p><span>{labels[0]}</span><span>{compact(values.at(-1))} in {labels.at(-1)}</span></p>
    </div>
  );
}

function FundamentalsPanel({ f }: { f: Fundamentals }) {
  const c = f.currency ?? "USD";
  const labels = f.quarters.map((q) => q.date.slice(0, 7));
  return (
    <>
      {f.summary && <p className="company-summary">{f.summary}</p>}
      <div className="metric-grid">
        <Metrics title="Valuation" rows={[
          ["Market cap", compact(f.valuation.marketCap)], ["P/E", plain(f.valuation.trailingPE)],
          ["Forward P/E", plain(f.valuation.forwardPE)], ["EV/EBITDA", plain(f.valuation.evToEbitda)],
          ["Price/sales", plain(f.valuation.priceToSales)], ["Price/book", plain(f.valuation.priceToBook)],
        ]} />
        <Metrics title="Profitability" rows={[
          ["Gross margin", ratio(f.profitability.grossMargin)], ["Operating margin", ratio(f.profitability.operatingMargin)],
          ["Net margin", ratio(f.profitability.netMargin)], ["Return on equity", ratio(f.profitability.returnOnEquity)],
          ["Revenue growth", ratio(f.growth.revenueGrowth)], ["Earnings growth", ratio(f.growth.earningsGrowth)],
        ]} />
        <Metrics title="Financial health" rows={[
          ["Cash", compact(f.health.totalCash)], ["Debt", compact(f.health.totalDebt)],
          ["Debt/equity", plain(f.health.debtToEquity)], ["Current ratio", plain(f.health.currentRatio, 2)],
          ["Free cash flow", compact(f.health.freeCashFlow)], ["Dividend yield", ratio(f.income.dividendYield)],
        ]} />
        <Metrics title="Analysts" rows={[
          ["Rating", f.analysts.rating?.replace("_", " ") ?? "–"], ["Opinions", plain(f.analysts.opinions, 0)],
          ["Target low", money(f.analysts.targetLow, c, 2)], ["Target mean", money(f.analysts.targetMean, c, 2)],
          ["Target high", money(f.analysts.targetHigh, c, 2)], ["Next earnings", f.nextEarnings ?? "–"],
        ]} />
      </div>
      {f.quarters.length > 1 && (
        <div className="two-up">
          <QuarterBars title="Quarterly revenue" values={f.quarters.map((q) => q.revenue)} labels={labels} />
          <QuarterBars title="Quarterly net income" values={f.quarters.map((q) => q.netIncome)} labels={labels} />
        </div>
      )}
    </>
  );
}

export function StockPage() {
  const symbol = useParams().symbol!.toUpperCase();
  const encoded = encodeURIComponent(symbol);
  const technicals = useQuery({ queryKey: ["technicals", symbol], queryFn: () => get<Technicals>(`/api/stock/${encoded}/technicals`) });
  const fundamentals = useQuery({ queryKey: ["fundamentals", symbol], queryFn: () => get<Fundamentals>(`/api/stock/${encoded}/fundamentals`) });
  const news = useQuery({ queryKey: ["news", symbol], queryFn: () => get<News[]>(`/api/news?q=${encoded}`) });
  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: () => get<Portfolio>("/api/portfolio") });
  const held = portfolio.data?.positions.find((p) => p.symbol === symbol);
  const summary = technicals.data?.summary;

  return (
    <>
      <div className="stock-head">
        <div>
          <h1>{symbol}</h1>
          <p>{fundamentals.data ? [fundamentals.data.name, fundamentals.data.industry].filter(Boolean).join(", ") : " "}</p>
        </div>
        {summary && (
          <div className="stock-price">
            <b>{price(summary.price)}</b>
            <span>Close on {summary.asOf}</span>
          </div>
        )}
      </div>
      {held && (
        <p className="held">
          You hold {held.quantity.toLocaleString("en-US")} at {price(held.avgPrice)}, worth {money(held.marketValue, held.currency)}.
          {" "}Unrealized P&amp;L: <span className={direction(held.unrealizedPnl)}>{money(held.unrealizedPnl, held.currency)}</span>.
        </p>
      )}
      {technicals.isPending ? <Loading what="the chart" /> : technicals.error ? <Failure error={technicals.error} /> : (
        <div className="stock-grid">
          <PriceChart data={technicals.data} />
          <aside>
            <h2>Technical readings</h2>
            <ul className="readings">
              {summary!.readings.map((r) => (
                <li key={r.label}>
                  <b>{r.label}{r.lean !== "neutral" && <em className={r.lean === "bullish" ? "up" : "down"}>{r.lean}</em>}</b>
                  <span>{r.detail}</span>
                </li>
              ))}
            </ul>
            <dl className="returns">
              <div><dt>1 month</dt><dd><Change value={summary!.return1m} /></dd></div>
              <div><dt>3 months</dt><dd><Change value={summary!.return3m} /></dd></div>
              <div><dt>1 year</dt><dd><Change value={summary!.return1y} /></dd></div>
              <div><dt>Daily range</dt><dd>{plain(summary!.atrPercent)}%</dd></div>
            </dl>
          </aside>
        </div>
      )}
      <div className="research-grid">
        <Section title="Fundamentals">
          {fundamentals.isPending ? <Loading what="fundamentals" /> : fundamentals.error ? <Failure error={fundamentals.error} /> : <FundamentalsPanel f={fundamentals.data} />}
        </Section>
        <Section title="News">
          {news.isPending ? <Loading what="headlines" /> : news.error ? <Failure error={news.error} /> : <NewsList items={news.data.slice(0, 10)} />}
        </Section>
      </div>
    </>
  );
}
