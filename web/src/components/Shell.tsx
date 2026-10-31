import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { get, type Status } from "../api";

type Match = { symbol: string; name: string; exchange: string };

function SymbolSearch() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data } = useQuery({
    queryKey: ["symbols", query], enabled: query.length > 0,
    queryFn: () => get<Match[]>(`/api/symbols?q=${encodeURIComponent(query)}`),
  });
  const go = (symbol: string) => {
    setText("");
    setOpen(false);
    navigate(`/stock/${encodeURIComponent(symbol)}`);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const first = data?.[0]?.symbol ?? text.trim().toUpperCase();
    if (first) go(first);
  };
  return (
    <form className="search" role="search" onSubmit={submit}>
      <input
        aria-label="Look up a stock" placeholder="Look up a stock" value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && text && !!data?.length && (
        <ul className="search-results">
          {data.map((m) => (
            <li key={m.symbol}>
              <button type="button" onClick={() => go(m.symbol)}>
                <b>{m.symbol}</b> <span>{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

export function Shell() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const { data: status } = useQuery({ queryKey: ["status"], queryFn: () => get<Status>("/api/status"), staleTime: 60_000 });
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">IBKR Desk</Link>
        <nav aria-label="Main">
          <NavLink to="/" end>Portfolio</NavLink>
          <NavLink to="/market">Market</NavLink>
          <NavLink to="/advisor">Advisor</NavLink>
        </nav>
        <SymbolSearch />
      </header>
      {status?.source === "sample" && (
        <p className="sample-banner">You're viewing made-up sample holdings, not your account.</p>
      )}
      <main ref={main}><Outlet /></main>
      <footer>Read-only: this app can't place orders. Prices from Yahoo Finance may be delayed about 15 minutes. AI output can be wrong and isn't financial advice.</footer>
    </>
  );
}
