// Phone-size end-to-end smoke test of dist/index.html (local-storage mode).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const page_ = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const shot = new URL('../dist/shots/', import.meta.url).pathname;
mkdirSync(shot, { recursive: true });
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>${page_}</body></html>`;
writeFileSync('/tmp/rda-test.html', wrapped);
const errors = [];
const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${scheme}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${scheme} console: ${m.text()}`); });
  await page.goto('file:///tmp/rda-test.html');
  await page.waitForSelector('text=Start with a casino');
  if (scheme === 'light') {
    // create casino
    await page.click('text=Add casino');
    await page.fill('#f-cname', 'Marina Bay Sands');
    await page.fill('#f-cloc', 'Singapore');
    await page.click('form button.primary');
    await page.waitForSelector('text=No dealers yet');
    await page.click('text=Add dealer');
    await page.fill('#f-dname', 'Alice');
    await page.fill('#f-dtable', '12');
    await page.click('form button.primary');
    await page.waitForSelector('.keypad');
    for (const p of ['17', '0', '32', '17']) { await page.click(`.key[data-p="${p}"]`); await page.waitForTimeout(750); }
    // duplicate tap guard
    await page.click('.key[data-p="5"]'); await page.click('.key[data-p="5"]');
    const strip = await page.$$eval('#strip .pk', (els) => els.map((e) => e.textContent));
    console.log('strip', strip.join(' '));
    if (strip.join(' ') !== '5 17 32 0 17') throw new Error('strip mismatch');
    // undo a wrong entry, then enter the right one
    await page.click('.key[data-p="8"]');
    await page.click('#undo-last');
    await page.waitForSelector('text=Removed 8');
    const undone = await page.$$eval('#strip .pk', (els) => els.map((e) => e.textContent).join(' '));
    console.log('after undo', undone);
    if (undone !== '5 17 32 0 17') throw new Error('undo mismatch');
    await page.click('.key[data-p="8"]');
    await page.click('#undo-last');
    await page.waitForTimeout(750);
    // bulk paste
    await page.click('text=Paste past results');
    await page.fill('#f-btext', Array.from({ length: 120 }, (_, i) => (i * 7) % 37).join(' ') + ' 40');
    const prev = await page.textContent('#bulk-preview');
    console.log('preview:', prev.trim());
    await page.fill('#f-btext', Array.from({ length: 120 }, (_, i) => (i * 7) % 37).join(' '));
    await page.click('#bulk-go');
    await page.waitForSelector('text=Recorded 120 past results');
    await page.screenshot({ path: shot + 'record.png', fullPage: false });
    await page.click('.tab[data-tab="history"]');
    await page.waitForSelector('text=125 spins match');
    await page.click('#main .list .item');
    await page.selectOption('#f-spocket', '9');
    await page.click('text=Save correction');
    await page.waitForSelector('text=Spin corrected');
    await page.screenshot({ path: shot + 'history.png' });
    await page.click('.tab[data-tab="stats"]');
    await page.waitForSelector('text=Pocket counts');
    await page.screenshot({ path: shot + 'stats.png', fullPage: true });
    await page.click('.tab[data-tab="predict"]');
    await page.waitForSelector('text=Backtest');
    await page.click('text=Save this estimate');
    await page.click('.tab[data-tab="record"]');
    await page.click('.key[data-p="22"]');
    await page.click('.tab[data-tab="predict"]');
    await page.waitForSelector('text=Next spin');
    await page.locator('.pick-card').screenshot({ path: shot + 'pick-light.png' });
    await page.screenshot({ path: shot + 'predict.png', fullPage: true });
    // persistence across reload
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector('text=Saved estimates');
    console.log('reload ok, header:', (await page.textContent('.top .sub')).trim());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log('horizontal overflow:', overflow);
  } else {
    await page.click('text=Load simulated sample');
    await page.waitForSelector('text=Marina Bay Sands (sample)');
    await page.screenshot({ path: shot + 'home-dark.png' });
    await page.click('text=Marina Bay Sands (sample)');
    await page.click('.item:has-text("Dealer A")');
    console.log('record hc line:', (await page.textContent('#hc-line')).replace(/\s+/g, ' ').trim());
    await page.click('.tab[data-tab="stats"]');
    await page.waitForSelector('text=Hot and cold');
    await page.locator('section:has(h2:text("Hot and cold"))').screenshot({ path: shot + 'hotcold-dark.png' });
    await page.screenshot({ path: shot + 'stats-dark.png', fullPage: true });
    await page.click('.tab[data-tab="predict"]');
    await page.waitForSelector('text=Suggested bet');
    await page.locator('.pick-card').screenshot({ path: shot + 'pick-dark.png' });
    await page.click('.chip[data-act="model"][data-v="weighted"]');
    await page.click('.chip[data-act="halflife"][data-v="25"]');
    await page.waitForSelector('text=Weight on recent spins');
    console.log('model row:', (await page.textContent('table.tbl tbody tr:has-text("Model")')).replace(/\s+/g, ' ').trim());
    console.log('backtest rows:', (await page.$$eval('section:has(h2:text("Backtest")) tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')))).join(' | '));
    await page.locator('section.card:has(.chip[data-act="halflife"])').screenshot({ path: shot + 'weighted-controls-dark.png' });
    await page.click('.chip[data-v="t3"]');
    await page.fill('#stake', '25'); await page.press('#stake', 'Tab');
    await page.waitForSelector('text=Top 3 numbers by estimate');
    console.log('money rows:', (await page.$$eval('.tbl.money tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')))).join(' | '));
    await page.locator('.pick-card').screenshot({ path: shot + 'pick-top3-dark.png' });
    await page.click('text=Save this estimate');
    await page.click('.tab[data-tab="record"]');
    await page.click('.key[data-p="14"]');
    await page.click('.tab[data-tab="predict"]');
    await page.waitForSelector('text=Saved picks hit');
    await page.screenshot({ path: shot + 'predict-dark.png', fullPage: true });
    await page.click('.tab[data-tab="strategy"]');
    await page.waitForSelector('text=Placement strategies');
    await page.click('.chip[data-act="bankroll"][data-v="100"]');
    console.log('strategy rows:', (await page.$$eval('section:has(h2:text("Profit factor")) tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')))).join(' | '));
    await page.screenshot({ path: shot + 'strategies-dark.png', fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log('dark horizontal overflow:', overflow);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
