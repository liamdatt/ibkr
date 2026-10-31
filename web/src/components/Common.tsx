import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { News, Row } from "../api";
import { ago, direction, percent, price } from "../format";

export const Change = ({ value }: { value: number | null | undefined }) => (
  <span className={direction(value)}>{percent(value)}</span>
);

export const Loading = ({ what }: { what: string }) => <p className="quiet" role="status">Loading {what}</p>;

export const Failure = ({ error }: { error: unknown }) => (
  <p className="failure" role="alert">{(error as Error).message}</p>
);

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head"><h2>{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

export function NewsList({ items }: { items: News[] }) {
  if (items.length === 0) return <p className="quiet">No recent headlines.</p>;
  return (
    <ul className="news">
      {items.map((n) => (
        <li key={n.link}>
          <a href={n.link} target="_blank" rel="noreferrer noopener">{n.title}</a>
          <small>{n.publisher}, {ago(n.publishedAt)}</small>
        </li>
      ))}
    </ul>
  );
}

export function QuoteList({ rows }: { rows: Row[] }) {
  return (
    <ul className="quotes">
      {rows.map((r) => (
        <li key={r.symbol}>
          <Link to={`/stock/${encodeURIComponent(r.symbol)}`}><b>{r.symbol}</b><span>{r.name}</span></Link>
          <span className="num">{price(r.price)}</span>
          <span className="num"><Change value={r.changePercent} /></span>
        </li>
      ))}
    </ul>
  );
}
