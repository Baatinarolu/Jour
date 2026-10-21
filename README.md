# SANTANDC

SANTANDC is a private trading journal for **closed trades**. It records what happened, what it cost or made, and whether the plan was followed — then turns that history into an equity curve, R statistics, drawdown, rule adherence, and review breakdowns.

There are no accounts and no cloud sync. Journal data is stored only in the browser's `localStorage` under the key `santandc-journal-v1` (journals saved under the former `folio-journal-v1` key are migrated automatically).

## Features

- Log, edit, and delete closed trades across stocks, options, futures, forex, and crypto.
- Live P&L and R preview while entering a trade.
- Contract-aware P&L through a per-trade **multiplier** (dollars per point, per unit).
- Stop-direction validation: a long stop must be below entry and a short stop above entry.
- Overview statistics: net P&L, win rate, profit factor, expectancy, average R, average win/loss, gross profit/loss, drawdown, streaks, and an equity curve.
- Trade search and filters by result, plan adherence, and day.
- Review breakdowns by setup, symbol, weekday, session, side, grade, plan adherence, and tags. A trade counts under every tag it carries.
- Daily rules checklist with a trailing 14-day adherence history.
- JSON backup/restore and CSV export/import.
- Sample book for exploring the interface without entering real trades first.

## Quick start

```bash
npm install
npm run dev
```

The dev server listens on `http://localhost:8080`.

## Commands

```bash
npm run dev        # Start the development server
npm run build      # Build the production app (TanStack Start + Nitro/Vercel preset)
npm run preview    # Preview the built output
npm run typecheck  # TypeScript check
npm test           # PWA/preview tests + journal domain tests
npm run lint       # ESLint
npm run format     # Prettier
```

## Data, backups, and CSV

Because data never leaves the browser, use **Settings → Download backup** for a portable copy.

- New backups use JSON **version 2**, which includes each trade's multiplier.
- Version 1 backups can still be restored; missing multipliers are treated as `1`, symbols/tags are normalized, duplicate IDs are dropped, and checks for deleted rules are removed.
- Restoring a JSON backup replaces the current journal after confirmation.
- **Download CSV** exports one row per trade, including computed `pnl` and `r` columns.
- **Import CSV** adds trades without replacing the journal. Required columns are `symbol`, `entry`, `exit`, and `quantity`; common aliases such as `ticker`, `entryPrice`, `contracts`, `pointValue`, `commission`, and `labels` are accepted. Invalid rows are reported and skipped, and duplicate incoming IDs are regenerated.

### Multipliers

`quantity` is shares, units, or contracts. `multiplier` is the dollars gained or lost for a 1.00 price move per unit:

- Stocks, forex units, and crypto units: usually `1`
- Options: `100` per contract
- Common futures are prefilled for known symbols — for example ES `50`, NQ `20`, CL `1000`, GC `100`

The calculated result is:

```text
P&L = price difference × quantity × multiplier − fees
R   = P&L ÷ planned risk from the stop
```

Legacy futures sample trades were converted from “dollars per point in the size field” to `quantity: 1` with the point value stored as the multiplier, preserving their historical P&L.

## Deploying to Vercel

SANTANDC uses TanStack Start with the Nitro Vercel preset, and `vercel.json` pins Vercel's **TanStack Start** framework preset.

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Keep the root directory as the repository root and confirm the framework preset is **TanStack Start**.
4. Deploy. No environment variables are required.

`npm run build` generates Vercel Build Output API artifacts under `.vercel/output/` (static assets plus the server function). The Node.js runtime is pinned through `engines.node` in `package.json`.

## Project structure

```text
src/
  components/journal/  Journal UI: overview, trades, review, rules, dialogs, chart
  components/ui/       Small shared UI primitives
  lib/journal/         Domain model, calculations, store, backup, CSV, sample data
  lib/og/site.json     Share-card identity consumed by the PWA/OG middleware
  routes/              TanStack routes (the journal is the index route)
server/
  middleware/          Production PWA/OG head and install-page middleware
scripts/
  grok-pwa-*.mjs       PWA manifest/head injection and OG identity baking
  preview.mjs          Helper to stop/restart the local production preview on :8081
public/
  og.jpg               1200×630 social share card
  favicon.svg          SANTANDC mark
```

## Scope and limitations

SANTANDC intentionally focuses on a private, local-only, closed-trades journal:

- No sign-in, database, sync, broker connection, or open-position tracking.
- Views are in-app sections rather than separate URLs.
- Money formatting is USD (`en-US`).
- Clearing browser storage removes the journal unless a JSON backup has been downloaded.

## Verification

The completion audit and reproduction notes from the original workspace restore are preserved in [`ANALYSIS.md`](./ANALYSIS.md). Before publishing changes, run:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```
