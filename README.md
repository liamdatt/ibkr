# IBKR Desk

A personal dashboard for your Interactive Brokers account: live portfolio, market overview, technical and fundamental research, news, and an AI advisor that explains its reasoning.

It is read-only. The app can't place, change or cancel orders.

## Run it

Needs Node 22 or later. The gateway also needs Java.

```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY for the advisor
npm run build
npm start                # http://127.0.0.1:8787
```

To try it without an account, set `PORTFOLIO_SOURCE=sample` in `.env`. Sample holdings are made up and labelled on every page.

For development, `npm run dev` serves the interface on http://127.0.0.1:5173. `npm test` and `npm run typecheck` run the checks.

## Connect your account

The app reads your account through IBKR's Client Portal Gateway. Your account must be a funded IBKR Pro account.

1. Download the [Client Portal Gateway](https://www.interactivebrokers.com/docs/web-api/authentication/cpgw/installation-authentication) and unzip it.
2. Start it from its folder: `bin/run.sh root/conf.yaml`
3. Open https://localhost:5000 in a browser and log in. Your browser will warn about the gateway's self-signed certificate.
4. Open the app. It connects within a few seconds.

IBKR requires the browser login and the API calls to come from the same machine as the gateway. On a remote server, forward the port with `ssh -L 5000:localhost:5000 you@server` and log in from your own browser. The gateway may reject that address until you add it under `ips.allow` in `root/conf.yaml`.

The app keeps the session alive while it runs. IBKR still ends sessions periodically, and the Portfolio page then asks you to log in again.

## Where the data comes from

| Data | Source |
| --- | --- |
| Holdings, cost basis, P&L, cash | IBKR Web API, about every 5 seconds |
| Prices for research, market overview, today's change | Yahoo Finance, often delayed 15 minutes |
| Fundamentals, analyst targets, news | Yahoo Finance, an unofficial feed that can change or fail |

"Today, estimated" is worked out from Yahoo's daily change, not reported by IBKR.

## Design notes

- **Only the read-only side of the Web API is used.** The app never calls `/iserver`, so it needs no brokerage session and won't log you out of TWS or the mobile app. An allowlist in `server/sources/ibkr.ts` blocks every other route.
- **The advisor is a [Pi](https://github.com/earendil-works/pi) agent using Claude.** Its tools only read data. Reviews run when you ask, cost Anthropic credit, and are saved in `data/reviews`. Your holdings and goals are sent to Anthropic, but your account number isn't.
- **The server listens on 127.0.0.1 by default and refuses requests from other sites.** To host it, set `HOST`, `PUBLIC_HOST` and `APP_PASSWORD`; the app won't start on a public address without a password. Sign in as `desk`.

AI recommendations can be wrong and aren't financial advice.
