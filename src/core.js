// Pure roulette statistics. No DOM access; loaded in the page and in Node tests.
const Core = (() => {
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const DOUBLE_ZERO = 37;
  const EPS = 1e-6; // probability floor so log loss stays finite
  const MODEL_VERSION = { baseline: '1.0', frequency: '1.0', smoothed: '1.0' };
  const MODELS = [
    { id: 'baseline', name: 'Baseline', desc: 'Theoretical fair-wheel probability for every pocket.' },
    { id: 'frequency', name: 'Historical frequency', desc: 'Share of past spins that landed on each pocket.' },
    { id: 'smoothed', name: 'Smoothed frequency', desc: 'Past counts plus α pseudo-spins per pocket, pulling small samples toward the baseline.' },
  ];

  function wheel(type) {
    const size = type === 'US' ? 38 : 37;
    const pockets = Array.from({ length: size }, (_, i) => i);
    return { type: type === 'US' ? 'US' : 'EU', size, pockets, name: type === 'US' ? 'American (0, 00)' : 'European (single 0)' };
  }

  function label(p) { return p === DOUBLE_ZERO ? '00' : String(p); }

  function parsePocket(token, w) {
    const s = String(token).trim();
    if (s === '00') return w.size === 38 ? DOUBLE_ZERO : null;
    if (!/^\d{1,2}$/.test(s)) return null;
    const n = Number(s);
    return n >= 0 && n <= 36 ? n : null;
  }

  function colorOf(p) {
    if (p === 0 || p === DOUBLE_ZERO) return 'green';
    return RED.has(p) ? 'red' : 'black';
  }

  const isZero = (p) => p === 0 || p === DOUBLE_ZERO;

  const GROUPS = [
    { key: 'color', label: 'Colour', items: [
      { k: 'red', label: 'Red', test: (p) => colorOf(p) === 'red' },
      { k: 'black', label: 'Black', test: (p) => colorOf(p) === 'black' },
      { k: 'green', label: 'Green (zero)', test: isZero },
    ] },
    { key: 'parity', label: 'Odd / even', items: [
      { k: 'odd', label: 'Odd', test: (p) => !isZero(p) && p % 2 === 1 },
      { k: 'even', label: 'Even', test: (p) => !isZero(p) && p % 2 === 0 },
    ] },
    { key: 'range', label: 'Low / high', items: [
      { k: 'low', label: '1–18', test: (p) => !isZero(p) && p <= 18 },
      { k: 'high', label: '19–36', test: (p) => !isZero(p) && p >= 19 },
    ] },
    { key: 'dozen', label: 'Dozens', items: [
      { k: 'd1', label: '1st 12', test: (p) => !isZero(p) && p <= 12 },
      { k: 'd2', label: '2nd 12', test: (p) => p >= 13 && p <= 24 },
      { k: 'd3', label: '3rd 12', test: (p) => p >= 25 && p <= 36 },
    ] },
    { key: 'column', label: 'Columns', items: [
      { k: 'c1', label: 'Column 1', test: (p) => !isZero(p) && p % 3 === 1 },
      { k: 'c2', label: 'Column 2', test: (p) => !isZero(p) && p % 3 === 2 },
      { k: 'c3', label: 'Column 3', test: (p) => !isZero(p) && p % 3 === 0 },
    ] },
  ];

  // Chronological, non-deleted spins for one dealer.
  function activeSpins(spins) {
    return spins.filter((s) => !s.del).slice().sort((a, b) => a.t - b.t || a.rt - b.rt);
  }

  function windowed(spins, win) {
    return win && win !== 'all' && spins.length > win ? spins.slice(spins.length - win) : spins;
  }

  function counts(pockets, size) {
    const c = new Array(size).fill(0);
    for (const p of pockets) if (p >= 0 && p < size) c[p]++;
    return c;
  }

  // Observed vs theoretical share for every outside-bet group.
  function categoryStats(pockets, w) {
    const n = pockets.length;
    return GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      items: g.items.map((it) => {
        const k = pockets.reduce((a, p) => a + (it.test(p) ? 1 : 0), 0);
        const expected = w.pockets.filter(it.test).length / w.size;
        return { k: it.k, label: it.label, count: k, observed: n ? k / n : 0, expected, ci: wilson(k, n) };
      }),
    }));
  }

  // Probability of each category under a pocket distribution.
  function categoryProbs(probs, w) {
    return GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      items: g.items.map((it) => ({
        k: it.k,
        label: it.label,
        p: w.pockets.reduce((a, p) => a + (it.test(p) ? probs[p] : 0), 0),
        base: w.pockets.filter(it.test).length / w.size,
      })),
    }));
  }

  function runInfo(pockets, keyFn) {
    let cur = null, curLen = 0, best = null, bestLen = 0;
    for (const p of pockets) {
      const k = keyFn(p);
      if (k !== null && k === cur) curLen++;
      else { cur = k; curLen = k === null ? 0 : 1; }
      if (cur !== null && curLen > bestLen) { best = cur; bestLen = curLen; }
    }
    return { current: cur, currentLen: curLen, longest: best, longestLen: bestLen };
  }

  function streaks(pockets) {
    return {
      color: runInfo(pockets, (p) => (isZero(p) ? null : colorOf(p))),
      parity: runInfo(pockets, (p) => (isZero(p) ? null : p % 2 ? 'odd' : 'even')),
      range: runInfo(pockets, (p) => (isZero(p) ? null : p <= 18 ? 'low' : 'high')),
      dozen: runInfo(pockets, (p) => (isZero(p) ? null : p <= 12 ? '1st 12' : p <= 24 ? '2nd 12' : '3rd 12')),
      repeats: pockets.reduce((a, p, i) => a + (i && pockets[i - 1] === p ? 1 : 0), 0),
    };
  }

  // Spins since each pocket last appeared (null = never in this sample).
  function gaps(pockets, w) {
    const g = new Array(w.size).fill(null);
    for (let i = pockets.length - 1, seen = 0; i >= 0 && seen < w.size; i--) {
      const p = pockets[i];
      if (g[p] === null) { g[p] = pockets.length - 1 - i; seen++; }
    }
    return g;
  }

  // ---- distributions ----
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (const ci of c) ser += ci / ++y;
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }

  // Regularised upper incomplete gamma Q(a, x).
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 500; n++) {
        ap++; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
      }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }

  // Goodness of fit against a uniform (fair) wheel.
  function chiSquare(c) {
    const n = c.reduce((a, b) => a + b, 0);
    const k = c.length;
    if (!n) return { stat: 0, df: k - 1, p: 1, n, expected: 0, valid: false };
    const e = n / k;
    const stat = c.reduce((a, o) => a + ((o - e) ** 2) / e, 0);
    return { stat, df: k - 1, p: gammaQ((k - 1) / 2, stat / 2), n, expected: e, valid: e >= 5 };
  }

  function wilson(k, n, z = 1.96) {
    if (!n) return [0, 1];
    const p = k / n, z2 = z * z, d = 1 + z2 / n;
    const centre = (p + z2 / (2 * n)) / d;
    const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
    return [Math.max(0, centre - half), Math.min(1, centre + half)];
  }

  // ---- models ----
  function predict(model, pockets, w, params = {}) {
    const N = w.size;
    if (model === 'baseline' || !pockets.length) return new Array(N).fill(1 / N);
    const c = counts(pockets, N), n = pockets.length;
    if (model === 'frequency') return c.map((x) => x / n);
    const a = params.alpha ?? 5;
    return c.map((x) => (x + a) / (n + a * N));
  }

  const logLoss = (p) => -Math.log(Math.max(p, EPS));
  const brier = (probs, actual) => probs.reduce((a, p, i) => a + (p - (i === actual ? 1 : 0)) ** 2, 0);

  // Walk-forward: spin i is scored using only the `win` spins before it.
  function backtest(pockets, w, win, params = {}, minHistory = 20) {
    const N = w.size, a = params.alpha ?? 5;
    const W = win === 'all' || !win ? Infinity : win;
    const c = new Array(N).fill(0);
    let n = 0, sumSq = 0, lo = 0;
    const res = { baseline: [], frequency: [], smoothed: [] };
    const br = { baseline: [], frequency: [], smoothed: [] };
    const add = (p, d) => { sumSq += 2 * d * c[p] + 1; c[p] += d; n += d; };
    for (let i = 0; i < pockets.length; i++) {
      if (i >= minHistory) {
        const y = pockets[i];
        res.baseline.push(logLoss(1 / N));
        br.baseline.push(1 - 1 / N);
        const pf = c[y] / n;
        res.frequency.push(logLoss(pf));
        br.frequency.push(sumSq / (n * n) - 2 * pf + 1);
        const D = n + a * N, ps = (c[y] + a) / D;
        res.smoothed.push(logLoss(ps));
        br.smoothed.push((sumSq + 2 * a * n + N * a * a) / (D * D) - 2 * ps + 1);
      }
      add(pockets[i], 1);
      if (n > W) add(pockets[lo++], -1);
    }
    const m = res.baseline.length;
    const out = { scored: m, window: win, minHistory, models: {} };
    for (const id of Object.keys(res)) {
      const ll = res[id], diffs = ll.map((x, i) => x - res.baseline[i]);
      const md = mean(diffs), se = m > 1 ? Math.sqrt(variance(diffs) / m) : NaN;
      out.models[id] = {
        logLoss: mean(ll), brier: mean(br[id]), diff: md, se,
        beats: id !== 'baseline' && m >= 30 && md + 2 * se < 0,
        worse: id !== 'baseline' && m >= 30 && md - 2 * se > 0,
      };
    }
    return out;
  }

  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
  function variance(a) {
    const m = mean(a);
    return a.length > 1 ? a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) : 0;
  }

  // Outcome = first spin after the cutoff that was recorded after the prediction was made.
  function evaluate(pred, spins) {
    const next = activeSpins(spins).find((s) => s.t > pred.cutoff && s.rt > pred.createdAt);
    if (!next) return null;
    const N = pred.probs.length, y = next.pocket;
    return {
      spinId: next.id, pocket: y, t: next.t,
      p: pred.probs[y], logLoss: logLoss(pred.probs[y]), brier: brier(pred.probs, y),
      baseP: 1 / N, baseLogLoss: logLoss(1 / N), baseBrier: 1 - 1 / N,
      rank: 1 + pred.probs.filter((q) => q > pred.probs[y]).length,
      pickHit: pred.pick == null ? null : y === pred.pick,
      sectorHit: pred.sector ? pred.sector.includes(y) : null,
    };
  }

  // Physical pocket order around each wheel, clockwise from zero.
  const WHEEL_ORDER = {
    EU: [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26],
    US: [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2],
  };

  // Highest-probability pocket; ties go to the most recently seen. null when every pocket is equal.
  function pick(probs, pockets, w) {
    const max = Math.max(...probs);
    const tied = w.pockets.filter((p) => probs[p] >= max - 1e-12);
    if (tied.length === w.size) return null;
    const g = gaps(pockets, w);
    tied.sort((a, b) => (g[a] ?? Infinity) - (g[b] ?? Infinity) || a - b);
    return { pocket: tied[0], p: probs[tied[0]], tied: tied.length };
  }

  // A k-number bet built around the pick.
  //   'neighbours': the pick plus (k-1)/2 pockets either side in wheel order
  //   'arc':        the contiguous run of k pockets with the highest total probability
  //   'top':        the k highest-probability pockets anywhere (ties to the most recently seen, via gapsArr)
  function bestSector(probs, w, k, pickPocket, mode = 'arc', gapsArr = null) {
    const order = WHEEL_ORDER[w.type], N = order.length;
    if (mode === true || mode === 'neighbours') {
      const i = order.indexOf(pickPocket), h = Math.floor(k / 2);
      const ps = Array.from({ length: k }, (_, j) => order[(i - h + j + N) % N]);
      return { pockets: ps, p: ps.reduce((a, p) => a + probs[p], 0), base: k / N, hasPick: true, contiguous: true };
    }
    if (mode === 'top') {
      const g = gapsArr || new Array(N).fill(null);
      const ps = w.pockets.slice().sort((a, b) => (a === pickPocket ? -1 : b === pickPocket ? 1 : 0)
        || probs[b] - probs[a] || (g[a] ?? Infinity) - (g[b] ?? Infinity) || a - b).slice(0, k);
      return { pockets: ps, p: ps.reduce((a, p) => a + probs[p], 0), base: k / N, hasPick: true, contiguous: false };
    }
    let best = null;
    for (let s = 0; s < N; s++) {
      const ps = Array.from({ length: k }, (_, j) => order[(s + j) % N]);
      const sum = ps.reduce((a, p) => a + probs[p], 0);
      const hasPick = ps.includes(pickPocket);
      if (!best || sum > best.p + 1e-12 || (Math.abs(sum - best.p) <= 1e-12 && hasPick && !best.hasPick)) best = { pockets: ps, p: sum, hasPick };
    }
    return { pockets: best.pockets, p: best.p, base: k / N, hasPick: best.hasPick, contiguous: true };
  }

  // Straight-up bets: one chip of `stake` on each of k numbers, paid 35 to 1.
  function betEconomics(k, stake, pHit) {
    const cost = k * stake, back = 36 * stake;
    return { cost, back, winProfit: back - cost, lossIfMiss: -cost, ev: pHit * back - cost };
  }

  // P(X >= h) for X ~ Binomial(m, p).
  function binomUpper(h, m, p) {
    if (h <= 0) return 1;
    const lf = (x) => lgamma(x + 1);
    let s = 0;
    for (let x = h; x <= m; x++) s += Math.exp(lf(m) - lf(x) - lf(m - x) + x * Math.log(p) + (m - x) * Math.log(1 - p));
    return Math.min(1, s);
  }

  // Walk-forward record of "bet the pick" and "bet the best k-sector". Frequency and smoothed
  // models rank pockets identically, so one record covers both.
  function pickBacktest(pockets, w, win, k, minHistory = 20, mode = 'arc') {
    const N = w.size, order = WHEEL_ORDER[w.type];
    const W = win === 'all' || !win ? Infinity : win;
    const c = new Array(N).fill(0), last = new Array(N).fill(-1);
    let lo = 0, n = 0, scored = 0, pickHits = 0, sectorHits = 0;
    for (let i = 0; i < pockets.length; i++) {
      if (i >= minHistory) {
        const max = Math.max(...c);
        if (c.some((x) => x !== max)) {
          let pk = -1;
          for (let p = 0; p < N; p++) if (c[p] === max && (pk < 0 || last[p] > last[pk])) pk = p;
          const y = pockets[i];
          scored++;
          if (y === pk) pickHits++;
          if (mode === true || mode === 'neighbours') {
            const ip = order.indexOf(pk), h = Math.floor(k / 2);
            if (Array.from({ length: k }, (_, j) => order[(ip - h + j + N) % N]).includes(y)) sectorHits++;
          } else if (mode === 'top') {
            const ranked = Array.from({ length: N }, (_, p) => p)
              .sort((a, b) => (a === pk ? -1 : b === pk ? 1 : 0) || c[b] - c[a] || last[b] - last[a] || a - b);
            if (ranked.slice(0, k).includes(y)) sectorHits++;
          } else {
          let sum = 0;
          for (let j = 0; j < k; j++) sum += c[order[j]];
          let bestS = 0, bestSum = sum, bestHas = order.slice(0, k).includes(pk);
          for (let s = 1; s < N; s++) {
            sum += c[order[(s + k - 1) % N]] - c[order[s - 1]];
            const has = Array.from({ length: k }, (_, j) => order[(s + j) % N]).includes(pk);
            if (sum > bestSum || (sum === bestSum && has && !bestHas)) { bestS = s; bestSum = sum; bestHas = has; }
          }
          if (Array.from({ length: k }, (_, j) => order[(bestS + j) % N]).includes(y)) sectorHits++;
          }
        }
      }
      c[pockets[i]]++; last[pockets[i]] = i; n++;
      if (n > W) { c[pockets[lo++]]--; n--; }
    }
    return {
      scored, k, pickHits, sectorHits,
      pickRate: scored ? pickHits / scored : NaN, sectorRate: scored ? sectorHits / scored : NaN,
      pickBase: 1 / N, sectorBase: k / N,
      pickP: binomUpper(pickHits, scored, 1 / N), sectorP: binomUpper(sectorHits, scored, k / N),
    };
  }

  // Hot = most hits in the window, cold = fewest (ties: hot → most recent, cold → longest absent).
  // pAdj is the binomial tail probability multiplied by the number of pockets (Bonferroni),
  // because looking at the extreme of 37 numbers always finds something that looks unusual.
  function hotCold(pockets, w, k = 5) {
    const n = pockets.length, N = w.size;
    const c = counts(pockets, N), g = gaps(pockets, w), e = n / N;
    const row = (p) => ({ pocket: p, count: c[p], expected: e, gap: g[p] });
    const rec = (p) => g[p] ?? Infinity;
    const hot = w.pockets.slice().sort((a, b) => c[b] - c[a] || rec(a) - rec(b) || a - b).slice(0, k)
      .map((p) => ({ ...row(p), pAdj: Math.min(1, N * binomUpper(c[p], n, 1 / N)) }));
    const cold = w.pockets.slice().sort((a, b) => c[a] - c[b] || rec(b) - rec(a) || a - b).slice(0, k)
      .map((p) => ({ ...row(p), pAdj: Math.min(1, N * (1 - binomUpper(c[p] + 1, n, 1 / N))) }));
    return { n, expected: e, hot, cold };
  }

  // Seeded generator for clearly-labelled simulated sample data.
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  return {
    DOUBLE_ZERO, EPS, MODELS, MODEL_VERSION, GROUPS,
    wheel, label, parsePocket, colorOf, isZero, activeSpins, windowed, counts,
    categoryStats, categoryProbs, streaks, gaps, chiSquare, gammaQ, wilson,
    predict, logLoss, brier, backtest, evaluate, mean, rng,
    WHEEL_ORDER, pick, bestSector, betEconomics, binomUpper, pickBacktest, hotCold,
  };
})();

if (typeof module !== 'undefined') module.exports = Core;
