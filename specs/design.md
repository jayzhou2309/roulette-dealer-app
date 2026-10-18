# Design — Roulette Dealer Analytics (mobile)

## 1. Architecture

```
┌────────────────────────────── index.html (single page) ─────────────────────────────┐
│  UI layer (app.js)          screens, router, keypad, sheets, SVG charts               │
│        │ reads/writes                                                                 │
│  Store (app.js)             in-memory state + typed mutations + persistence queue      │
│        │                                                                              │
│  Persistence adapter        CloudStore (claude.ai `db`, private per user)             │
│                             LocalStore  (localStorage fallback, single JSON blob)     │
│  Core (core.js, pure)       wheel defs, categories, stats, models, backtest, eval     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

* `core.js` has no DOM access; it is unit-tested in Node and inlined into the page at build.
* `build.mjs` inlines `core.js`, `app.js` and `styles.css` into `dist/index.html`.

## 2. Data model

All ids are client-generated (`c_…`, `d_…`, `s_…`, `p_…`).

```ts
Casino   { id, name, location, notes, meta: {k: v}, wheel: 'EU'|'US', status: 'active'|'archived', createdAt }
Dealer   { id, casinoId, name, table, notes, wheel, status, createdAt }
Spin     { id, casinoId, dealerId, pocket: 0..37 /* 37 = "00" */, t /* spin time ms */,
           rt /* recorded time ms */, session, notes, log: [{pocket,t,session,at}], del?: msTime }
Prediction { id, casinoId, dealerId, createdAt, cutoff, window, model, modelVersion, params,
             wheel, n, from, to, probs: number[] }
```

`Session` is a label on the spin (PRD lists it as optional grouping); sessions are derived from distinct labels.
`PredictionEvaluation` is derived at render time from the prediction + current history (R6.2), so corrections to history re-score automatically (R3.11).

### Storage layout (claude.ai `db`, all under the viewer's private subtree)

```
data/users/<uid>/ws                          (workspace doc: schema version)
data/users/<uid>/ws/casinos/<casinoId>
data/users/<uid>/ws/dealers/<dealerId>
data/users/<uid>/ws/ledgers/<dealerId>~<k>  { dealerId, casinoId, k, spins: Spin[] }  ≤ 800 spins each
data/users/<uid>/ws/predictions/<predId>
```

Spins are chunked into ledger documents to stay well under the 25,000-document and 256 KiB limits. New spins append to the dealer's last ledger; edits rewrite the ledger holding the spin. Writes are serialised per document.

LocalStore keeps the same shape in one `localStorage` key.

## 3. Statistics (core.js)

| Function | Purpose |
|---|---|
| `wheel(type)` | pocket list, labels, size (37/38) |
| `colorOf(p)`, `categoriesOf(p)` | red/black/green, odd/even, low/high, dozen, column (zeros excluded from outside bets) |
| `counts(spins, size)` | pocket counts |
| `categoryStats(spins, wheel)` | observed vs theoretical for every category group |
| `streaks(spins)` | current/longest runs for colour, parity, low/high; repeats |
| `gaps(spins, wheel)` | spins since each pocket last hit |
| `chiSquare(counts)` | statistic, df, p-value (regularised upper incomplete gamma) |
| `wilson(k, n)` | 95% interval |
| `predict(model, spins, wheel, params)` | probability vector |
| `backtest(spins, wheel, window, params)` | walk-forward log loss / Brier per model, paired diff vs baseline with SE |
| `evaluate(pred, spins)` | outcome, logLoss, brier, baseline scores, pick/sector hit |
| `pick(probs, pockets, w)` | top pocket, ties to most recent; null when all equal |
| `bestSector(probs, w, k, pick, centered)` | neighbours arc around the pick, or the highest-mass contiguous arc |
| `pickBacktest(pockets, w, win, k, …)` | walk-forward hit counts for pick and sector, binomial p-values |

Models:
* **Baseline v1:** `1/N`.
* **Frequency v1:** `c_i / n` with a floor of `1e-6` for scoring (log loss is otherwise infinite).
* **Smoothed v1:** `(c_i + α) / (n + αN)`, α default 5 (pseudo-spins per pocket).
* **Recency-weighted v1 (default):** weighted counts `w_i = Σ 0.5^(age/H)` over the window (latest spin age 0), `p_i = (w_i + α) / (Σw + αN)`. H default 50. Uncertainty uses effective n = (Σw)² / Σw². Walk-forward replays use an incremental decay tracker (multiply by 0.5^(1/H) each spin, subtract 0.5^(W/H) for the spin leaving the window).

Backtest starts after 20 spins of history so the first predictions are not degenerate; uses the same window rule as the live view (last W spins before the scored spin).

## 4. Screens & navigation

```
Home (casinos, recent dealers, totals)
 └─ Casino workspace (dealers list, search, filter, casino stats, edit/archive)
     └─ Dealer (header: name · table · wheel · n spins)
          tabs: Record | History | Stats | Predict
```

* Bottom tab bar inside a dealer; back button in the top bar; casino switcher on Home.
* **Record:** table-layout keypad (0/00 + 3 × 12 grid) in pocket colours, last-20 strip, session label, time override, Undo toast, bulk paste sheet.
* **History:** list grouped by day, sort toggle, date + session filters, tap → edit sheet (pocket, time, session, notes, delete).
* **Stats:** window chips → sample header & completeness → category bars (observed vs expected tick) → pocket heat grid (deviation from expected, diverging) → chi-square verdict → streaks & gaps → period comparison.
* **Predict:** model + window + α controls → suggested bet (pick, sector chips, wheel diagram, table highlight, track record) → top pockets vs baseline → category probabilities → "how this was made" panel → backtest table with verdict → Save → saved predictions with evaluations.
* Settings sheet (Home): storage status, export, import, sample data loader.

## 5. Visual direction

Casino-floor "result board": cool green-grey neutrals, brass accent, condensed numerals for pocket values. Pocket red/black/green are reserved for pockets only. Deviation uses a diverging brass (above expected) / slate-blue (below) pair with a neutral midpoint. Light and dark themes via tokens.

## 6. Error handling

* Store unavailable → LocalStore + banner "Saved on this device only".
* Write failure → toast with retry; state stays in memory.
* `quota_exceeded` → toast telling the user to export and remove old dealers.

## 7. Testing

* `node --test test/` — wheel/category maps, counts, chi-square vs known values, Wilson, models sum to 1, backtest has no look-ahead, evaluation picks the right spin, smoothing behaviour.
* Playwright smoke run on the built page at phone size: create casino → dealer → record spins → stats → predict → save.
