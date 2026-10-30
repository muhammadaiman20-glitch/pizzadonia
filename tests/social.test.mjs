import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { socialEvents, wantsOwner } from '../social.js'

const settings = { shopName: 'Test Pizzadonia', open: true, shop: { lat: 5.3, lng: 103.1, label: 'Dapur' }, delivery: { baseFee: 3, baseKm: 3, perKm: 1, maxKm: 15, freeAbove: 0 },
  adminPin: '876543', adminEmails: ['owner@example.com'], googleClientId: '123-test.apps.googleusercontent.com', siteUrl: 'https://pizzadonia.pages.dev' }
const menu = [{ id: 'ayam', name: 'Peperoni Ayam', desc: 'Ayam', price: 21.9, cost: 7.77, available: true }]
const TOKEN = 'EAAtestPageTokenTestPageTokenTest123'
const SECRET = 'a'.repeat(32)
const WA_SECRET = 'c'.repeat(32)
settings.waLogin = { phoneNumberId: 'W1', wabaId: 'B1', token: 'EAAwhatsappTokenWhatsappTokenTest123', appSecret: WA_SECRET, verifyToken: 'wa-verify', number: '60123456789', name: 'Pizzadonia' }
const tx = { 'x-admin-txpin': settings.adminPin }

test('socialEvents: messages and echoes from both platforms; other webhooks skipped', () => {
  const body = (object) => ({ object, entry: [{ id: 'P1', messaging: [
    { sender: { id: 'U1' }, recipient: { id: 'P1' }, timestamp: 5, message: { mid: 'm1', text: 'hai' } },
    { sender: { id: 'P1' }, recipient: { id: 'U1' }, timestamp: 6, message: { mid: 'm2', text: 'balas', is_echo: true } },
    { sender: { id: 'U1' }, recipient: { id: 'P1' }, delivery: { mids: ['m2'] } },
    { sender: { id: 'U1' }, recipient: { id: 'P1' }, message: { mid: 'm3', is_deleted: true } },
    { sender: { id: 'U1' }, recipient: { id: 'P1' }, message: { mid: 'm4', attachments: [{ type: 'image' }] } },
  ] }] })
  const fb = socialEvents(body('page'))
  assert.deepEqual(fb.map((e) => [e.platform, e.mid, e.echo, e.userId]), [['facebook', 'm1', false, 'U1'], ['facebook', 'm2', true, 'U1'], ['facebook', 'm4', false, 'U1']])
  assert.equal(fb[2].hasMedia, true)
  assert.equal(socialEvents(body('instagram'))[0].platform, 'instagram')
  assert.deepEqual(socialEvents(body('whatsapp_business_account')), [])
})

test('wantsOwner: complaints, money and safety questions go to a person', () => {
  for (const t of ['Pizza saya sejuk', 'nak refund', 'ada alahan udang?', 'halal ke?', 'saya nak cakap dengan penjual']) assert.equal(wantsOwner(t), true, t)
  assert.equal(wantsOwner('Ada pizza apa?'), false)
})

const FAKE_AI = `import { WorkerEntrypoint } from 'cloudflare:workers'
export class FakeAI extends WorkerEntrypoint {
  async run(model, input) {
    const all = input.messages.map((m) => m.content).join(' ')
    if (all.includes('7.77')) return { response: 'BOCOR' }
    const last = input.messages.at(-1).content
    if (last.includes('tiadajawapan')) return { response: '[HANDOFF]' }
    if (last.includes('rosakai')) throw new Error('rosak')
    if (last.includes('hargapalsu')) return { response: 'Cuma RM2 sahaja.' }
    return { response: 'Peperoni Ayam RM21.90. Pesan di laman kami.' }
  }
}
export default { fetch: () => new Response('ok') }
`

