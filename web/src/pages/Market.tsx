import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { get, type News, type Row } from "../api";
import { Failure, Loading, NewsList, QuoteList, Section } from "../components/Common";
import { direction, percent, price } from "../format";

function SectorBars({ rows }: { rows: Row[] }) {
  const sorted = [...rows].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  const max = Math.max(...sorted.map((r) => Math.abs(r.changePercent ?? 0)), 0.5);
  return (
    <ul className="sectors">
      {sorted.map((r) => {
        const v = r.changePercent ?? 0;
        return (
          <li key={r.symbol} title={`${r.name} (${r.symbol}): ${percent(r.changePercent)}`}>
            <Link to={`/stock/${r.symbol}`}>{r.name}</Link>
            <span className="sector-track">
              <i className={direction(v)} style={{ width: `${(Math.abs(v) / max) * 50}%`, [v >= 0 ? "left" : "right"]: "50%" }} />
            </span>
            <span className={`num ${direction(v)}`}>{percent(r.changePercent)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function MarketPage() {
  const overview = useQuery({
    queryKey: ["market"], queryFn: () => get<{ indices: Row[]; sectors: Row[] }>("/api/market"), refetchInterval: 60_000,
  });
  const movers = useQuery({
    queryKey: ["movers"], queryFn: () => get<{ gainers: Row[]; losers: Row[]; active: Row[] }>("/api/market/movers"),
  });
  const news = useQuery({ queryKey: ["news", "market"], queryFn: () => get<News[]>("/api/news?q=stock%20market") });
  return (
    <>
      <h1 className="page-title">Market today</h1>
      {overview.isPending ? <Loading what="market data" /> : overview.error ? <Failure error={overview.error} /> : (
        <>
          <ul className="index-strip">
            {overview.data.indices.map((r) => (
              <li key={r.symbol}>
                <span>{r.name}</span>
                <b>{price(r.price)}</b>
                <span className={direction(r.changePercent)}>{percent(r.changePercent)}</span>
              </li>
            ))}
          </ul>
          <div className="two-up">
            <Section title="Sectors"><SectorBars rows={overview.data.sectors} /></Section>
            <Section title="Headlines">
              {news.isPending ? <Loading what="headlines" /> : news.error ? <Failure error={news.error} /> : <NewsList items={news.data.slice(0, 8)} />}
            </Section>
          </div>
        </>
      )}
      {movers.error ? <Failure error={movers.error} /> : movers.data && (
        <div className="three-up">
          <Section title="Top gainers"><QuoteList rows={movers.data.gainers} /></Section>
          <Section title="Top losers"><QuoteList rows={movers.data.losers} /></Section>
          <Section title="Most active"><QuoteList rows={movers.data.active} /></Section>
        </div>
      )}
    </>
  );
}
