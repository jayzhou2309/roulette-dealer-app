# Requirements — Roulette Dealer Analytics (mobile)

Source: *Roulette Dealer Analytics & Prediction App — PRD v1.0 (18 Oct 2026)*.
Format: user stories with EARS acceptance criteria. IDs trace to PRD sections.

## Resolved open decisions (PRD §10)

| Decision | Resolution for this build |
|---|---|
| Roulette type | Both. Wheel type (European 0–36 / American 0, 00, 1–36) is set per casino as a default and stored per dealer. Locked once a dealer has spins. |
| Spin entry | Manual single entry (tap keypad) **and** bulk paste of historical results in the MVP. |
| Dealer identity | Separate dealer profile per casino (no global identity). |
| Prediction display | Individual pockets **and** outside-bet categories (colour, parity, low/high, dozens, columns). |
| Deployment | Mobile-first web app hosted as a private claude.ai Artifact. Data is stored in the signed-in user's private store; falls back to on-device storage when the store is unavailable. JSON export/import for backup. |
| Technology | Single-page vanilla JS + inline SVG. Pure statistics module tested with `node:test`. |

---

## R1 Casino CRM (PRD §4.1, P0)

**Story:** As a user, I manage multiple casinos so each keeps its own dealers and data.

1. The app shall store for each casino: id, name, location (optional), notes, metadata key/values, default wheel type, status (active/archived), created-at.
2. When the user creates a casino with a non-empty name, the app shall save it and open its workspace.
3. When the user selects a casino, the app shall show only dealers whose `casinoId` equals that casino's id.
4. When the user archives a casino, the app shall hide it from the default list and keep all its dealers, spins and predictions.
5. If the user removes a casino that still has dealers, then the app shall block removal and offer archive instead.
6. When the user removes an empty casino, the app shall require an explicit in-page confirmation first.
7. The casino workspace shall show casino stats: dealer count, total spins, last activity.

## R2 Dealer management (PRD §4.2, P0)

1. The app shall store per dealer: id, casinoId, name/nickname, table number (optional), notes, status, wheel type, created-at.
2. When the user creates a dealer, the app shall link it to the current casino and default its wheel type from the casino.
3. While a dealer has one or more spins, the app shall not allow changing its wheel type.
4. The dealer list shall support text search (name, table, notes) and a status filter (active / archived / all).
5. When the user archives a dealer, the app shall keep its full spin and prediction history readable.
6. When the user removes a dealer, the app shall require typing the dealer name to confirm, then delete the dealer, its spins and its predictions.
7. Foreign keys shall use stable ids, never names.

## R3 Spin recording & history (PRD §4.3, P0)

1. Each spin shall store: id, casinoId, dealerId, pocket, spin time, recorded time, session label (optional), notes (optional), edit log, deleted flag.
2. When the user taps a pocket on the keypad, the app shall record a spin with spin time = now unless the user set a different time.
3. If the same pocket is tapped again within 700 ms, then the app shall ignore the second tap (duplicate guard).
4. The app shall reject pockets outside the dealer's wheel (e.g. `00` on a European wheel).
5. When the user pastes a list of results, the app shall validate every token, show invalid tokens, and on confirm record them oldest-first with timestamps spaced by a chosen interval ending at a chosen time.
6. The history list shall be sortable newest-first or oldest-first, by spin time.
7. The history shall be filterable by date range and session.
8. When the user edits a spin, the app shall append the previous values to its edit log and show an "edited" marker.
9. When the user deletes a spin, the app shall soft-delete it (excluded from analytics, restorable via Undo).
10. When spins are added retrospectively, ordering shall use spin time so chronology is preserved.
11. When history changes, all analytics, backtests and prediction evaluations shall recompute from the current history.

## R4 Dealer analytics dashboard (PRD §4.4, P0)

1. Every figure shall be computed only from the selected dealer's non-deleted spins inside the selected window (last 50 / 100 / 250 / all).
2. The dashboard shall show: frequency of each pocket; red/black/green, odd/even, low/high, dozens, columns distributions with theoretical expectation; recent results; current and longest streaks; spins since each pocket last appeared.
3. The dashboard shall compare the latest window against the preceding window of equal size.
4. The dashboard shall show sample size, time span, sessions covered and a completeness indicator (sample big enough for a pocket-level test when expected count per pocket ≥ 5).
5. The dashboard shall show a chi-square goodness-of-fit test against the fair wheel and state the result in plain words.
6. Descriptive panels shall be labelled "Observed"; nothing on the dashboard shall be labelled as a prediction.
7. **Hot and cold:** For the selected dealer and window, the dashboard shall list the 5 pockets with the most hits (ties: most recent) and the 5 with the fewest (ties: longest absent), each with hit count, expected count and spins since last seen.
8. A hot or cold pocket shall be marked "Unusual" only when its binomial tail probability, multiplied by the number of pockets (Bonferroni), is below 0.05; below 5 × N spins the app shall say the lists mostly reflect luck.
9. The Record tab shall show a compact top-3 hot / top-3 cold line for the dealer that updates as spins are recorded and links to Stats.