test('social API: signature, drafts, approval, handoff, auto mode, 24 hours', async () => {
  const session = crypto.randomBytes(24).toString('hex')
  const importKey = crypto.randomBytes(32).toString('hex')
  const encode = (p, value) => ({ path: p, data: Buffer.from(JSON.stringify(value)).toString('base64') })
  const dir = await mkdtemp(path.join(tmpdir(), 'pizzadonia-so-'))
  const outfile = path.join(dir, 'worker.mjs')
  await build({ entryPoints: ['cloudflare/backend.js'], outfile, bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], logLevel: 'silent' })
  await writeFile(path.join(dir, 'ai.mjs'), FAKE_AI)
  const sent = []
  let sendFail = null
  const outboundService = async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'graph.facebook.com') return Response.json({ ok: true, result: true })
    if (url.pathname.endsWith('/me')) return Response.json({ id: 'P1', name: 'Pizzadonia Page', instagram_business_account: { id: 'IG1', username: 'pizzadonia' } })
    if (url.pathname.endsWith('/subscribed_apps')) return Response.json({ success: true })
    if (url.pathname.endsWith('/messages')) {
      if (sendFail) return Response.json({ error: { message: 'Token tamat', code: sendFail } }, { status: 400 })
      const body = await request.json()
      if (url.pathname.includes('/W1/')) {
        sent.push({ pathname: url.pathname, recipient: { id: body.to }, message: { text: body.text.body } })
        return Response.json({ messages: [{ id: 'wamid-' + sent.length }] })
      }
      sent.push({ pathname: url.pathname, ...body })
      return Response.json({ recipient_id: body.recipient.id, message_id: 'sent-' + sent.length })
    }
    return Response.json({})
  }
  const main = { name: 'main', modules: true, modulesRoot: dir, scriptPath: outfile, compatibilityDate: '2026-10-16', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { SHOP: { className: 'PizzadoniaShop', useSQLite: true } }, durableObjectsPersist: path.join(dir, 'storage'),
    bindings: { IMPORT_KEY: importKey, SITE_ORIGIN: 'https://pizzadonia.pages.dev' }, serviceBindings: { AI: { name: 'ai', entrypoint: 'FakeAI' } }, outboundService }
  const ai = { name: 'ai', modules: true, modulesRoot: dir, scriptPath: path.join(dir, 'ai.mjs'), compatibilityDate: '2026-10-16' }
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ workers: [main, ai] }), resourcePersistencePath: path.join(dir, 'storage') })
  const raw = async (url, init = {}) => {
    const send = () => mf.dispatchFetch('https://pizzadonia.pages.dev' + url, init)
    // local workerd may close the socket after an early 4xx (same as tests/cloud.test.mjs); resend once
    const r = await send().catch((e) => { if (e.cause?.code === 'ECONNRESET') return send(); throw e })
    return { status: r.status, text: await r.text() }
  }
  const call = async (url, { method = 'GET', body, owner = true, headers = {} } = {}) => {
    const r = await raw(url, { method, headers: { 'CF-Connecting-IP': '198.51.100.32', ...(owner ? { 'x-admin-session': session } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined })
    let data = null
    try { data = JSON.parse(r.text) } catch { /* plain text */ }
    return { status: r.status, data, text: r.text }
  }
  let mid = 0
  const hook = (text, { object = 'page', user = 'U1', owner = 'P1', secret = SECRET, id } = {}) => {
    const json = JSON.stringify({ object, entry: [{ id: owner, messaging: [{ sender: { id: user }, recipient: { id: owner }, timestamp: Date.now(), message: { mid: id || 'in-' + ++mid, text } }] }] })
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(json).digest('hex')
    return raw('/api/social/webhook', { method: 'POST', headers: { 'X-Hub-Signature-256': sig, 'CF-Connecting-IP': '198.51.100.33' }, body: json })
  }
  const hookWa = (text, from = '60111111111', id) => {
    const json = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: id || 'wa-' + ++mid, from, type: 'text', text: { body: text } }] } }] }] })
    return raw('/api/whatsapp/webhook', { method: 'POST', headers: { 'X-Hub-Signature-256': 'sha256=' + crypto.createHmac('sha256', WA_SECRET).update(json).digest('hex'), 'CF-Connecting-IP': '198.51.100.34' }, body: json })
  }
  const social = async () => (await call('/api/admin/social')).data
  const chat = async (id = 'fb-U1') => (await social()).chats.find((c) => c.id === id)
  // background AI work finishes shortly after the webhook returns
  const until = async (check, what) => {
    for (let i = 0; i < 60; i++) {
      const v = await check()
      if (v) return v
      await new Promise((r) => setTimeout(r, 100))
    }
    assert.fail('timed out waiting for ' + what)
  }
  const act = (id, action, extra = {}) => call(`/api/admin/social/${id}`, { method: 'POST', body: { action, ...extra } })
  try {
    assert.equal((await call('/_migration/import', { method: 'POST', owner: false, headers: { 'x-import-key': importKey }, body: { finalize: true, files: [encode('settings.json', settings), encode('menu.json', menu),
      encode('social.json', { chats: [{ id: 'fb-OLD', platform: 'facebook', userId: 'OLD', messages: [{ from: 'customer', text: 'hai', at: Date.now() - 25 * 3600000 }], status: 'open', draft: null, paused: false, unread: 0, lastCustomerAt: Date.now() - 25 * 3600000, updatedAt: Date.now() - 25 * 3600000 }], seen: [], usage: { day: '', count: 0 }, lastInboundAt: 0, waMonth: { month: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7), count: 997, warned: false } }),
      encode('admin-sessions.json', { [session]: { email: 'owner@example.com', exp: Date.now() + 86400000 } })] } })).status, 200)

    // not connected: nothing gets in, and strangers can't read or connect
    assert.equal((await hook('hai')).status, 401)
    assert.equal((await call('/api/admin/social', { owner: false })).status, 401)
    assert.equal((await call('/api/admin/social/connect', { method: 'POST', body: { token: TOKEN, appSecret: SECRET } })).status, 428) // transaction PIN needed
    const con = await call('/api/admin/social/connect', { method: 'POST', body: { token: TOKEN, appSecret: SECRET }, headers: tx })
    assert.equal(con.status, 200)
    assert.deepEqual([con.data.pageName, con.data.igName, con.data.subscribed], ['Pizzadonia Page', 'pizzadonia', true])

    // secrets never leave the server
    const info = await social()
    const settingsText = (await call('/api/admin/settings')).text
    for (const secret of [TOKEN, SECRET]) { assert.ok(!settingsText.includes(secret)); assert.ok(!JSON.stringify(info).includes(secret)) }

    // Meta's webhook check
    const verify = `/api/social/webhook?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=`
    assert.equal((await raw(verify + 'salah')).status, 403)
    assert.equal((await raw(verify + encodeURIComponent(info.verifyToken))).text, 'abc')

    // a forged message is refused, and the internal routes are hidden from outsiders
    assert.equal((await hook('hai', { secret: 'b'.repeat(32) })).status, 401)
    assert.equal((await call('/api/social/internal/fb-U1')).status, 404)
    assert.equal((await call('/api/social/internal/fb-U1', { headers: { 'x-internal-key': 'teka' } })).status, 404)

    // approval mode: AI writes a draft, nothing is sent; no supplier cost reached the AI
    assert.equal((await hook('Ada pizza apa?', { id: 'dup-1' })).status, 200)
    const drafted = await until(async () => { const c = await chat(); return c?.draft && c }, 'draft')
    assert.match(drafted.draft.text, /^Peperoni Ayam RM21.90/)
    assert.deepEqual(drafted.draft.warnings, [])
    assert.equal(sent.length, 0)

    // Meta re-sending the same message changes nothing
    await hook('Ada pizza apa?', { id: 'dup-1' })
    assert.equal((await chat()).messages.length, 1)

    // the owner approves it
    assert.equal((await act('fb-U1', 'send', { text: drafted.draft.text })).status, 200)
    assert.equal(sent.length, 1)
    assert.deepEqual([sent[0].pathname.split('/').at(-2), sent[0].recipient.id, sent[0].messaging_type], ['P1', 'U1', 'RESPONSE'])
    assert.equal((await chat()).draft, null)

    // made-up price: stays a draft, and can't be sent until acknowledged
    await hook('hargapalsu')
    const risky = await until(async () => { const c = await chat(); return c?.draft && c }, 'risky draft')
    assert.equal(risky.draft.warnings.length, 1)
    assert.equal((await act('fb-U1', 'send', { text: risky.draft.text })).status, 409)
    assert.equal(sent.length, 1)
    await act('fb-U1', 'send', { text: 'Tuna ada hari ini.' })
    assert.equal(sent.length, 2)

    // complaints skip the AI and go to the owner
    await hook('Pizza saya sejuk, nak refund', { user: 'U2' })
    const angry = await chat('fb-U2')
    assert.equal(angry.status, 'needs_owner')
    assert.equal(angry.draft, null)
    assert.equal(sent.length, 2)

    // the AI not knowing, or failing, also goes to the owner
    await hook('tiadajawapan', { user: 'U3' })
    await until(async () => (await chat('fb-U3'))?.status === 'needs_owner', 'AI handoff')
    await hook('rosakai', { user: 'U4' })
    await until(async () => (await chat('fb-U4'))?.status === 'needs_owner', 'AI failure handoff')

    // Instagram uses its own chat, through the same Page endpoint
    await hook('Ada menu?', { object: 'instagram', owner: 'IG1', user: 'G1' })
    await until(async () => (await chat('ig-G1'))?.draft, 'Instagram draft')
    // messages for another Page are ignored
    await hook('hai', { owner: 'P9', user: 'U9' })
    assert.equal(await chat('fb-U9'), undefined)

    // WhatsApp off: the number stays login-only, and nothing reaches the inbox
    const WA = '60111111111'
    assert.equal((await social()).whatsapp.on, false)
    await hookWa('Ada pizza apa?', WA)
    assert.match(sent.at(-1).message.text, /kod log masuk sahaja/)
    assert.equal(await chat('wa-' + WA), undefined)

    // turning it on needs the PIN; then questions become drafts, and login codes stay out of the inbox
    assert.equal((await call('/api/admin/social/whatsapp', { method: 'PUT', body: { on: true } })).status, 428)
    assert.equal((await call('/api/admin/social/whatsapp', { method: 'PUT', body: { on: true }, headers: tx })).data.on, true)
    await hookWa('Kod log masuk: 123456', WA)
    assert.match(sent.at(-1).message.text, /Kod ini sudah tamat/)
    assert.equal(await chat('wa-' + WA), undefined)
    const countBefore = sent.length
    await hookWa('Ada pizza apa?', WA, 'wa-dup')
    await hookWa('Ada pizza apa?', WA, 'wa-dup') // Meta re-sending changes nothing
    const waDraft = await until(async () => { const c = await chat('wa-' + WA); return c?.draft && c }, 'WhatsApp draft')
    assert.equal(waDraft.messages.length, 1)
    assert.equal(sent.length, countBefore)
    assert.equal((await act('wa-' + WA, 'send', { text: waDraft.draft.text })).status, 200)
    assert.deepEqual([sent.at(-1).pathname.split('/').at(-2), sent.at(-1).recipient.id], ['W1', WA])
    assert.equal((await social()).whatsapp.used, 1000) // 997 seeded + 2 login replies + this reply

    // auto mode needs the PIN; then clean replies go out by themselves and say they are automated
    assert.equal((await call('/api/admin/social/mode', { method: 'PUT', body: { mode: 'auto' } })).status, 428)
    assert.equal((await call('/api/admin/social/mode', { method: 'PUT', body: { mode: 'auto' }, headers: tx })).data.mode, 'auto')
    await hook('Ada pizza apa?', { user: 'A1' })
    await until(() => sent.find((s) => s.recipient.id === 'A1'), 'auto reply')
    const autoMsg = sent.find((s) => s.recipient.id === 'A1').message.text
    assert.match(autoMsg, /pembantu automatik Test Pizzadonia/)
    await until(async () => (await chat('fb-A1'))?.messages.length === 2, 'auto reply saved')
    await hook('Yang mana sedap?', { user: 'A1' })
    await until(() => sent.filter((s) => s.recipient.id === 'A1').length === 2, 'second auto reply')
    assert.doesNotMatch(sent.filter((s) => s.recipient.id === 'A1')[1].message.text, /pembantu automatik/) // said once only

    // auto mode: a made-up price is held back for the owner
    await hook('hargapalsu', { user: 'A2' })
    await until(async () => (await chat('fb-A2'))?.draft, 'held draft')
    assert.equal(sent.filter((s) => s.recipient.id === 'A2').length, 0)

    // auto mode: a complaint tells the customer once that a person will answer
    await hook('nak refund', { user: 'A3' })
    await hook('refund cepat', { user: 'A3' })
    assert.equal(sent.filter((s) => s.recipient.id === 'A3').length, 1)
    assert.match(sent.find((s) => s.recipient.id === 'A3').message.text, /Penjual akan membalas/)

    // auto mode: once the free WhatsApp messages are used up, replies wait as drafts instead of costing money
    const waSent = sent.length
    await hookWa('Ada pizza apa?', '60122222222')
    await until(async () => (await chat('wa-60122222222'))?.draft, 'held WhatsApp draft')
    assert.equal(sent.length, waSent)

    // a reply typed in Meta's own inbox pauses the AI for that chat
    const echo = JSON.stringify({ object: 'page', entry: [{ id: 'P1', messaging: [{ sender: { id: 'P1' }, recipient: { id: 'A1' }, timestamp: Date.now(), message: { mid: 'manual-1', text: 'Saya penjual', is_echo: true } }] }] })
    await raw('/api/social/webhook', { method: 'POST', headers: { 'X-Hub-Signature-256': 'sha256=' + crypto.createHmac('sha256', SECRET).update(echo).digest('hex'), 'CF-Connecting-IP': '198.51.100.33' }, body: echo })
    assert.equal((await chat('fb-A1')).paused, true)
    const before = sent.length
    await hook('Terima kasih', { user: 'A1' })
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(sent.length, before)
    assert.equal((await act('fb-A1', 'resume')).data.chat.paused, false)

    // a failed send is reported and keeps nothing as sent
    sendFail = 190
    assert.equal((await act('fb-A1', 'send', { text: 'Tuna ada.' })).status, 502)
    sendFail = null
    const msgCount = (await chat('fb-A1')).messages.length

    // Meta's 24-hour rule: older chats can't be answered from here
    assert.equal((await chat('fb-OLD')).canReply, false)
    assert.equal((await act('fb-OLD', 'send', { text: 'Tuna ada.' })).status, 409)
    assert.equal((await act('fb-OLD', 'redraft')).status, 409)
    assert.equal(sent.some((s) => s.recipient.id === 'OLD'), false)

    // close and delete
    assert.equal((await act('fb-A1', 'close')).data.chat.status, 'closed')
    assert.equal((await act('fb-A1', 'delete')).data.deleted, true)
    assert.equal(await chat('fb-A1'), undefined)
    assert.ok(msgCount > 0)
  } finally {
    await mf.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
