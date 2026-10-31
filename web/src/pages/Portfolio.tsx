import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { get, type Portfolio, type Status } from "../api";
import { Change, Failure, Loading } from "../components/Common";
import { Treemap } from "../components/Treemap";
import { direction, money, price } from "../format";

function ConnectSteps({ portfolio, gatewayUrl }: { portfolio: Portfolio; gatewayUrl: string }) {
  const loggedOut = portfolio.status.state === "login_required";
  return (
    <section className="connect">
      <h1>{loggedOut ? "Log in to see your portfolio" : "Start the IBKR gateway to see your portfolio"}</h1>
      <p>{portfolio.status.detail}</p>
      <ol>
        {!loggedOut && <li>Run the Client Portal Gateway: <code>bin/run.sh root/conf.yaml</code></li>}
        <li>Open <a href={gatewayUrl} target="_blank" rel="noreferrer">{gatewayUrl}</a> in a browser on this machine and log in.</li>
        <li>This page connects by itself within a few seconds.</li>
      </ol>
      <p className="quiet">To try the app first, set <code>PORTFOLIO_SOURCE=sample</code> in <code>.env</code> and restart.</p>
    </section>
  );
}

export function PortfolioPage() {
  const status = useQuery({ queryKey: ["status"], queryFn: () => get<Status>("/api/status"), staleTime: 60_000 });
  const { data, error, isPending } = useQuery({
    queryKey: ["portfolio"], queryFn: () => get<Portfolio>("/api/portfolio"), refetchInterval: 5_000,
  });
  if (isPending) return <Loading what="your portfolio" />;
  if (error) return <Failure error={error} />;
  if (data.status.state === "gateway_down" || data.status.state === "login_required") {
    return <ConnectSteps portfolio={data} gatewayUrl={status.data?.gatewayUrl ?? "https://localhost:5000"} />;
  }
  const currency = data.baseCurrency;
  const total = data.netLiquidation;
  const dayPnl = data.positions.reduce((sum, p) => {
    const change = p.symbol ? data.dayChange[p.symbol] : null;
    return change == null ? sum : sum + p.marketValueBase - p.marketValueBase / (1 + change / 100);
  }, 0);

  return (
    <>
      {data.status.state === "stale" && (
        <p className="failure" role="alert">
          Connection lost. These figures are from {new Date(data.updatedAt!).toLocaleTimeString()}. {data.status.detail}
        </p>
      )}
      <div className="account">
        <div>
          <h1>{money(total, currency)}</h1>
          <p>Net liquidation value, account {data.accountId}</p>
        </div>
        <dl>
          <div><dt>Today, estimated</dt><dd className={direction(dayPnl)}>{money(dayPnl, currency)}</dd></div>
          <div><dt>Unrealized P&amp;L</dt><dd className={direction(data.unrealizedPnl)}>{money(data.unrealizedPnl, currency)}</dd></div>
          <div><dt>Cash</dt><dd>{money(data.cash, currency)}</dd></div>
        </dl>
      </div>
      {data.positions.length === 0
        ? <p className="quiet">This account has no open positions.</p>
        : <Treemap portfolio={data} />}
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">Holdings</caption>
          <thead>
            <tr>
              <th>Holding</th><th className="num">Quantity</th><th className="num">Price</th><th className="num">Avg cost</th>
              <th className="num">Value ({currency})</th><th className="num">Weight</th><th className="num">Today</th>
              <th className="num">Unrealized P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((p) => (
              <tr key={p.conid}>
                <th scope="row">
                  {p.symbol ? <Link to={`/stock/${encodeURIComponent(p.symbol)}`}>{p.symbol}</Link> : p.description}
                  {p.sector && <small>{p.sector}</small>}
                </th>
                <td className="num">{p.quantity.toLocaleString("en-US")}</td>
                <td className="num">{price(p.price)}{p.currency !== currency && <small>{p.currency}</small>}</td>
                <td className="num">{price(p.avgPrice)}</td>
                <td className="num">{money(p.marketValueBase, currency)}</td>
                <td className="num">{total ? `${((p.marketValueBase / total) * 100).toFixed(1)}%` : "–"}</td>
                <td className="num"><Change value={p.symbol ? data.dayChange[p.symbol] : null} /></td>
                <td className={`num ${direction(p.unrealizedPnl)}`}>{money(p.unrealizedPnl, p.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
