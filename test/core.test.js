const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const EU = C.wheel('EU'), US = C.wheel('US');
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test('wheels and labels', () => {
  assert.equal(EU.size, 37);
  assert.equal(US.size, 38);
  assert.equal(C.label(37), '00');
  assert.equal(C.parsePocket('00', EU), null);
  assert.equal(C.parsePocket('00', US), 37);
  assert.equal(C.parsePocket('37', US), null);
  assert.equal(C.parsePocket('x', EU), null);
  assert.equal(C.parsePocket(' 7 ', EU), 7);
});

test('colour and category maps cover the layout', () => {
  assert.equal(EU.pockets.filter((p) => C.colorOf(p) === 'red').length, 18);
  assert.equal(EU.pockets.filter((p) => C.colorOf(p) === 'black').length, 18);
  assert.equal(C.colorOf(0), 'green');
  const cats = C.categoryStats([], US);
  const color = cats.find((g) => g.key === 'color');
  close(color.items.find((i) => i.k === 'green').expected, 2 / 38);
  for (const g of C.categoryStats([], EU)) {
    const total = g.items.reduce((a, i) => a + i.expected, 0);
    // groups that exclude zero sum to 36/37
    assert.ok(Math.abs(total - 1) < 1e-9 || Math.abs(total - 36 / 37) < 1e-9, g.key);
  }
  const col = C.categoryStats([1, 4, 2, 3, 36], EU).find((g) => g.key === 'column');
  assert.deepEqual(col.items.map((i) => i.count), [2, 1, 2]);
});

test('streaks and gaps', () => {
  const s = C.streaks([1, 3, 5, 2, 0, 4, 6, 8]); // red red red black zero black black black
  assert.equal(s.color.longest, 'red');
  assert.equal(s.color.longestLen, 3);
  assert.equal(s.color.current, 'black');
  assert.equal(s.color.currentLen, 3);
  const g = C.gaps([5, 7, 5, 9], EU);
  assert.equal(g[9], 0);
  assert.equal(g[5], 1);
  assert.equal(g[7], 2);
  assert.equal(g[1], null);
});

test('chi-square p-values match known values', () => {
  // Q(18, 18) for df=36, stat=36 ≈ 0.4693
  close(C.gammaQ(18, 18), 0.46866, 1e-3);
  // df=1, stat=3.841 → p ≈ 0.05
  close(C.gammaQ(0.5, 3.841 / 2), 0.05, 1e-3);
  const r = C.chiSquare(new Array(37).fill(10));
  close(r.stat, 0);
  close(r.p, 1, 1e-9);
  assert.equal(r.valid, true);
});

test('wilson interval', () => {
  const [lo, hi] = C.wilson(50, 100);
  close(lo, 0.4038, 1e-3);
  close(hi, 0.5962, 1e-3);
  assert.deepEqual(C.wilson(0, 0), [0, 1]);
});

test('models produce distributions', () => {
  const hist = [1, 1, 1, 2, 3];
  for (const m of ['baseline', 'frequency', 'smoothed']) {
    const p = C.predict(m, hist, EU, { alpha: 5 });
    assert.equal(p.length, 37);
    close(p.reduce((a, b) => a + b, 0), 1);
  }
  close(C.predict('frequency', hist, EU)[1], 0.6);
  close(C.predict('smoothed', hist, EU, { alpha: 5 })[1], 8 / 190);
  // large alpha → baseline
  close(C.predict('smoothed', hist, EU, { alpha: 1e9 })[1], 1 / 37, 1e-6);
});

