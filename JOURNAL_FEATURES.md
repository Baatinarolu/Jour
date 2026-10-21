# SANTANDC journal feature map

This build was intentionally narrowed to **trade journaling and chart review**. It borrows the journal-shaped ideas visible in modern products such as EdgeFlo without importing EdgeFlo's trading terminal, broker execution, news, notebook, wellbeing, academy, or always-on AI workspace.

| Journal capability | SANTANDC implementation |
|---|---|
| Manual trade logging | Full closed-trade form for prices, quantity, multiplier, fees, stop, target, timeframe, account label, and TradingView symbol. |
| Broker spreadsheet import | CSV alias mapping, row-level errors, multiplier support, exact-duplicate skipping, and SANTANDC round-trip export. No live broker credential sync. |
| Emotion journaling | Separate entry and exit emotion, confidence, reasons, mistake, lesson, tags, and execution grade. |
| Voice journaling | Optional browser dictation/transcript where the browser supports SpeechRecognition. |
| Chart evidence | Up to three compressed screenshots pasted or uploaded per trade, plus one optional example image per playbook. |
| Trading chart beside the plan | Full-viewport official TradingView Advanced Chart workspace with native full-screen mode, collapsible journal panel, optional journal watchlist, exact per-trade symbol override, symbol inference, interval conversion, and full TradingView deep links. |
| Playbooks / entry models | Markets, sessions, timeframes, entry criteria checklist, invalidation, management rules, notes, example chart, and per-playbook performance/compliance. |
| Risk context | Stop-defined planned risk and R, realized RR, optional MAE/MFE and excursion R, stop-aware position-size helper, and off-plan cost. |
| Performance dashboard | Net P&L, win rate, profit factor, expectancy, payoff, drawdown, streaks, and money/R/% performance switching. |
| Global analytics filters | Today, week, 14/30/90-day and all-time ranges. |
| Composite score | Transparent SANTANDC Score with named sub-scores instead of a black-box grade. |
| Leak detection | Repeated negative buckets across setup, session, emotion, mistake, confidence, grade, weekday, account, and symbol, with a leave-it-out what-if. |
| Best conditions | Positive repeated buckets, including average R where stops exist. |
| Weekly review report | Deterministic local summary, strengths, leaks, rolling trend, reflection prompt, and one focus; downloadable as Markdown. |
| Calendar review | 12-week heatmap plus a navigable month calendar and weekly/monthly rhythm summaries. |
| Session analysis | Asia, London, London/New York overlap, New York, and Other breakdowns. |
| Deep cuts | Playbook, account, market, timeframe, emotions, mistake, confidence, hour, and holding-time breakdowns in addition to symbol/setup/side/grade/tags. |
| Data integrity | Versioned local backups, v1/v2 migration, validation, duplicate-ID repair, and CSV fingerprints. |

## Deliberately not included

- Live broker connections, order entry, paper positions, alerts, or kill switches.
- Economic calendars/news analysis.
- A general notebook, meditation/Sanctuary area, courses, or community features.
- Cloud accounts, multi-device sync, or a server-side AI coach.
- TradingView webhooks. SANTANDC stores its journal in browser `localStorage`; a reliable webhook inbox would require authenticated server storage and would contradict the current local-only architecture.

## Design rule

Every new field must answer a review question:

- Was this the planned setup?
- Was the risk defined before entry?
- What did price do against/for the position?
- What was felt at entry and exit?
- What repeated mistake or condition explains the result?
- What changes on the next similar trade?

If a field cannot help answer one of those, it does not belong in the journal.
