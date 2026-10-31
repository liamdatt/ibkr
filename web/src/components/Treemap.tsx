import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Portfolio } from "../api";
import { money, percent } from "../format";

type Cell = { key: string; label: string; symbol: string | null; value: number; change: number | null; cash?: boolean };

// Colour saturates at a 4% daily move; the signed figure in each cell carries the exact value.
function shade(change: number | null) {
  if (change == null) return { background: "var(--diverge-mid)", color: "var(--ink)" };
  const strength = Math.min(Math.abs(change) / 4, 1);
  const pole = change >= 0 ? "var(--up)" : "var(--down)";
  return {
    background: `color-mix(in oklab, ${pole} ${Math.round(12 + strength * 88)}%, var(--diverge-mid))`,
    color: strength > 0.55 ? "#fff" : "var(--ink)",
  };
}

export function Treemap({ portfolio }: { portfolio: Portfolio }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height });
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const cells: Cell[] = portfolio.positions.map((p) => ({
    key: p.conid, label: p.symbol ?? p.description, symbol: p.symbol, value: Math.abs(p.marketValueBase),
    change: p.symbol ? (portfolio.dayChange[p.symbol] ?? null) : null,
  }));
  if (portfolio.cash && portfolio.cash > 0) {
    cells.push({ key: "cash", label: "Cash", symbol: null, value: portfolio.cash, change: null, cash: true });
  }
  const total = cells.reduce((sum, c) => sum + c.value, 0);
  const root = treemap<{ children: Cell[] } | Cell>()
    .size([size.width, size.height]).paddingInner(2).tile(treemapSquarify)(
      hierarchy<{ children: Cell[] } | Cell>({ children: cells }, (d) => ("children" in d ? d.children : undefined))
        .sum((d) => ("value" in d ? d.value : 0))
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    );

  return (
    <figure className="treemap-figure">
      <div className="treemap" ref={box}>
        {size.width > 0 && root.leaves().map((leaf) => {
          const c = leaf.data as Cell;
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          const weight = (c.value / total) * 100;
          const style = { left: leaf.x0, top: leaf.y0, width: w, height: h, ...shade(c.change) };
          const title = `${c.label}: ${money(c.value, portfolio.baseCurrency)}, ${weight.toFixed(1)}% of holdings, ${c.cash ? "cash" : `${percent(c.change)} today`}`;
          const body = w > 58 && h > 42 && (
            <>
              <b style={{ fontSize: Math.max(14, Math.min(34, Math.sqrt(w * h) / 8)) }}>{c.label}</b>
              {h > 62 && <span>{c.cash ? `${weight.toFixed(1)}%` : percent(c.change)}</span>}
            </>
          );
          return c.symbol
            ? <Link key={c.key} to={`/stock/${encodeURIComponent(c.symbol)}`} className="cell" style={style} title={title} aria-label={title}>{body}</Link>
            : <div key={c.key} className={c.cash ? "cell cash" : "cell"} style={style} title={title}>{body}</div>;
        })}
      </div>
      <figcaption>
        <span>Box size shows position value. Colour shows today's move.</span>
        <span className="scale" aria-hidden="true"><i>−4%</i><u /><i>+4%</i></span>
      </figcaption>
    </figure>
  );
}