## R5 Prediction engine (PRD §4.5, P0)

1. The app shall offer four models: **Baseline** (1/37 or 1/38), **Historical frequency** (empirical), **Smoothed frequency** (additive smoothing toward the baseline with configurable strength), and **Recency-weighted** (each spin weighted 0.5^(age / half-life), half-life selectable 10/25/50/100/250 spins, plus the same smoothing). Recency-weighted is the default.
2. The app shall show per-pocket probabilities and category probabilities, each next to the baseline.
3. Each estimate shall show: model and version, its parameters (α, half-life), the effective sample size for the weighted model, window, sample size, analysis period (first–last spin), generation time, and a 95% interval for each pocket's observed rate.
4. The app shall run a walk-forward backtest: each spin is scored using only spins before it. Report log loss and Brier score for each model and the difference against baseline.
5. A model shall be labelled "beats baseline" only when its backtest log loss is lower than baseline's by more than two standard errors of the paired difference; otherwise the app shall say there is no evidence of an edge.
6. The app shall always show a statement that past spins do not change the probabilities of a fair wheel and that no estimate guarantees a win.
7. **Suggested bet:** For a history-based model, the app shall show one pick (highest estimate; ties go to the most recently seen pocket) and a sector, highlighted on a wheel diagram and on the betting-table layout.
8. Multi-number options: *Neighbours* (pick plus 2 pockets either side in wheel order), *Top 3 / Top 5* (highest estimates anywhere, pick first), or the strongest contiguous 7, 9 or 12 pockets on the wheel.
9. The pick and multi-number bets shall rank pockets by the selected model (weighted scores for Recency-weighted). The app shall show the walk-forward hit rate of "bet the pick" and "bet the sector" for that dealer against chance (1/N and k/N), flagging only results with a one-sided binomial p < 0.01.
10. When the baseline model is selected, or all pockets are tied, the app shall show no pick.
11. **Cost and payout:** Given a chip value per number (default 10), the app shall show for the pick and for the multi-number bet: cost per spin, amount paid back on a hit (36 × chip, straight up at 35 to 1), profit if it hits, loss if it misses, hit chance (model and fair wheel), expected result per spin at fair odds and under the model's estimate, and the net result of replaying the rule over the dealer's past spins.
12. Saved estimates shall store the chip value and show the win/loss of the pick and the multi-number bet once scored.
13. **Bet placement:** The betting-table layout shall mark where to place chips for the multi-number bet, using the fewest inside bets (straight up, split, trio, street, corner, six line) that cover exactly its numbers, each staked at one chip per number covered so cost and return match straight-up chips; a list shall give each placement's bet type, numbers, stake and payout. For a neighbours bet it shall note that the bet can be called to the dealer.

## R6 Prediction history & evaluation (PRD §4.6, P1)

1. When the user saves a prediction, the app shall store: casinoId, dealerId, created-at, cutoff (latest spin time used), window, model id/version/params, wheel, sample size, full probability distribution, and the pick and sector pockets.
2. The evaluation outcome shall be the first non-deleted spin of that dealer whose spin time is after the cutoff and whose recorded time is after the prediction's creation (no leakage).
3. For each evaluated prediction the app shall show the actual pocket, probability assigned, log loss, Brier score, the baseline's scores for the same spin, and whether the pick and sector hit.
4. The app shall show aggregate evaluation (mean log loss vs baseline, count) across saved predictions.

## R7 Non-functional (PRD §7)

1. **Isolation:** every query filters by dealer id (and casino id); no view mixes dealers or casinos.
2. **Reliability:** pocket validation and duplicate-tap guard (R3.3–R3.4).
3. **Performance:** dashboard renders < 200 ms for 5,000 spins on a mid-range phone.
4. **Auditability:** spin edit log; prediction records immutable after save.
5. **Security:** data lives in the signed-in user's private store subtree.
6. **Backup:** export all data to JSON; import JSON (merge by id).
7. **Responsive:** works from 360 px wide upward, light and dark theme.
8. **Explainability:** every estimate shows its window and method (R5.3).

## Out of scope (PRD §8)

Live casino integrations, camera capture, multi-user permissions, wheel sensors, profitability claims, automated betting.
