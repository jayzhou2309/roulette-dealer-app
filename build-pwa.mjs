// Builds the installable home-screen app (PWA) into dist/pwa/.
// Usage: PW=<path to playwright> node build-pwa.mjs   (Playwright renders the PNG icons)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const r = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const out = new URL('./dist/pwa/', import.meta.url).pathname;
mkdirSync(out + 'icons', { recursive: true });

const NAME = 'Roulette Dealer Analytics';
const SHORT = 'Dealer Stats';
const BG = '#151f1c';

// ---- page ----
const body = r('./src/app.html')
  .replace('/*STYLES*/', () => r('./src/styles.css'))
  .replace('/*CORE*/', () => r('./src/core.js'))
  .replace('/*APP*/', () => r('./src/app.js'))
  .replace(/<title>.*?<\/title>\n/, '')
  .replace(/<meta name="(claude:viewport-fit-sides|theme-color)"[^>]*>\n/g, '');
const version = createHash('sha256').update(body).digest('hex').slice(0, 10);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${NAME}</title>
<meta name="description" content="Record roulette spins per dealer, review statistics and test estimates against the fair-wheel baseline.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${SHORT}">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#fbfcfb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${BG}" media="(prefers-color-scheme: dark)">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
<script>
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
</body>
</html>
`;
writeFileSync(out + 'index.html', html);

// ---- manifest ----
writeFileSync(out + 'manifest.webmanifest', JSON.stringify({
  name: NAME,
  short_name: SHORT,
  description: 'Casino CRM for roulette dealers: spin history, statistics, hot and cold numbers, and estimates tested against the fair-wheel baseline.',
  id: './',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: BG,
  theme_color: BG,
  categories: ['utilities', 'productivity'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

// ---- service worker: app shell cached for offline use, fonts cached as they load ----
writeFileSync(out + 'sw.js', `const CACHE = 'rda-${version}';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    // network first so updates arrive, cached shell when offline
    e.respondWith(fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put('index.html', res.clone())); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  if (url.origin === location.origin || /fonts\\.(googleapis|gstatic)\\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    })));
  }
});
`);

// ---- icons ----
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
function iconSvg(scale) {
  // scale = wheel radius as a share of half the icon; maskable icons keep it inside the 80% safe zone
  const R = 256 * scale, rim = R * 1.06, inner = R * 0.64, hub = R * 0.2, step = (2 * Math.PI) / 37;
  const pt = (rad, a) => `${(256 + rad * Math.sin(a)).toFixed(2)} ${(256 - rad * Math.cos(a)).toFixed(2)}`;
  const segs = ORDER.map((p, i) => {
    const a0 = i * step - step / 2, a1 = a0 + step;
    const fill = p === 0 ? '#189160' : RED.has(p) ? '#d23b3e' : '#0a0c0d';
    return `<path d="M${pt(inner, a0)} L${pt(R, a0)} A${R} ${R} 0 0 1 ${pt(R, a1)} L${pt(inner, a1)} A${inner} ${inner} 0 0 0 ${pt(inner, a0)}Z" fill="${fill}"/>`;
  }).join('');
  const spokes = [0, 1, 2, 3].map((i) => `<line x1="256" y1="256" x2="${256 + inner * 0.82 * Math.sin(i * Math.PI / 2 + Math.PI / 4)}" y2="${256 - inner * 0.82 * Math.cos(i * Math.PI / 2 + Math.PI / 4)}" stroke="#d2ad62" stroke-width="${R * 0.05}" stroke-linecap="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="${BG}"/>
    <circle cx="256" cy="256" r="${rim}" fill="#d2ad62"/>${segs}
    <circle cx="256" cy="256" r="${inner}" fill="#1d2925"/>${spokes}
    <circle cx="256" cy="256" r="${hub}" fill="#d2ad62"/>
    <circle cx="${256 + R * 0.84 * Math.sin(step * 8)}" cy="${256 - R * 0.84 * Math.cos(step * 8)}" r="${R * 0.07}" fill="#fffaf0"/></svg>`;
}
const { chromium } = require(process.env.PW || 'playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
async function png(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: out + 'icons/' + file, clip: { x: 0, y: 0, width: size, height: size } });
}
await png(iconSvg(0.78), 512, 'icon-512.png');
await png(iconSvg(0.78), 192, 'icon-192.png');
await png(iconSvg(0.62), 512, 'icon-maskable-512.png');
await png(iconSvg(0.7), 180, 'apple-touch-icon.png');
await browser.close();
console.log(`dist/pwa built · version ${version} · ${(html.length / 1024).toFixed(1)} KB`);
