# Folio — analysis of `grok-workspace.zip`

_Date: 2026-10-21 · Source: `grok-workspace.zip` (2.9 MB, 404 files) restored into this repo · Auditor ran every gate locally (Node 22) — results below are reproduced, not copied from the zip's own logs._

## TL;DR

The previous AI (Grok App Builder) built a **real, mostly-working app — "Folio", a private trading journal** — and got it roughly **80% done**. All four screens work and the math core is sound for stocks/forex/crypto. What it did **not** finish:

1. **Production verification never passed.** Its own final smoke test says the built app diverges from dev and sits on *"Opening your journal…"* — it restarted the preview 3× and stopped without resolving it.
2. **The equity chart was never verified** — blank in one screenshot, half-drawn in another.
3. **Tests/lint are red and the journal logic has zero tests** (191/197 template tests pass, 6 fail; 1 lint error; 0 tests for `calc`/`backup`/`store`).
4. **Brand/OG pass skipped** — no share card (`public/og.jpg`), `site.json` left minimal.
5. **Real logic bugs**: options P&L has no ×100 multiplier, "Tagged leaks" only counts each trade's *first* tag, stop direction is never validated.
6. Several computed/collected things are **never surfaced in the UI** (avg R, avg win/loss, rule-check history).

There is **no spec/PRD/original prompt in the zip** (`AGENTS.md` is Grok's platform contract, saved at `docs/grok-AGENTS.md`). So "completeness" below is judged against (a) that contract's quality bar and (b) the app's own data model/copy — not against whatever was originally asked. If accounts/sync/CSV import were in the original ask, they're missing entirely (see §5).

---

## 1. What's in the zip

| Bucket | Files | Notes |
|---|---|---|
| `.vercel/output` | 126 | Leftover production build — should never be committed |
| `.grok/` (skills + refs) | 125 | Grok platform tooling, not app code |
| **`src/`** | **75** | **The actual app** (~2,741 LOC of journal code) |
| `scripts/` | 27 | Platform scripts (smoke test, PWA/OG plugins, migrations) — required by `vite.config.ts`/`package.json` |
| `screenshots/` | 15 | Grok's QA evidence (kept in repo) |
| `public/`, `server/`, `migrations/` | 21 | Favicon/PWA assets, Nitro middleware, Better-Auth schema (unused) |

No `.git`, no README, no secrets found (`.grok/app-env.json` only says `VITE_AUTH_ENABLED=false`, `database:false`).

**The app:** Folio — log *closed* trades (stocks/options/futures/forex/crypto), see equity curve + stats (win rate, profit factor, expectancy, max drawdown, streak, on/off-plan split), review breakdowns (daily heatmap, setup/symbol/weekday/session/side/grade/tags), daily rules checklist, JSON backup/restore. Dark UI, IBM Plex, sample book of 19 trades on first run. Data = **localStorage only** (`folio-journal-v1`), no backend/auth/db — a deliberate Grok-triage decision ("On this device").

## 2. Gates — reproduced 2026-10-21

| Gate | Result |
|---|---|
| `npm ci` | ✅ 430 pkgs |
| `npm run typecheck` | ✅ clean |
| `npm run build` | ✅ passes; output hashes (`index-BmaTfA9z.js`) byte-identical to zip's `.vercel` — source and shipped build match |
| `npm run lint` | ❌ **1 error** — `src/lib/app-data/client.server.ts:281` empty block (template file, but the gate is red) |
| `npm test` | ❌ **191/197 pass, 6 fail** — all 6 in `scripts/grok-pwa-plugin.test.mjs`: they expect og:title fallbacks, but the workspace now has `site.json` title `"Folio"`, which legitimately wins. The template tests leak the real `site.json`. Either way: red as shipped, apparently never run/noticed |
| Journal-logic tests | ❌ **None exist.** All tests are Grok-template tests; `calc.ts`, `backup.ts`, `store.ts` have 0 coverage |
| Dev smoke (theirs) | ✅ 200, no console errors, 893 chars desktop / 792 mobile (`screenshots/app-builder-preview.json`) |
| **Built smoke (theirs)** | ❌ **`divergesFromBaseline: true`** — body text collapsed 893→117 (desktop), 792→56 (mobile); screenshots show only the shell + *"Opening your journal…"* with buttons disabled |
| Brand check (theirs) | ⚠️ `BRAND NOTE: no custom public/og.jpg` in **both** verdicts, left unresolved |

My HTTP-level check of the fresh build: SSR shell correct, JS/CSS/manifest all `200` with correct MIME (no `text/html` module failure), JS assets ~276 KB gzip in 2 chunks and **took 0.7–1.0 s each** from the Nitro preview. The smoke script only waits **1 s** after `domcontentloaded` (`scripts/browser-smoke.mjs:111`), so the divergence is *probably* "hydration + zustand rehydrate didn't finish in 1 s" rather than a hard hang — but "probably" is exactly what the old AI left behind: its own contract (AGENTS §8) requires a clean, non-diverging built verdict, and there isn't one. No browser is installable in this sandbox (Playwright CDN blocked), so I could not produce the missing browser verdict here either — the live preview is up for a visual check.

Related: the equity chart is **empty** in `app-builder-preview.png` and **~15% drawn** in `overview-desktop.png` — Recharts' default 1500 ms area animation vs. a 1 s screenshot. Nobody ever screenshotted the finished chart. The QA screenshots also show inconsistent state (19 trades/+$628 in one, 21 trades/+$828 later) — manual QA polluted its own localStorage, so the numbers aren't comparable across shots.

## 3. What IS complete

- **Trade CRUD** — add/edit/delete via `trade-dialog.tsx` with live P&L/R preview, validation for required fields, negative fees, close-before-open; delete is confirm-then-erase (`src/components/journal/trade-dialog.tsx`, `store.ts`).
- **Stats core** — `calc.ts`: P&L, R, equity by day, win rate, profit factor, expectancy, payoff, max drawdown ($ and %), streaks, groupings, plan split, search matching. Clean, well-typed, money-rounded.
- **Overview / Trades / Review / Rules** — all four views fully rendered incl. empty states, responsive (sidebar ↔ top bar), no horizontal overflow in QA, ≥44 px targets, reduced-motion handling, focus-visible styles.
- **Rules** — add/edit-inline/delete (max 12), today checklist persisted per-date.
- **Settings** — starting balance, **JSON backup download + validated restore** (Zod schema, confirm-before-replace), load sample, erase trades — all with confirm steps.
- **Sample book** — 19 trades/5 rules generated relative to "today" so the review always has recent data; banner offers "Start fresh".
- **Shell polish** — custom favicon + in-app mark, `theme-color`, description meta, error component, SSR shell.

## 4. Bugs & correctness gaps

1. **Options P&L is wrong by default.** `tradePnl = (exit−entry) × quantity − fees` for every market (`calc.ts`). An option contract is ×100, ES ×$50/pt, CL ×1000 — the dialog's workaround is one line of copy (*"Size is shares, units, or dollars per point — one ES contract is 50"*) and the sample hard-codes `quantity: 50` for ES, `1000` for CL… and **contains zero options trades**, despite options being a listed market. A user entering "2 contracts" gets P&L off by 50×. Needs a per-market **multiplier/point-value** field (defaulted, editable).
2. **"Tagged leaks" only counts the first tag** — `groupTrades(trades, t => t.tags[0])` (`review-view.tsx`). A trade tagged `oversize, late entry` is invisible under `late entry`; totals don't reconcile.
3. **Stop direction never validated; R uses `Math.abs(entry−stop)`** (`calc.ts`, `trade-dialog.tsx`). A stop on the profit side silently yields a plausible R. Long stops should be `< entry`, short stops `> entry` (or at least warn).
4. **Backup restore trusts too much** (`backup.ts`): dates are only `z.string().min(1)` (an invalid date string renders as Invalid Date downstream), duplicate trade/rule IDs aren't rejected/deduped, and `checks` can reference rule IDs that don't exist. Restore also discards nothing about `sampleBanner` (forced `false`, fine) but keeps unknown future fields silently (Zod strips — a v2 backup would "succeed" lossily once versioning matters; `version: z.literal(1)` at least blocks that for now).
5. **Drawdown % edge**: with starting balance 0, `maxDrawdownPct` stays 0 and Overview prints "0% of peak" even with a real drawdown (`calc.ts` peak>0 guard + `overview.tsx`).
6. **Weekday grouping is locale-fragile**: keys via `format(..., "EEE")` compared to hard-coded English `WEEKDAYS` (`review-view.tsx`); a non-English locale zero-fills the whole panel. Same flavour: currency hard-coded `USD`/`en-US` (`format.ts`).
7. **Review heatmap auto-scrolls to the end** (`scrollLeft = scrollWidth`), clipping the weekday letters and first column on desktop — visible in their own `review-desktop.png`.
8. Minor: mobile header buttons aren't disabled before hydration (desktop are); rule editing writes to storage on **every keystroke** and deletes the rule if blurred while empty; trades list renders all rows (no pagination).

## 5. Incomplete vs. the app's own model

- **Computed but never shown:** `avgR`, `avgWin`, `avgLoss`, `grossProfit/Loss`, `scratches` (`calc.ts`) — Overview shows only 4 stats. `formatDayLong`/`gradeLabel` are dead exports.
- **Collected but never shown:** rule `checks` are stored for every date, but the UI only shows today — no adherence history/streak, the obvious payoff of the feature.
- **No CSV anything** — no broker import, no CSV/spreadsheet export. Only Folio's own JSON round-trips. For a trading journal this is the biggest practical gap after the multiplier bug.
- **No date-range/account filters, no sorting options** in Trades (search + result chips + single-day only); stats are always all-time.
- **Views aren't URLs** — one route (`/`), view kept in React state: no deep-linking, refresh always lands on Overview, back button does nothing.
- **Brand pass undone** — no `public/og.jpg`, `src/lib/og/site.json` is just `{title, color}` (no description/image/card), PWA name/icon come from the Grok template (`public/__grok/icon-180.png`). Their harness labels this a NOTE not WARNING (it classifies Folio as a plain utility), so skipping may have been intentional — but it was never documented either way.
- **By-design absences to confirm against the original ask:** no accounts/sync/backup-to-cloud (localStorage only — clear site data = lose journal), no open-trade tracking (closed only, per copy), no charts beyond equity (no R distribution, no drawdown curve).

## 6. Template weight / hygiene

- **~4,535 LOC of unused platform code** ships in `src/lib/{auth,app-data,multiplayer}` + `db.ts` (Better Auth, PGLite/Kysely, a 20 KB P2P module — none imported by the journal). 58 production deps for a localStorage app; client JS is 931 KB raw (276 KB gzip) with Recharts in the main route chunk and no per-view code-splitting. All strippable.
- Zip shipped `.vercel/output`, `.tanstack`, `.grok`, `startup.sh` hard-coding `/workspace` (broken anywhere else), `vercel.json` with `--omit=dev` install, and no README. `recharts@2.x`, `eslint@9.39` already emit deprecation warnings.
- Accessibility: the custom `Choice` radiogroups (`trade-dialog.tsx`) use `role=radio` buttons with no roving tabindex/arrow-key support.

## 7. What I changed this turn

- Restored the clean app into this repo (src/server/scripts/migrations/public/screenshots + configs), excluding `.grok/.vercel/.tanstack` junk; Grok's contract saved as `docs/grok-AGENTS.md`.
- `vite.config.ts`: `allowedHosts: true` so the Arena live preview can load it (was 403). Rewrote `startup.sh` to be path-relative.
- Re-ran all gates (table in §2) and left the **dev server running as the live preview** so the app can be eyeballed.
- The original `grok-workspace.zip` is still in the repo untouched — delete it once you're happy the restore is faithful.

## 8. Recommended completion plan (in order)

1. **[S] Settle production** — re-run built smoke with a hydration-aware wait (wait for "Closed P&L", not 1 s); disable/shorten the Recharts animation; screenshot the finished chart. Get a non-diverging built verdict.
2. **[S] Fix the 3 correctness bugs** — multiplier field per market, multi-tag grouping, stop-direction validation; harden backup (real date validation, dedupe IDs, prune orphan checks).
3. **[M] Add journal unit tests** for `calc`/`backup` (P&L per market, R, drawdown, grouping, restore validation); quarantine/fix the 6 template OG tests and the lint error so `npm test`/`npm run lint` are green.
4. **[M] Surface what's already computed/collected** — avg R / avg win / avg loss on Overview; rule-adherence history in Rules/Review.
5. **[M] CSV import/export** (export first — trivial from `Trade[]`; import with column mapping next).
6. **[S] Brand pass** — custom `og.jpg` + completed `site.json`, own PWA icon, README.
7. **[M] Slim down** — remove unused auth/db/multiplayer code + deps, code-split Recharts/Review.
8. **[decision needed]** Accounts/cloud sync and date-range stats — only if they were in the original ask (not in the zip).
