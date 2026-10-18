import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const settings = {
  shopName: 'Test Pizzadonia', open: true,
  shop: { lat: 5.3, lng: 103.1, label: 'Test kitchen' },
  adminPin: '876543', adminEmails: ['owner@example.com'], googleClientId: '123-test.apps.googleusercontent.com',
  telegram: { enabled: true }, aiChat: { baseUrl: 'http://127.0.0.1:20128/v1', apiKey: 'old-key', model: 'gemini/x' },
}
const TOKEN = '1234567890:AAHtestTOKENtestTOKENtestTOKEN12345'
const session = crypto.randomBytes(24).toString('hex')
const importKey = crypto.randomBytes(32).toString('hex')
const encode = (p, value) => ({ path: p, data: Buffer.from(JSON.stringify(value)).toString('base64') })
const tx = { 'x-admin-txpin': settings.adminPin }

await test('Telegram bot: token, /start link, alerts, status, unlink', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pizzadonia-tg-'))
  const outfile = path.join(dir, 'worker.mjs')
  await build({ entryPoints: ['cloudflare/backend.js'], outfile, bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], logLevel: 'silent' })
  // fake Bot API: records every call, answers like Telegram
  const calls = []
  let hook = { url: '', secret: '' }
  const outboundService = async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'api.telegram.org') return Response.json({ code: 'Ok', routes: [{ distance: 1000 }] })
    const [, bot, method] = url.pathname.split('/')
    const body = request.headers.get('content-type')?.includes('json') ? await request.json() : {}
    calls.push({ method, body })
    if (bot !== 'bot' + TOKEN) return Response.json({ ok: false, error_code: 401, description: 'Unauthorized' }, { status: 401 })
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 555, is_bot: true, first_name: 'Pizzadonia Bot', username: 'pizzadonia_test_bot' } })
    if (method === 'setWebhook') { hook = { url: body.url, secret: body.secret_token }; return Response.json({ ok: true, result: true }) }
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: { url: hook.url, pending_update_count: 0 } })
    if (method === 'sendMessage') return Response.json({ ok: true, result: { message_id: calls.length } })
    return Response.json({ ok: true, result: true })
  }
  const options = { modules: true, modulesRoot: dir, scriptPath: outfile, compatibilityDate: '2026-10-16', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { SHOP: { className: 'PizzadoniaShop', useSQLite: true } }, durableObjectsPersist: path.join(dir, 'storage'),
    bindings: { IMPORT_KEY: importKey, SITE_ORIGIN: 'https://pizzadonia.pages.dev' }, outboundService }
  const mf = new Miniflare({ ...convertV4MiniflareOptions(options), resourcePersistencePath: path.join(dir, 'storage') })
  const call = async (url, { method = 'GET', body, owner = true, headers = {} } = {}) => {
    const r = await mf.dispatchFetch('https://pizzadonia.pages.dev' + url, { method,
      headers: { 'CF-Connecting-IP': '198.51.100.20', ...(owner ? { 'x-admin-session': session } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, data: await r.json().catch(() => null) }
  }
  const update = (message, secret = hook.secret) => call('/api/telegram/webhook', { method: 'POST', owner: false, body: message, headers: { 'X-Telegram-Bot-Api-Secret-Token': secret } })
  const fromChat = (id, text) => ({ update_id: Date.now(), message: { message_id: 1, text, chat: { id, type: 'private', first_name: 'Aiman', last_name: 'Test', username: 'aiman' } } })
  const lastTo = (chat) => calls.filter((c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(chat)).at(-1)?.body
  try {
    const snapshot = [encode('settings.json', settings), encode('admin-sessions.json', { [session]: { email: 'owner@example.com', exp: Date.now() + 86400000 } })]
    assert.equal((await call('/_migration/import', { method: 'POST', owner: false, body: { files: snapshot, finalize: true }, headers: { 'x-import-key': importKey } })).status, 200)

    // an old 9Router-style AI setting becomes Workers AI with the default model, no key left behind
    let r = await call('/api/admin/settings')
    assert.deepEqual(r.data.aiChat, { enabled: true, model: '@cf/aisingapore/gemma-sea-lion-v4-27b-it' })
    assert.equal((await call('/api/admin/settings', { method: 'PUT', body: { aiChat: { enabled: true, model: '@cf/evil/model' } } })).data.aiChat.model, '@cf/aisingapore/gemma-sea-lion-v4-27b-it')
    assert.equal((await call('/api/admin/ai-test', { method: 'POST', body: {} })).status, 503) // no AI binding in this test runtime

    r = await call('/api/admin/telegram')
    assert.equal(r.data.mode, 'off'); assert.equal(r.data.connected, false)
    assert.equal((await call('/api/admin/telegram', { owner: false })).status, 401)

    // token: needs the transaction PIN, must look like a token, must be accepted by Telegram
    assert.equal((await call('/api/admin/telegram/bot', { method: 'POST', body: { token: TOKEN } })).status, 428)
    assert.equal((await call('/api/admin/telegram/bot', { method: 'POST', body: { token: 'hello' }, headers: tx })).status, 400)
    assert.equal((await call('/api/admin/telegram/bot', { method: 'POST', body: { token: '1234567890:AAHwrongwrongwrongwrongwrongwrong1' }, headers: tx })).status, 400)
    r = await call('/api/admin/telegram/bot', { method: 'POST', body: { token: TOKEN }, headers: tx })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.bot.username, 'pizzadonia_test_bot')
    assert.equal(hook.url, 'https://pizzadonia.pages.dev/api/telegram/webhook')
    assert.ok(hook.secret.length >= 24)
    assert.ok(calls.some((c) => c.method === 'setMyCommands'))

    // secrets never reach the browser
    const view = JSON.stringify((await call('/api/admin/settings')).data)
    assert.ok(!view.includes(TOKEN) && !view.includes(hook.secret))
    assert.equal((await call('/api/admin/settings')).data.telegram.hasToken, true)

    r = await call('/api/admin/telegram')
    assert.equal(r.data.mode, 'own'); assert.equal(r.data.connected, false)
    assert.equal((await call('/api/admin/telegram-test', { method: 'POST', body: {} })).status, 400)

    // connect button -> one-time /start code
    r = await call('/api/admin/telegram/link', { method: 'POST', body: {} })
    const code = new URL(r.data.web).searchParams.get('start')
    assert.match(r.data.web, /^https:\/\/t\.me\/pizzadonia_test_bot\?start=/)
    assert.equal(r.data.app, `tg://resolve?domain=pizzadonia_test_bot&start=${code}`)
    assert.ok((await call('/api/admin/telegram')).data.waiting)

    assert.equal((await update(fromChat(777, `/start ${code}`), 'wrong-secret')).status, 401)
    assert.equal((await update(fromChat(42, '/start not-the-code'))).status, 200)
    assert.match(lastTo(42).text, /tamat/)
    assert.equal((await call('/api/admin/telegram')).data.connected, false)

    assert.equal((await update(fromChat(777, `/start ${code}`))).status, 200)
    assert.match(lastTo(777).text, /Bersambung/)
    assert.ok(lastTo(777).reply_markup.inline_keyboard.flat().some((b) => b.web_app?.url === 'https://pizzadonia.pages.dev'))
    r = await call('/api/admin/telegram?live=1')
    assert.equal(r.data.connected, true); assert.equal(r.data.chat.name, 'Aiman Test'); assert.equal(r.data.waiting, null)
    assert.equal(r.data.webhook.ok, true)

    // the code works once only
    await update(fromChat(999, `/start ${code}`))
    assert.equal((await call('/api/admin/telegram')).data.chat.name, 'Aiman Test')

    // owner commands + strangers
    await update(fromChat(777, '/status'))
    assert.match(lastTo(777).text, /Hari ini: 0 pesanan/)
    await update(fromChat(31337, 'hai'))
    assert.match(lastTo(31337).text, /pemilik kedai/)

    // alerts go through the outbox to the linked chat
    r = await call('/api/admin/telegram-test', { method: 'POST', body: {} })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    for (let i = 0; i < 50 && !lastTo(777)?.text.includes('berfungsi'); i++) await new Promise((ok) => setTimeout(ok, 100))
    assert.match(lastTo(777).text, /berfungsi/)
    for (let i = 0; i < 20 && !(await call('/api/admin/telegram')).data.delivery.ok; i++) await new Promise((ok) => setTimeout(ok, 100))
    r = await call('/api/admin/telegram')
    assert.equal(r.data.delivery.ok, true); assert.equal(r.data.delivery.queued, 0)

    // saving the settings form keeps the bot + chat
    const s = (await call('/api/admin/settings')).data
    r = await call('/api/admin/settings', { method: 'PUT', body: { telegram: { ...s.telegram, orders: false } } })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    r = await call('/api/admin/telegram')
    assert.equal(r.data.connected, true); assert.equal(r.data.mode, 'own')

    // owner blocks the bot -> shown on the card
    await update({ update_id: 9, my_chat_member: { chat: { id: 777, type: 'private' }, new_chat_member: { status: 'kicked' } } })
    assert.ok((await call('/api/admin/telegram')).data.blockedAt)

    assert.equal((await call('/api/admin/telegram/unlink', { method: 'POST', body: {} })).status, 200)
    assert.equal((await call('/api/admin/telegram')).data.connected, false)
    assert.equal((await call('/api/admin/telegram/bot', { method: 'DELETE', headers: tx })).status, 200)
    assert.equal((await call('/api/admin/telegram')).data.mode, 'off')
    assert.ok(calls.some((c) => c.method === 'deleteWebhook'))
    assert.equal((await update(fromChat(777, '/status'))).status, 401)
  } finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }) }
})
