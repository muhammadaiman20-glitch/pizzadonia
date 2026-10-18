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
- The support assistant answers from shop data with built-in rules. Workers AI (`AI` binding) also answers free-form questions. In Shop & fees → Support chat AI, the owner turns it on or off, picks a model from `workers-ai.js` (default SEA-LION, best for Malay), and can try it with a sample question. The model gets text only and no tools. If AI fails, the built-in replies still answer.
- Telegram alerts use the shop's own bot. In Seller → Shop & fees → Telegram, paste the @BotFather token (transaction PIN required). The backend checks it, registers the webhook `/api/telegram/webhook` with a secret header, and sets the bot commands. **Open Telegram & connect** deep-links to `t.me/<bot>?start=<one-time code>` (10 min). When the owner taps Start, the webhook links that chat and the card turns Connected by itself. The card shows the shop → bot → chat link, webhook health and last delivery. The header chip shows the same status. Owner commands: `/start`, `/status`, `/check`, `/reset`, `/stop`. Alerts go through a persistent outbox with retry alarms (at-least-once). Permanent failures, such as a blocked bot, are recorded and skipped. Use a bot made only for Pizzadonia: a bot that another program reads with polling cannot also use the webhook.
- Telegram AI helper (`ops-assistant.js`). The linked owner can message the bot in plain words. A Workers AI model with tool use answers: GLM 5.3 Flash by default, or pick another in Shop & fees → Telegram AI helper. It reads orders, menu, sales, customers, promos, support chats and a health check. Changes come as a plan with ✅ Sahkan / ❌ Batal buttons: order status, menu add/edit/delete, promos, open/close, delivery fees, customer block/rename and support replies. The plan text is built by code from the exact change, and nothing runs until the owner taps Sahkan. Plans expire after 10 minutes. The helper works only through the seller API, using a 5-minute owner session that is revoked after each turn. It never has the transaction PIN, so payments, wallets, refunds, bank details, PINs, admin emails and the bot token stay dashboard-only. Each turn runs after the shop lock is released, so orders keep flowing while the model works. A Telegram update that arrives twice runs once. `/check` runs the health check without AI, and `/reset` clears the helper's memory. Webhooks registered before this feature are re-registered automatically to deliver button taps (same address and secret).

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

## Automatic data sync

Visible, online pages refresh shared shop, customer, order, wallet and staff data every five seconds. Focus, reconnect and successful API changes trigger an immediate refresh. Support chat polls every five seconds while open, or twenty seconds while closed. Hidden/offline pages pause polling and refresh when resumed. Temporary network errors retain the last data and customer session. Use the same customer account on each device to see that account’s records. Shopping carts remain device-local; local source folders and PC data files are not synchronized by this feature. Unsaved seller setting forms are not overwritten in the background; reopen the settings screen to load another device’s changes into its editor.
