# Tasks — Roulette Dealer Analytics (mobile)

Order follows the PRD's direction: CRM and reliable spin history first, analytics and prediction on top.

## Phase 1 — Core (pure logic)
- [x] T1 Wheel definitions (EU/US), pocket labels, colour and category maps — R3.4, R4.2
- [x] T2 Counts, category stats, streaks, gaps, period comparison — R4.2–R4.3
- [x] T3 Chi-square goodness of fit with p-value; Wilson interval — R4.5, R5.3
- [x] T4 Models: baseline, frequency, smoothed — R5.1
- [x] T5 Walk-forward backtest with paired SE vs baseline — R5.4–R5.5
- [x] T6 Prediction evaluation without leakage — R6.2–R6.3
- [x] T7 Unit tests for T1–T6

## Phase 2 — Data layer
- [x] T8 Store: in-memory state, typed mutations, ids — R1, R2, R3
- [x] T9 CloudStore adapter (private `db` subtree, ledger chunking, per-doc write queue) — R7.5
- [x] T10 LocalStore fallback + storage banner
- [x] T11 Export / import JSON (merge by id) — R7.6
- [x] T12 Sample data generator (clearly marked as simulated)

## Phase 3 — CRM screens
- [x] T13 Home: casinos, recent dealers, settings — R1
- [x] T14 Casino create/edit/archive/remove with guards — R1.4–R1.6
- [x] T15 Casino workspace: dealer list, search, status filter, stats — R1.7, R2.4
- [x] T16 Dealer create/edit/archive/remove (typed confirm), wheel lock — R2

## Phase 4 — Spin history
- [x] T17 Record keypad, duplicate guard, time override, session label, Undo — R3.2–R3.4
- [x] T18 Bulk paste with validation and timestamp spacing — R3.5
- [x] T19 History list: sort, date/session filter, edit sheet with log, soft delete — R3.6–R3.10

## Phase 5 — Analytics & prediction
- [x] T20 Stats tab: window chips, completeness, category bars, pocket heat grid, chi-square, streaks, gaps, period comparison — R4
- [x] T21 Predict tab: model controls, pocket + category probabilities vs baseline, explainability panel, disclaimer — R5
- [x] T22 Backtest card with verdict — R5.4–R5.5
- [x] T23 Save prediction, saved list with evaluation and aggregate — R6

## Phase 5b — Suggested bet (change request)
- [x] T27 Core: wheel order (EU/US), pick with recency tie-break, neighbours and best-arc sectors, binomial tail, pick/sector walk-forward record — R5.7–R5.10
- [x] T28 Suggested-bet card: pick hero, sector chips, wheel diagram, table highlight, track record — R5.7–R5.9
- [x] T29 Saved estimates store pick + sector; evaluation shows hit/miss and aggregate hit rates — R6.1, R6.3

## Phase 5c — Cost, payout, top-N (change request)
- [x] T30 Core: `top` bet mode with recency tie-break, `betEconomics`, top-N walk-forward — R5.8, R5.11
- [x] T31 Chip input, cost/payout table, replay P&L, saved-estimate P&L — R5.11–R5.12

## Phase 5d — Hot and cold (change request)
- [x] T32 Core `hotCold` with tie rules and Bonferroni-adjusted binomial tails — R4.7–R4.8
- [x] T33 Stats "Hot and cold" card and Record-tab hot/cold line — R4.7–R4.9

## Phase 5e — Recency weighting (change request)
- [x] T34 Core: `weightedCounts`, decay tracker, `weighted` model in predict/backtest, weighted pick record — R5.1, R5.9
- [x] T35 Predict: model chip, half-life chips with weight-by-age readout, effective n, saved params — R5.1, R5.3

## Phase 5f — Bet placement (change request)
- [x] T36 Core `betPlacement` (minimum exact cover with inside bets, EU/US zero bets); SVG table with chips on lines and corners; placement list — R5.13

## Phase 5g — Standard strategies (change request)
- [x] T37 Core `simulateStrategy` (7 systems, limits, bust) and `strategyBenchmark` (seeded fair-wheel runs) — R5b.1–R5b.4
- [x] T38 Strategies tab: bet/unit/bankroll/limit controls, profit-factor table, per-strategy card with bankroll line and fair-wheel comparison — R5b.1–R5b.4

## Phase 6 — Ship
- [x] T24 Build script inlines modules into `dist/index.html`
- [x] T25 Playwright smoke test at phone width, light + dark
- [x] T26 Publish as private Artifact
