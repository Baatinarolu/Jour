# SANTANDC — trade journal

SANTANDC is a private journal for **closed trades**. It is built for the review loop: write the playbook, log the execution and the context around it, put the trade next to a TradingView chart, then find the few repeatable conditions and leaks that actually explain the curve.

Out of the box it is local-only (no account, no cloud). When you need multi-device access, enable **Cloud sync** in Settings — your journal is then backed up per-account to your own Vercel deployment and merges offline edits when you reconnect. There is still no broker connection, order routing, live position manager, news desk, or generic AI chat.

## What's here

### Journal entries

- Stocks, options, futures, forex, crypto, indices/commodities, metals, and other markets.
- Entry, exit, stop, target, quantity, fees, contract multiplier, account label, timeframe, and exact TradingView symbol.
- Multiplier-aware P&L, planned risk, R multiple, realized reward:risk, excursion R from optional MAE/MFE prices, and holding time.
- A stop-aware position-size helper that works from account balance and intended risk percentage.
- Playbook/setup, checked entry criteria, followed-plan flag, and A+ through F execution grade. Criteria completion can set the followed-plan state for you.
- Entry and exit emotions, confidence, entry/exit reasons, mistake, lesson, notes, tags, and reflection helpers.
- Optional browser dictation for a voice-note transcript. Browser dictation may use the browser vendor's speech service; the saved transcript stays in the local journal.
- Up to three chart screenshots per trade. Paste or upload them; images are resized/compressed in the browser before local storage.
- Duplicate-an-entry, rich search, account/playbook/emotion filters, result filters including **Flat** and **Needs review**, and sorting by date, P&L, R, or holding time.

### Daily journal and weekly review

- A dedicated **Daily** workspace for each local calendar day: date navigation, the day’s closed trades, net P&L/R, win rate, and one-click access to edit a trade.
- Before the session, record one focus, bias/conditions, levels/events/invalidation, allowed playbooks, a maximum planned loss in R, and a 1–5 readiness rating. The saved max-loss budget is shown against the day’s realized R.
- After the session, record what went well, repeated mistakes, one lesson, extra notes, whether you followed the plan, and an execution grade.
- Browse the last 14 traded or journaled days with result, grade, focus, and lesson context.
- Guided Monday–Sunday weekly reviews capture what to keep/stop doing, best and worst trades, the biggest lesson, and one next focus. Saving stores a statistics snapshot, can prefill best/worst trades by P&L, and surfaces that week’s daily focuses and lessons.

### Playbooks and daily rules

- Document each setup with its idea, markets, sessions, timeframes, entry criteria, invalidation, management rules, notes/common mistakes, and one example chart.
- Three editable starting playbooks are included: Trend Pullback, Opening Range Breakout, and Liquidity Sweep Reversal.
- A playbook's criteria become the checklist inside the trade form.
- Each playbook shows trades, net P&L, win rate, average R, and plan compliance.
- Keep the original short rules list beside it, with today's checks and a rolling 14-day history.

### Review and analytics

- Switch the whole analytics surface between money, cumulative R, and return on starting balance.
- Filter by today, this week, 14/30/90 days, or all time.
- SANTANDC Score: a transparent 0–100 composite that explains its expectancy, profit-factor, discipline, drawdown, plan-adherence, and journaling components.
- Journal completeness for stops, lessons, emotions, and screenshots.
- Local smart review: biggest repeated leaks, best conditions, plan cost, reflection prompt, rolling latest-20 versus prior-20 comparison, and one next focus. This is deterministic analysis of your own entries—not a cloud AI coach.
- Download a weekly/30-day review as Markdown.
- Breakdowns by playbook/setup, symbol, account, market, session, side, grade, timeframe, entry/exit emotion, mistake, confidence, opening hour, holding-time bucket, weekday/month, and tags.
- On-plan versus off-plan comparison, monthly P&L calendar, 12-week heatmap, drawdown, streaks, win rate, profit factor, expectancy, average win/loss, and payoff ratio.

### TradingView integration