test('backtest uses no look-ahead and matches direct computation', () => {
  const r = C.rng(7);
  const pockets = Array.from({ length: 300 }, () => Math.floor(r() * 37));
  const bt = C.backtest(pockets, EU, 100, { alpha: 5 }, 20);
  assert.equal(bt.scored, 280);
  // recompute smoothed + frequency by brute force
  let ll = 0, bs = 0, llf = 0;
  for (let i = 20; i < pockets.length; i++) {
    const hist = pockets.slice(Math.max(0, i - 100), i);
    const p = C.predict('smoothed', hist, EU, { alpha: 5 });
    ll += C.logLoss(p[pockets[i]]);
    bs += C.brier(p, pockets[i]);
    llf += C.logLoss(C.predict('frequency', hist, EU)[pockets[i]]);
  }
  close(bt.models.smoothed.logLoss, ll / 280, 1e-9);
  close(bt.models.smoothed.brier, bs / 280, 1e-9);
  close(bt.models.frequency.logLoss, llf / 280, 1e-9);
  close(bt.models.baseline.logLoss, Math.log(37), 1e-12);
  // fair wheel → nothing should beat baseline
  assert.equal(bt.models.smoothed.beats, false);
  assert.equal(bt.models.frequency.beats, false);
});

test('backtest detects a genuinely biased wheel', () => {
  const r = C.rng(3);
  const pockets = Array.from({ length: 3000 }, () => (r() < 0.25 ? 17 : Math.floor(r() * 37)));
  const bt = C.backtest(pockets, EU, 'all', { alpha: 5 });
  assert.equal(bt.models.smoothed.beats, true);
});

test('evaluation picks the first later spin recorded after the prediction', () => {
  const probs = new Array(37).fill(1 / 37);
  probs[5] = 0.1; probs[6] = 1 / 37 - (0.1 - 1 / 37);
  const pred = { cutoff: 1000, createdAt: 5000, probs };
  const spins = [
    { id: 'a', pocket: 1, t: 900, rt: 900 },
    { id: 'leak', pocket: 9, t: 1500, rt: 4000 }, // recorded before prediction → excluded
    { id: 'old', pocket: 2, t: 950, rt: 6000 }, // before cutoff → excluded
    { id: 'gone', pocket: 3, t: 1100, rt: 6000, del: 7000 },
    { id: 'b', pocket: 5, t: 1200, rt: 6000 },
  ];
  const e = C.evaluate(pred, spins);
  assert.equal(e.spinId, 'b');
  close(e.p, 0.1);
  close(e.logLoss, -Math.log(0.1));
  assert.equal(e.rank, 1);
  assert.equal(C.evaluate(pred, spins.slice(0, 4)), null);
});

test('category probabilities from a pocket distribution', () => {
  const cp = C.categoryProbs(C.predict('baseline', [], EU), EU);
  close(cp.find((g) => g.key === 'color').items[0].p, 18 / 37);
});

test('wheel orders are permutations of each layout', () => {
  for (const w of [EU, US]) {
    const o = C.WHEEL_ORDER[w.type];
    assert.equal(o.length, w.size);
    assert.deepEqual(o.slice().sort((a, b) => a - b), w.pockets);
  }
});

test('pick takes the top pocket and breaks ties by recency', () => {
  const hist = [4, 9, 4, 9, 2];
  const pr = C.predict('frequency', hist, EU);
  assert.deepEqual(C.pick(pr, hist, EU), { pocket: 9, p: 0.4, tied: 2 });
  assert.equal(C.pick(C.predict('baseline', [], EU), [], EU), null);
});

test('best sector is the contiguous wheel arc with the most mass', () => {
  const pr = new Array(37).fill(0.5 / 35);
  pr[17] = 0.25; pr[25] = 0.25; // neighbours on the EU wheel: ... 2, 25, 17, 34, 6 ...
  const s = C.bestSector(pr, EU, 5, 17);
  assert.ok(s.pockets.includes(17) && s.pockets.includes(25));
  close(s.base, 5 / 37);
  const o = C.WHEEL_ORDER.EU;
  const i = o.indexOf(s.pockets[0]);
  assert.deepEqual(s.pockets, [0, 1, 2, 3, 4].map((j) => o[(i + j) % 37]));
});

