# Roulette Dealer Analytics

Mobile app for recording roulette spins per casino and dealer, reviewing statistics (including hot and cold numbers) and testing estimates against the fair-wheel baseline. Specs are in `specs/`.

## Builds

| Build | Command | Output | Where records are saved |
|---|---|---|---|
| claude.ai artifact | `node build.mjs` | `dist/index.html` | your claude.ai account (private) |
| Home-screen app (PWA) | `PW=$(npm root -g)/playwright node build-pwa.mjs` | `dist/pwa/` | on the phone, works offline |

The two builds keep separate records. Move them with **Menu → Export backup** in one and **Restore or merge a backup** in the other.

## Hosting the home-screen app

Upload the contents of `dist/pwa/` to any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages). It must be served over HTTPS for install and offline use.

## Adding it to the home screen

- **iPhone (Safari):** open the app's address → Share → **Add to Home Screen** → Add.
- **Android (Chrome):** open the address → ⋮ menu → **Install app** (or **Add to Home screen**).

It then opens full-screen from its own icon and works without a connection.

## Tests

```
node --test test/*.test.js                          # statistics engine
PW=$(npm root -g)/playwright node test/smoke.mjs    # phone-size UI flow, light + dark
PW=$(npm root -g)/playwright node test/pwa.mjs      # manifest, service worker, offline launch
```