- The **Chart** view is a full-viewport live workspace using TradingView's official Advanced Chart widget. It fills the app window by default, has quick timeframe controls (5m by default), and offers a true browser **Full screen** mode with an in-app expanded fallback when a browser or preview blocks the Fullscreen API.
- On mobile and in full-screen mode the SANTANDC controls collapse to a slim chart bar, so almost the entire screen belongs to TradingView. Hide the journal side panel for a chart-only workspace, or show it when you want the selected entry beside the live chart. The TradingView watchlist generated from journal symbols is optional and off by default so it does not shrink the candles.
- SANTANDC forces the widget to start on the journal's requested symbol, preventing a previous/default symbol such as AAPL from silently replacing an ES or forex entry.
- Drawings (trendlines, boxes, text), indicators, chart settings, and favorite drawing tools persist in this browser through TradingView's own local storage, and the chart workspace stays mounted when you switch menus—so leaving for Trades and coming back does not wipe your markup. Drawings are kept per symbol by TradingView; clearing site data removes them, so snapshot important levels into the journal entry as the durable record.
- Each trade can carry an exact exchange-qualified TradingView symbol such as `NASDAQ:NVDA`, `CME_MINI:ES1!`, `FX:EURUSD`, or `BINANCE:BTCUSDT`.
- Common journal shorthand is mapped for futures, forex, crypto majors, common indices, gold, silver, and oil. If the mapping is wrong for your broker/feed, edit `tvSymbol` on the trade.
- Selecting a journal entry loads its symbol while preserving the live timeframe you are using; the panel can switch back to the entry's recorded timeframe when needed.
- **TradingView app** creates a full chart link with the selected symbol and interval.
- Embedded-widget data can be delayed for some exchanges. That is a TradingView widget/feed limitation, not a static screenshot: forex and crypto are commonly real-time, while many stock/futures feeds are delayed unless opened in TradingView with the required data permissions.
- Privacy boundary: TradingView receives only the chart symbol/interval/watchlist needed to render its widget. Your notes, screenshots, size, account label, and P&L are not sent by SANTANDC.

### Cloud sync (optional)

- Local-only by default. Open **Settings → Cloud sync** to create an account (email + password) and sync.
- **Sign in on phone + desktop with the same email** to share the same journal. Offline edits are queued; on reconnect the two copies merge by `updatedAt` per trade/playbook/day so you don't lose a phone edit when the desktop pushes.
- After sign-in, SANTANDC pulls on open, on tab focus, and every ~30s, and pushes 2s after you stop typing. Use **Sync now** for an immediate push/pull.
- Cloud payload is the same v4 backup (trades, rules/checks, playbooks, daily entries, weekly reviews, screenshots, balance). Max backup ~10 MB; screenshots are data URLs and count toward it.
- Auth is email + password hashed with bcrypt, JWT (30-day expiry, Bearer token in `localStorage`). Transport is HTTPS on Vercel. No email verification — keep the password safe.
- Storage model: the API (`/api/auth/*`, `/api/sync`, `/api/health`) runs on your own deployment, in this order:
  1. **Postgres (Neon recommended)** — `DATABASE_URL` (or `POSTGRES_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING`). Vercel's Neon integration injects `DATABASE_URL` automatically; Neon hosts are detected and queried through the `@neondatabase/serverless` HTTP driver (no connection pool to exhaust, pooled or direct endpoint both fine). Any other Postgres (Supabase — including its PgBouncer pooler on port 6543 — self-hosted, local) works through `pg`. If several variables are set, a Neon URL wins, so migrating providers is just "attach Neon, redeploy". Tables `santandc_users` and `santandc_journals` are created on first request.
  2. **Redis** — Vercel KV or Upstash (`KV_REST_API_*` / `UPSTASH_REDIS_REST_*`). Journals are chunked so screenshot-heavy backups stay under request limits.
  3. **Files** — `server/.data` locally, `/tmp/santandc` on Vercel. `/tmp` is wiped on redeploy and cold start, so accounts created there disappear. This is the fallback only.
  - Open `/api/health` on any deployment to see exactly which driver is active. The Cloud sync panel shows the same status, with a warning when storage is ephemeral.
  - Set `AUTH_SECRET` (long random, e.g. `openssl rand -hex 32`) so JWTs stay valid across redeploys. See `.env.example`.
- Deletions sync: erasing/clearing locally propagates to the cloud (the push carries `lastSyncedAt`, and entities that existed at the last sync but are now missing are treated as deleted). A brand-new device with an empty journal does *not* wipe the cloud. **Clear cloud (force push local)** in Settings replaces the cloud copy with this device's journal.
- You can stay local forever or toggle cloud per device: local data is preserved on log out; signing in again merges.

### Import, export, and backup

- CSV export includes execution, risk, playbook, account, TradingView, emotion/confidence, mistake/lesson, reasons, criteria, MAE/MFE, and source fields.
- CSV import accepts common broker/export header aliases and SANTANDC's own export. Invalid rows are reported without discarding valid rows, negative commissions are normalized, and exact duplicate trades are skipped automatically on re-import.
- Put `multiplier` in a broker CSV when the export uses contracts/lots rather than raw units—for example, options normally use `100`; ES futures normally use `50`; a standard forex lot normally needs `100000` if quantity is lots.
- JSON backups are version 4 and include trades, rules/checks, playbooks, active playbook, daily entries, weekly reviews, screenshots, and starting balance. Version 1, 2, and 3 Folio/SANTANDC backups still import and are normalized safely.
- Screenshots are included in cloud sync when you use it; otherwise they are browser-local, so export a JSON backup regularly. Browser storage is finite; clearing site data removes an unbacked journal. Cloud users should still download periodic JSON backups.