test('pick backtest matches a brute-force replay', () => {
  const r = C.rng(11);
  const pockets = Array.from({ length: 400 }, () => Math.floor(r() * 37));
  for (const win of [100, 'all']) {
    const bt = C.pickBacktest(pockets, EU, win, 7);
    let scored = 0, ph = 0, sh = 0;
    for (let i = 20; i < pockets.length; i++) {
      const hist = C.windowed(pockets.slice(0, i), win);
      const pr = C.predict('frequency', hist, EU);
      const pk = C.pick(pr, hist, EU);
      if (!pk) continue;
      scored++;
      if (pockets[i] === pk.pocket) ph++;
      if (C.bestSector(pr, EU, 7, pk.pocket).pockets.includes(pockets[i])) sh++;
    }
    assert.equal(bt.scored, scored);
    assert.equal(bt.pickHits, ph);
    assert.equal(bt.sectorHits, sh);
  }
});

test('neighbours sector is centred on the pick and its backtest matches a replay', () => {
  const s = C.bestSector(new Array(37).fill(1 / 37), EU, 5, 17, true);
  assert.deepEqual(s.pockets, [2, 25, 17, 34, 6]);
  assert.deepEqual(C.bestSector(new Array(37).fill(1 / 37), EU, 5, 0, true).pockets, [3, 26, 0, 32, 15]);
  const r = C.rng(5);
  const pockets = Array.from({ length: 300 }, () => Math.floor(r() * 37));
  const bt = C.pickBacktest(pockets, EU, 100, 5, 20, true);
  let sh = 0;
  for (let i = 20; i < pockets.length; i++) {
    const hist = C.windowed(pockets.slice(0, i), 100);
    const pr = C.predict('frequency', hist, EU);
    const pk = C.pick(pr, hist, EU);
    if (pk && C.bestSector(pr, EU, 5, pk.pocket, true).pockets.includes(pockets[i])) sh++;
  }
  assert.equal(bt.sectorHits, sh);
});

test('binomial upper tail', () => {
  close(C.binomUpper(0, 10, 0.3), 1);
  close(C.binomUpper(10, 10, 0.5), 1 / 1024, 1e-12);
  close(C.binomUpper(1, 1, 0.2), 0.2, 1e-12);
});

test('evaluation reports pick and sector hits', () => {
  const pred = { cutoff: 0, createdAt: 0, probs: new Array(37).fill(1 / 37), pick: 5, sector: [10, 5, 24] };
  const e = C.evaluate(pred, [{ id: 'x', pocket: 24, t: 1, rt: 1 }]);
  assert.equal(e.pickHit, false);
  assert.equal(e.sectorHit, true);
});

test('top-k bet ranks by estimate with the pick first, and its backtest matches a replay', () => {
  const hist = [4, 4, 9, 9, 2, 7, 7];
  const pr = C.predict('frequency', hist, EU);
  const pk = C.pick(pr, hist, EU);
  const s = C.bestSector(pr, EU, 3, pk.pocket, 'top', C.gaps(hist, EU));
  assert.deepEqual(s.pockets, [7, 9, 4]);
  const r = C.rng(9);
  const pockets = Array.from({ length: 300 }, () => Math.floor(r() * 37));
  const bt = C.pickBacktest(pockets, EU, 100, 5, 20, 'top');
  let sh = 0;
  for (let i = 20; i < pockets.length; i++) {
    const h = C.windowed(pockets.slice(0, i), 100);
    const p2 = C.predict('frequency', h, EU);
    const k = C.pick(p2, h, EU);
    if (k && C.bestSector(p2, EU, 5, k.pocket, 'top', C.gaps(h, EU)).pockets.includes(pockets[i])) sh++;
  }
  assert.equal(bt.sectorHits, sh);
});

