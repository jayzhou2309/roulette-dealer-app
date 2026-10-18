// Serves dist/pwa and checks installability basics: manifest, service worker, offline launch, persistence.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const root = new URL('../dist/pwa/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = createServer((q, s) => {
  let f = join(root, decodeURIComponent(q.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  if (!existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f));
}).listen(8765);
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:8765/');
const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
console.log('manifest:', manifest.name, '|', manifest.display, '|', manifest.icons.length, 'icons');
for (const i of manifest.icons) { const ok = await page.evaluate(async (src) => (await fetch(src)).ok, i.src); if (!ok) throw new Error('missing icon ' + i.src); }
await page.evaluate(() => navigator.serviceWorker.ready);
console.log('service worker ready:', await page.evaluate(() => !!navigator.serviceWorker.controller || 'registered (controls after reload)'));
await page.waitForSelector('text=Start with a casino');
console.log('notice on home:', await page.locator('.notice.caution').count());
await page.click('text=Add casino');
await page.fill('#f-cname', 'Resorts World Sentosa');
await page.click('form button.primary');
await page.click('text=Add dealer');
await page.fill('#f-dname', 'Ben');
await page.click('form button.primary');
await page.click('.key[data-p="7"]');
await page.waitForTimeout(400);
await page.reload();
await page.waitForSelector('.keypad');
console.log('after reload controlled:', await page.evaluate(() => !!navigator.serviceWorker.controller));
// go offline and relaunch
srv.close();
await ctx.setOffline(true);
await page.goto('http://localhost:8765/');
await page.waitForSelector('.top h1');
console.log('offline launch title:', await page.textContent('.top h1'), '| strip:', await page.textContent('#strip'));
await page.click('.key[data-p="12"]');
console.log('offline record works:', (await page.textContent('#strip')).trim());
await browser.close();
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