## A good weekly workflow

1. Write or tighten one playbook before the week starts.
2. Before each session, open **Daily** and write the day’s focus, allowed playbooks, levels/invalidation, readiness, and maximum planned loss.
3. After each close, log prices first, then emotions, mistake, and one honest lesson while the memory is fresh.
4. Open **Chart**, load the journal symbol in TradingView, and save/paste the annotated chart image into the entry if it adds evidence.
5. At the end of the day, complete the daily review and grade execution before judging P&L.
6. At the end of the week, use **Review** for measured leaks, then save the guided weekly review in **Daily** with one focus for next week.
7. Download the Markdown review and a JSON backup.

## Scope limits

- Closed trades only. There is no live execution, broker sync, open-position tracker, alert engine, or risk lockout.
- Demo, prop, and live accounts can be separated with account labels and filters, but SANTANDC does not try to reconcile broker balances.
- TradingView is a chart/review integration, not an order-routing or webhook integration.
- Cloud sync is a journal backup/sync layer (your trades and notes), not a trading infrastructure. A webhook cannot reliably write into browser-local storage; use the sync API with auth if you build automations.
- The smart review is local and formula-based. It never invents trades and it needs real journal context to become useful.

## Run locally

Requires Node 22.x (Vercel is pinned to `nodejs22.x` through `engines.node`).

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Verify

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Deploy on Vercel

`vercel.json` pins the framework as `tanstack-start`; the repo otherwise uses the framework preset with no custom output directory or build overrides.

1. Push this branch to GitHub.
2. In Vercel, import `Baatinarolu/Jour` and deploy. For local-only use, no env vars are required.
3. Cloud sync in production needs durable storage — do this once, it takes a couple of minutes:
   1. Vercel dashboard → your project → **Storage** → **Create Database** → **Neon**, and connect it to the project (any Postgres or Upstash Redis also works). Vercel injects `DATABASE_URL` (Neon) or `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Redis) automatically.
   2. Add `AUTH_SECRET` — a long random string (`openssl rand -hex 32`). Sign-in refuses to work without it (the API returns an explanatory 503, and the Cloud sync panel warns you).
   3. Redeploy. Visit `/api/health`; it should report `"driver": "neon-postgres"` and `"persistent": true` with `"probe": { "ok": true }`, plus `"authSecretSet": true`.
   - Already have a Neon project? Copy its connection string (Neon console → Connect; pooled endpoint is fine) into `DATABASE_URL`. Using Supabase instead? Its pooled string in `POSTGRES_URL` (port `6543`, `sslmode=require`) works unchanged through `pg`. Switching providers later: just attach the new database and redeploy — account records don't move, but journals are local-first, so signing up again with the same email re-uploads and merges each device's journal.
   - Without a Redis store, the app still runs and cloud sync still works **within** a deployment, but Vercel's `/tmp` is wiped on redeploy/cold start, so accounts vanish. The Settings panel warns about this and the health endpoint explains it.
   - Copy `.env.example` for local dev. Local testing without a real store: `node scripts/mock-redis.mjs 8090`, then build with `KV_REST_API_URL=http://127.0.0.1:8090 KV_REST_API_TOKEN=local`.

Or from a checkout: `npx vercel` for preview, `npx vercel --prod` for production.

## Storage and browser data

- Key: `santandc-journal-v1`, in `localStorage` (local baseline, survives offline).
- Cloud key: `santandc-sync-v1` + `santandc-auth-token` + `santandc-last-sync` for the JWT and last sync time when cloud is on.
- On first run, a legacy `folio-journal-v1` journal is migrated by copy; the old key is left untouched.
- Server storage, in priority order: Postgres (`santandc_users`, `santandc_journals`, one JSONB row per user) → Redis (`santandc:user:*`, `santandc:journal:*`) → files under `SANTANDC_DATA_DIR` (default `server/.data` locally, `/tmp/santandc` on Vercel, ephemeral). `/api/health` always reports the live driver and probes it.
- If the database is unreachable the app says so instead of silently falling back, so data can never be split across two stores.
- SANTANDC is installable as a PWA. Without cloud, journal data is per browser/device; with cloud, signing in on another device pulls the merged journal.

## Stack

TanStack Start · React 19 · Vite · Tailwind CSS 4 · Zustand · Recharts for the equity/performance curve · TradingView Advanced Chart embed · Nitro (Vercel preset).

See [`JOURNAL_FEATURES.md`](./JOURNAL_FEATURES.md) for the focused journal feature map and [`ANALYSIS.md`](./ANALYSIS.md) for the original archive audit.