test('bet economics for straight-up chips', () => {
  const one = C.betEconomics(1, 10, 1 / 37);
  assert.equal(one.cost, 10);
  assert.equal(one.back, 360);
  assert.equal(one.winProfit, 350);
  close(one.ev, -10 / 37);
  const five = C.betEconomics(5, 10, 5 / 37);
  assert.equal(five.winProfit, 310);
  close(five.ev, -50 / 37);
  close(C.betEconomics(1, 10, 1 / 38).ev, 360 / 38 - 10);
});

test('hot and cold numbers', () => {
  const hist = [7, 7, 7, 3, 3, 9, 1, 2, 9];
  const hc = C.hotCold(hist, EU, 3);
  assert.deepEqual(hc.hot.map((h) => h.pocket), [7, 9, 3]); // 9 and 3 tie at 2; 9 is more recent
  assert.equal(hc.hot[0].count, 3);
  assert.equal(hc.cold[0].count, 0);
  assert.equal(hc.cold[0].gap, null);
  // fair sample: nothing should be flagged after the multiple-comparison adjustment
  const r = C.rng(21);
  const fair = Array.from({ length: 1000 }, () => Math.floor(r() * 37));
  const f = C.hotCold(fair, EU);
  assert.ok(f.hot.every((h) => h.pAdj > 0.05) && f.cold.every((h) => h.pAdj > 0.05));
  // a genuinely favoured pocket is flagged
  const biased = fair.map((p, i) => (i % 9 === 0 ? 17 : p));
  assert.ok(C.hotCold(biased, EU).hot[0].pocket === 17 && C.hotCold(biased, EU).hot[0].pAdj < 0.01);
});

test('recency-weighted model favours recent hits', () => {
  // 5 hit four times long ago, 9 hit three times recently
  const hist = [5, 5, 5, 5, ...Array.from({ length: 54 }, (_, i) => 10 + (i % 27)), 9, 9, 9];
  assert.equal(C.pick(C.predict('frequency', hist, EU), hist, EU).pocket, 5);
  const pw = C.predict('weighted', hist, EU, { alpha: 5, halfLife: 10 });
  close(pw.reduce((a, b) => a + b, 0), 1);
  assert.equal(C.pick(pw, hist, EU).pocket, 9);
  // a very long half-life approaches the smoothed model
  const ps = C.predict('smoothed', hist, EU, { alpha: 5 });
  const pl = C.predict('weighted', hist, EU, { alpha: 5, halfLife: 1e9 });
  ps.forEach((x, i) => close(x, pl[i], 1e-6));
  const wc = C.weightedCounts([1, 2], 37, 1);
  close(wc.c[2], 1); close(wc.c[1], 0.5); close(wc.nEff, 2.25 / 1.25);
});

test('weighted backtest and pick record match a brute-force replay', () => {
  const r = C.rng(17);
  const pockets = Array.from({ length: 260 }, () => Math.floor(r() * 37));
  for (const win of [100, 'all']) {
    const bt = C.backtest(pockets, EU, win, { alpha: 3, halfLife: 30 });
    let ll = 0, bs = 0, m = 0, ph = 0, sh = 0, scored = 0;
    for (let i = 20; i < pockets.length; i++) {
      const h = C.windowed(pockets.slice(0, i), win);
      const p = C.predict('weighted', h, EU, { alpha: 3, halfLife: 30 });
      ll += C.logLoss(p[pockets[i]]); bs += C.brier(p, pockets[i]); m++;
      const pk = C.pick(p, h, EU);
      if (!pk) continue;
      scored++;
      if (pk.pocket === pockets[i]) ph++;
      if (C.bestSector(p, EU, 5, pk.pocket, 'neighbours').pockets.includes(pockets[i])) sh++;
    }
    close(bt.models.weighted.logLoss, ll / m, 1e-9);
    close(bt.models.weighted.brier, bs / m, 1e-9);
    const pb = C.pickBacktest(pockets, EU, win, 5, 20, 'neighbours', 30);
    assert.equal(pb.scored, scored);
    assert.equal(pb.pickHits, ph);
    assert.equal(pb.sectorHits, sh);
  }
});

