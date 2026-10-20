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
  telegram: { enabled: true },
}
const TOKEN = '1234567890:AAHtestTOKENtestTOKENtestTOKEN12345'
const WA = { phoneNumberId: '1098765432109876', wabaId: '2098765432109876', token: 'EAAGtestTOKENtestTOKENtestTOKEN', appSecret: 'a'.repeat(32) }
const session = crypto.randomBytes(24).toString('hex')
const importKey = crypto.randomBytes(32).toString('hex')
const encode = (p, value) => ({ path: p, data: Buffer.from(JSON.stringify(value)).toString('base64') })
const tx = { 'x-admin-txpin': settings.adminPin }

await test('Phone login: WhatsApp code and Telegram contact, no PIN', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pizzadonia-login-'))
  const outfile = path.join(dir, 'worker.mjs')
  await build({ entryPoints: ['cloudflare/backend.js'], outfile, bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], logLevel: 'silent' })
  const tgCalls = []
  const waSent = []
  let hook = {}
  const outboundService = async (request) => {
    const url = new URL(request.url)
    if (url.hostname === 'graph.facebook.com') {
      assert.equal(request.headers.get('authorization'), 'Bearer ' + WA.token)
      if (url.pathname.endsWith('/' + WA.phoneNumberId)) return Response.json({ display_phone_number: '+60 11-1111 2222', verified_name: 'Test Pizzadonia', id: WA.phoneNumberId })
      if (url.pathname.endsWith('/subscribed_apps')) return Response.json({ success: true })
      if (url.pathname.endsWith('/messages')) { waSent.push(await request.json()); return Response.json({ messages: [{ id: 'wamid.out' }] }) }
      return Response.json({ error: { message: 'unknown', code: 100 } }, { status: 400 })
    }
    if (url.hostname !== 'api.telegram.org') return Response.json({ code: 'Ok', routes: [{ distance: 1000 }] })
    const method = url.pathname.split('/')[2]
    const body = request.headers.get('content-type')?.includes('json') ? await request.json() : {}
    tgCalls.push({ method, body })
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 555, is_bot: true, first_name: 'Pizzadonia Bot', username: 'pizzadonia_test_bot' } })
    if (method === 'setWebhook') { hook = { secret: body.secret_token }; return Response.json({ ok: true, result: true }) }
    return Response.json({ ok: true, result: { message_id: tgCalls.length } })
  }
  const main = { name: 'main', modules: true, modulesRoot: dir, scriptPath: outfile, compatibilityDate: '2026-10-16', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { SHOP: { className: 'PizzadoniaShop', useSQLite: true } }, durableObjectsPersist: path.join(dir, 'storage'),
    bindings: { IMPORT_KEY: importKey, SITE_ORIGIN: 'https://pizzadonia.pages.dev' }, outboundService }
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ workers: [main] }), resourcePersistencePath: path.join(dir, 'storage') })
  const call = async (url, { method = 'GET', body, raw, owner = false, headers = {} } = {}) => {
    const r = await mf.dispatchFetch('https://pizzadonia.pages.dev' + url, { method,
      headers: { 'CF-Connecting-IP': '198.51.100.40', ...(owner ? { 'x-admin-session': session } : {}), ...(body || raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: raw ?? (body ? JSON.stringify(body) : undefined) })
    const text = await r.text()
    let data = null
    try { data = JSON.parse(text) } catch { data = text }
    return { status: r.status, data }
  }
  let updateId = 2000
  const tgUpdate = (message) => call('/api/telegram/webhook', { method: 'POST', body: { update_id: ++updateId, message: { message_id: 1, chat: { id: message.from.id, type: 'private', first_name: 'Cust' }, ...message } },
    headers: { 'X-Telegram-Bot-Api-Secret-Token': hook.secret } })
  const lastTg = (chat) => tgCalls.filter((c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(chat)).at(-1)?.body
  let waMsg = 0
  const waPost = (from, text, { secret = WA.appSecret, id = 'wamid.in' + ++waMsg } = {}) => {
    const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: WA.wabaId, changes: [{ field: 'messages',
      value: { messaging_product: 'whatsapp', contacts: [{ wa_id: from }], messages: [{ id, from, timestamp: '1', type: 'text', text: { body: text } }] } }] }] })
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
    return call('/api/whatsapp/webhook', { method: 'POST', raw, headers: { 'X-Hub-Signature-256': sig } })
  }
  const start = async (channel) => {
    const r = await call('/api/account/phone-login', { method: 'POST', body: { channel } })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    return r.data
  }
  const poll = (id) => call(`/api/account/phone-login/${id}`)
  try {
    const snapshot = [encode('settings.json', settings), encode('admin-sessions.json', { [session]: { email: 'owner@example.com', exp: Date.now() + 86400000 } })]
    assert.equal((await call('/_migration/import', { method: 'POST', body: { files: snapshot, finalize: true }, headers: { 'x-import-key': importKey } })).status, 200)
    // an old PIN customer: keeps their account when they switch to WhatsApp login
    const old = await call('/api/account/register', { method: 'POST', body: { name: 'Pelanggan Lama', phone: '0123456789', pin: '445566' } })
    assert.equal(old.status, 200)

    // nothing connected: no phone login, and asking for one fails cleanly
    assert.deepEqual((await call('/api/shop')).data.login, { wa: false, tg: false })
    assert.equal((await call('/api/account/phone-login', { method: 'POST', body: { channel: 'wa' } })).status, 400)

    // ---- Telegram
    assert.equal((await call('/api/admin/telegram/bot', { method: 'POST', owner: true, body: { token: TOKEN }, headers: tx })).status, 200)
    assert.deepEqual((await call('/api/shop')).data.login, { wa: false, tg: true })
    let p = await start('tg')
    assert.match(p.code, /^\d{6}$/)
    assert.equal(p.web, `https://t.me/pizzadonia_test_bot?start=L${p.code}`)
    assert.equal((await poll(p.id)).data.state, 'waiting')
    await tgUpdate({ text: `/start L${p.code}`, from: { id: 900 } })
    assert.ok(lastTg(900).reply_markup.keyboard[0][0].request_contact)
    // someone else's contact card proves nothing
    await tgUpdate({ contact: { phone_number: '60177777777', user_id: 901 }, from: { id: 900 } })
    assert.match(lastTg(900).text, /nombor anda sendiri/)
    assert.equal((await poll(p.id)).data.state, 'waiting')
    await tgUpdate({ contact: { phone_number: '+60 17-777 7777', user_id: 900 }, from: { id: 900 } })
    assert.match(lastTg(900).text, /017777777/)
    let r = await poll(p.id)
    assert.equal(r.data.state, 'needName')
    assert.equal(r.data.phone, '60177777777')
    assert.equal((await call(`/api/account/phone-login/${p.id}/name`, { method: 'POST', body: { name: 'A' } })).status, 400)
    r = await call(`/api/account/phone-login/${p.id}/name`, { method: 'POST', body: { name: 'Pelanggan Telegram' } })
    assert.equal(r.status, 200)
    assert.ok(r.data.token)
    assert.equal(r.data.name, 'Pelanggan Telegram')
    assert.equal(r.data.owner, false)
    assert.equal(r.data.hasPin, false)
    assert.equal((await poll(p.id)).status, 410) // used once
    // the second time, the same Telegram account skips the contact step
    p = await start('tg')
    await tgUpdate({ text: `/start L${p.code}`, from: { id: 900 } })
    r = await poll(p.id)
    assert.equal(r.data.phone, '60177777777')
    assert.equal(r.data.name, 'Pelanggan Telegram')
    // an unknown code
    await tgUpdate({ text: '/start L000000', from: { id: 902 } })
    assert.match(lastTg(902).text, /tamat/)

    // ---- WhatsApp: keys checked with Meta, behind the transaction PIN, secrets never sent back
    assert.equal((await call('/api/admin/whatsapp', { method: 'POST', owner: true, body: WA })).status, 428)
    r = await call('/api/admin/whatsapp', { method: 'POST', owner: true, body: WA, headers: tx })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.number, '601111112222')
    assert.equal(r.data.subscribed, true)
    const st = (await call('/api/admin/whatsapp', { owner: true })).data
    assert.equal(st.webhookUrl, 'https://pizzadonia.pages.dev/api/whatsapp/webhook')
    const view = JSON.stringify((await call('/api/admin/settings', { owner: true })).data)
    assert.ok(!view.includes(WA.token) && !view.includes(WA.appSecret) && !view.includes(st.verifyToken))
    assert.deepEqual((await call('/api/shop')).data.login, { wa: true, tg: true })

    // Meta's one-time address check
    r = await call(`/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${st.verifyToken}&hub.challenge=12345`)
    assert.equal(r.status, 200)
    assert.equal(r.data, 12345)
    assert.equal((await call('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')).status, 403)

    // a new number: code sent from their WhatsApp -> name -> signed in
    p = await start('wa')
    assert.equal(p.web, `https://wa.me/601111112222?text=${encodeURIComponent(`Kod log masuk Test Pizzadonia: ${p.code}`)}`)
    assert.equal((await waPost('60198765432', `Kod log masuk Test Pizzadonia: ${p.code}`, { secret: 'b'.repeat(32) })).status, 401) // not from Meta
    assert.equal((await poll(p.id)).data.state, 'waiting')
    const sentBefore = waSent.length
    const dup = { id: 'wamid.same' }
    await waPost('60198765432', `Kod log masuk Test Pizzadonia: ${p.code}`, dup)
    await waPost('60198765432', `Kod log masuk Test Pizzadonia: ${p.code}`, dup) // Meta re-delivery: handled once
    assert.equal(waSent.length, sentBefore + 1)
    assert.equal(waSent.at(-1).to, '60198765432')
    assert.match(waSent.at(-1).text.body, /019876543.*disahkan/s)
    r = await poll(p.id)
    assert.equal(r.data.state, 'needName')
    r = await call(`/api/account/phone-login/${p.id}/name`, { method: 'POST', body: { name: 'Pelanggan WhatsApp' } })
    assert.equal(r.data.phone, '60198765432')
    assert.ok(r.data.token)
    assert.equal((await call('/api/account', { headers: { authorization: 'Bearer ' + r.data.token } })).data.name, 'Pelanggan WhatsApp')

    // the old PIN customer: straight back into their own account, no name step
    p = await start('wa')
    await waPost('60123456789', p.code)
    r = await poll(p.id)
    assert.equal(r.data.name, 'Pelanggan Lama')
    assert.equal(r.data.hasPin, true) // wallet PIN untouched

    // a wrong / old code gets a reply, and nothing signs in
    p = await start('wa')
    await waPost('60123456789', 'Kod log masuk: 999999')
    assert.match(waSent.at(-1).text.body, /tamat atau tidak sah/)
    assert.equal((await poll(p.id)).data.state, 'waiting')
    // a code sent from another number signs the page into THAT number (the sender's WhatsApp is the proof)
    await waPost('60135555555', p.code)
    assert.equal((await poll(p.id)).data.phone, '60135555555')

    // a blocked customer can't sign in this way either
    assert.equal((await call('/api/admin/customers/60123456789', { method: 'POST', owner: true, body: { action: 'block' } })).status, 200)
    p = await start('wa')
    await waPost('60123456789', p.code)
    assert.equal((await poll(p.id)).status, 403)

    // the dashboard sees that messages arrive; turning it off brings the PIN login back
    assert.ok((await call('/api/admin/whatsapp', { owner: true })).data.lastInboundAt > 0)
    assert.equal((await call('/api/admin/whatsapp', { method: 'DELETE', owner: true, headers: tx })).status, 200)
    assert.deepEqual((await call('/api/shop')).data.login, { wa: false, tg: true })
    assert.equal((await waPost('60123456789', '123456')).status, 401)
  } finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }) }
})
