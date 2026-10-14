# Pizzadonia

Malay-language pizza ordering application. React 19, Vite 8, Tailwind CSS 4 and Leaflet power the storefront; Express handles business operations on the owner's PC.

## Deployment

Production storefront: https://pizzadonia.pages.dev

Cloudflare Pages serves `dist/`; `cloudflare/worker.js` proxies `/api/*` to the existing backend. Node.js 22.12+ is required. Build with `npm ci && npm run build`.

The current Pages project uses Direct Upload. Git-triggered builds are not configured because Cloudflare reported an issue with the account's Git installation. Install Wrangler, authenticate to Cloudflare and use `npm run deploy` for subsequent deployments.

Configure these runtime environment variables in Cloudflare Pages for production and preview:

| Variable | Purpose |
| --- | --- |
| BACKEND_URL | HTTPS origin of the running PC server's tunnel |
| BACKEND_PROXY_SECRET | Secret matching proxySecret in the PC's private data/settings.json |

The PC must run `npm start` and its tunnel must remain online. Pages does not execute `server.js` or store its JSON database. Keep the original `data/` folder on the PC and back it up privately. For a fresh checkout, copy that folder locally before starting the server, otherwise default settings are generated.

In the PC's admin settings, set `siteUrl` to the Pages address. Add the Pages origin to the existing Google OAuth client's authorized JavaScript origins before using Google sign-in. PIN-based admin access retains the private-device restriction; public admin access requires the configured owner Google account.

## Offline behavior

When the tunnel is unavailable, customers can view a public menu snapshot and browse a cart. The site labels ordering and sign-in as unavailable; checkout is disabled. API mutations fail with HTTP 503 and do not create simulated orders. The snapshot is not a live inventory feed. When the backend responds again, a page refresh loads the live shop.

## Features found in the supplied project

- Pizza sizes, availability and cart.
- Delivery map, road-distance fees, COD and bank-transfer orders.
- Customer PIN / Google accounts, order tracking and receipt uploads.
- Seller dashboard, kitchen and rider queues.
- Wallet, cashback, welcome offers, promos and ledger.
- Support chat and optional Telegram notifications.

## Local development

```
npm ci
npm run build
npm start
```

Backend and built UI run on http://127.0.0.1:5400. Run `npm run dev` separately for Vite on port 5401. `PUBLIC=0` disables automatic tunnel startup.

## Data and secrets

PINs, active sessions, customer records, receipts, wallet records, bank-in proofs, local project metadata and the old Netlify proxy configuration are excluded. Only a public menu snapshot and product photographs are published. Configure secrets on Cloudflare, never in frontend source or VITE_* variables.

This deployment preparation is not a comprehensive security audit. The original backend's file-based persistence, rate limiting and business logic remain in place.