test('betPlacement covers exactly the numbers with the fewest inside bets', () => {
  const cover = (place) => place.flatMap((b) => b.pockets).sort((a, b) => a - b);
  const p1 = C.betPlacement([17, 20, 18, 21], EU);
  assert.deepEqual(p1.map((b) => b.kind), ['corner']);
  assert.equal(p1[0].stakes, 4);
  assert.equal(p1[0].pays, 8);
  assert.deepEqual(C.betPlacement([1, 2, 3, 4, 5, 6], EU).map((b) => b.kind), ['six line']);
  assert.deepEqual(C.betPlacement([0, 1, 2], EU).map((b) => b.kind), ['trio']);
  assert.deepEqual(C.betPlacement([0, 37], US).map((b) => b.kind), ['split']);
  // scattered numbers stay straight up
  assert.deepEqual(C.betPlacement([0, 32, 15, 19, 4], EU).map((b) => b.kind), Array(5).fill('straight'));
  // every neighbours / arc sector is covered exactly once, cost unchanged
  for (const w of [EU, US]) {
    const order = C.WHEEL_ORDER[w.type];
    for (const k of [5, 7, 9, 12]) for (let s = 0; s < order.length; s++) {
      const nums = Array.from({ length: k }, (_, j) => order[(s + j) % order.length]);
      const place = C.betPlacement(nums, w);
      assert.deepEqual(cover(place), nums.slice().sort((a, b) => a - b));
      assert.equal(place.reduce((a, b) => a + b.stakes, 0), k);
      for (const b of place) assert.equal((b.pays + 1) * b.stakes, 36);
    }
  }
});

test('strategy replay: progressions and profit factor', () => {
  const ps = [1, 2, 3, 4, 5, 0, 7, 9, 12, 14]; // red: 1 3 5 7 9 12 14
  const flat = C.simulateStrategy(ps, 'flat', { target: 'red' });
  assert.equal(flat.net, 4);
  assert.equal(flat.wins, 7);
  close(flat.pf, 7 / 3);
  const paroli = C.simulateStrategy(ps, 'paroli', { target: 'red' });
  assert.deepEqual(paroli.path, [100, 101, 99, 100, 98, 99, 97, 98, 100, 104, 105]);
  const mart = C.simulateStrategy([2, 4, 6, 1], 'martingale', { target: 'red' });
  assert.deepEqual(mart.path, [100, 99, 97, 93, 101]);
  // table limit resets the progression to one unit
  const capped = C.simulateStrategy([2, 4, 6, 1], 'martingale', { target: 'red', tableMax: 3 });
  assert.equal(capped.capHits, 1);
  assert.equal(capped.largest, 2);
  // dozens pay 2 to 1
  assert.equal(C.simulateStrategy([13, 1], 'flat', { target: 'd2' }).net, 1);
  // James Bond: 19-36 +8, 13-18 +10, zero +16, else -20; stops when 20 units aren't left
  assert.deepEqual(C.simulateStrategy([20, 15, 0, 5], 'jamesbond').path, [100, 108, 118, 134, 114]);
  const bust = C.simulateStrategy([1, 1, 1, 1, 1, 1], 'jamesbond', { bankroll: 50 });
  assert.equal(bust.bustAt, 2);
  assert.ok(Number.isNaN(C.simulateStrategy([], 'flat').pf));
  assert.equal(C.simulateStrategy([1], 'flat').pf, Infinity);
  // fair-wheel flat even-money bet: profit factor near 18/19
  const b = C.strategyBenchmark(2000, EU, 'flat', { target: 'red', bankroll: 1e6 }, 100);
  assert.ok(Math.abs(b.pfMedian - 18 / 19) < 0.03, String(b.pfMedian));
});
