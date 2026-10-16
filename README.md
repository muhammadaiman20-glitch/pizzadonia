# Pizzadonia

Malay-language pizza ordering app. React/Vite provides the storefront. Cloudflare Pages serves the site; a private Cloudflare Worker runs the business API and a SQLite-backed Durable Object persists the shop’s records and uploads. **No PC, BAT file or tunnel is required for the deployed site.**

Storefront: https://pizzadonia.pages.dev  
Seller: https://pizzadonia.pages.dev/#/admin

## Architecture

- Pages `dist/_worker.js` forwards `/api/*` through the `BACKEND` service binding to `pizzadonia-backend`.
- `PizzadoniaShop` is the single coordinator for this shop’s order IDs, wallet debits, promo limits and business records. Multiple shops must use separate objects.
- SQLite storage contains the existing JSON records and private uploads. Files use 256 KiB chunks, avoiding the per-row size limit. This compatibility storage is suitable for this small shop; larger deployments should normalize records and move media to R2.
- Each command stages changes and commits them atomically. Unexpected failures discard staged changes. Commands are serialized so two concurrent wallet orders cannot overdraw a balance.
- Seller login uses verified Google ID tokens and an owner-email allowlist. The existing transaction PIN still protects money actions. Public PIN-only seller login is disabled.
- Customer accounts, kitchen/rider PINs, receipts, bank-in documents, wallet transactions, support chats and the ledger retain their existing API contracts.
- The support assistant uses Workers AI when no HTTPS AI provider is configured. If AI is unavailable, the existing built-in replies remain available.
- Optional Telegram notifications require cloud secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_HOME_CHANNEL`. A local Hermes `.env` is not readable from Cloudflare. Notifications use a persistent outbox and retry alarms; delivery is at-least-once, so an interrupted send can produce a duplicate alert. The old Telegram auto-delete feature is not supported by this cloud adapter.

## Build and verify

Use Node 22.12 or newer.

```sh
npm ci
npm run prepare:cloud
npm run test:cloud
npm run build
npm run build:backend
```

`server.js` remains the optional local server and the source of shared business rules. `scripts/prepare-cloud.mjs` generates `cloudflare/runtime/app.js`, replacing the local HTTP, persistence and private-network admin adapters. Review that generator when the server layout changes.

The cloud test suite runs the actual Workers runtime and checks ordering, customer login, file uploads, permissions, wallet concurrency, and persistence/rate limits across worker restarts. It uses isolated synthetic data and never creates production orders.

## Deploy

Authenticate Wrangler to the intended Cloudflare account. Deploy the backend before Pages:

```sh
npm run deploy:backend
npm run deploy:pages
```

Configure the Pages project's production and preview service binding:

```text
BACKEND -> pizzadonia-backend (production)
```

Remove the obsolete `BACKEND_URL` and `BACKEND_PROXY_SECRET` variables. Keep `workers_dev` and preview URLs disabled on the private backend. Pages uses Direct Upload; automatic GitHub builds are not configured. Pushing code alone does not publish it.

Google OAuth must allow `https://pizzadonia.pages.dev` as an authorized JavaScript origin. Only addresses listed in the private shop settings may access the seller dashboard. Never remove the owner Google configuration without preparing another recovery path.

## Initial data migration and recovery

The backend returns 503 until a private snapshot is finalized. A temporary `IMPORT_KEY` secret protects `POST /_migration/import`. Its JSON body contains `files: [{path, data}]`, with relative file paths and base64 content; `finalize: true` validates owner sign-in settings and closes the import permanently. Later imports receive 409. Remove the import secret after migration and keep the backend private.

Private files, PINs, customer records, sessions and tokens must never be committed. Owner-authenticated `GET /api/admin/cloud-backup` exports a complete private snapshot; keep that export secure. SQLite point-in-time recovery is also available through Cloudflare. Keep the original PC data backup until migration has been verified.

Health: `GET /api/health` reports cloud storage readiness and `pcRequired: false`.

## Optional local use

`Start Pizzadonia.bat` and `npm start` only start a separate local instance. Its `data/` folder does not synchronize with the cloud shop. Do not run the old public PC tunnel as another ordering endpoint after migration.
