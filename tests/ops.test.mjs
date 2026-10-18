import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
const session = crypto.randomBytes(24).toString('hex')
const importKey = crypto.randomBytes(32).toString('hex')
const encode = (p, value) => ({ path: p, data: Buffer.from(JSON.stringify(value)).toString('base64') })
const tx = { 'x-admin-txpin': settings.adminPin }

// Fake Workers AI. Both answer shapes appear: { tool_calls: [{ name, arguments }] } and OpenAI-style choices.
const FAKE_AI = `import { WorkerEntrypoint } from 'cloudflare:workers'
export class FakeAI extends WorkerEntrypoint {
  async run(model, input) {
    const last = input.messages.at(-1).content
    if (last.startsWith('TOOL RESULTS')) return { response: 'Jawapan: ' + last.slice(0, 300) }
    if (/pesanan/.test(last)) return { response: '', tool_calls: [{ name: 'list_orders', arguments: { status: 'active' } }] }
    if (/harga ayam/.test(last)) return { choices: [{ message: { content: 'Baik, ini pelannya.', tool_calls: [{ id: 'c1', type: 'function',
      function: { name: 'update_menu_item', arguments: JSON.stringify({ id: 'ayam', price: 18 }) } }] } }] }
    if (/tutup/.test(last)) return { tool_calls: [{ name: 'update_shop_settings', arguments: { open: false } }] }
    if (/hantu/.test(last)) return { tool_calls: [{ name: 'delete_menu_item', arguments: { id: 'tiada-ini' } }] }
    return { response: 'model=' + model + ' tools=' + input.tools.length + ' shop=' + input.messages[0].content.includes('Test Pizzadonia') + ' history=' + input.messages.length }
  }
}
export default { fetch: () => new Response('ok') }
`

await test('Telegram AI helper: reads, plans, confirm, cancel, owner-only, once per update', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pizzadonia-ops-'))
  const outfile = path.join(dir, 'worker.mjs')
  await build({ entryPoints: ['cloudflare/backend.js'], outfile, bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], logLevel: 'silent' })
  await writeFile(path.join(dir, 'ai.mjs'), FAKE_AI)
  const calls = []
  let hook = { url: '', secret: '' }
  const outboundService = async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'api.telegram.org') return Response.json({ code: 'Ok', routes: [{ distance: 1000 }] })
    const [, , method] = url.pathname.split('/')
    const body = request.headers.get('content-type')?.includes('json') ? await request.json() : {}
    calls.push({ method, body })
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 555, is_bot: true, first_name: 'Pizzadonia Bot', username: 'pizzadonia_test_bot' } })
    if (method === 'setWebhook') { hook = { url: body.url, secret: body.secret_token, allowed: body.allowed_updates }; return Response.json({ ok: true, result: true }) }
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: { url: hook.url, pending_update_count: 0, allowed_updates: hook.allowed } })
    if (method === 'sendMessage') return Response.json({ ok: true, result: { message_id: calls.length } })
    return Response.json({ ok: true, result: true })
  }
  const main = { name: 'main', modules: true, modulesRoot: dir, scriptPath: outfile, compatibilityDate: '2026-10-16', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { SHOP: { className: 'PizzadoniaShop', useSQLite: true } }, durableObjectsPersist: path.join(dir, 'storage'),
    bindings: { IMPORT_KEY: importKey, SITE_ORIGIN: 'https://pizzadonia.pages.dev' }, serviceBindings: { AI: { name: 'ai', entrypoint: 'FakeAI' } }, outboundService }
  const ai = { name: 'ai', modules: true, modulesRoot: dir, scriptPath: path.join(dir, 'ai.mjs'), compatibilityDate: '2026-10-16' }
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ workers: [main, ai] }), resourcePersistencePath: path.join(dir, 'storage') })
  const call = async (url, { method = 'GET', body, owner = true, headers = {} } = {}) => {
    const r = await mf.dispatchFetch('https://pizzadonia.pages.dev' + url, { method,
      headers: { 'CF-Connecting-IP': '198.51.100.30', ...(owner ? { 'x-admin-session': session } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, data: await r.json().catch(() => null) }
  }
  let updateId = 1000
  const update = (u) => call('/api/telegram/webhook', { method: 'POST', owner: false, body: { update_id: ++updateId, ...u }, headers: { 'X-Telegram-Bot-Api-Secret-Token': hook.secret } })
  const chat = (id) => ({ id, type: 'private', first_name: 'Aiman', last_name: 'Test' })
  const say = (id, text) => update({ message: { message_id: 1, text, chat: chat(id) } })
  const tap = (id, data, from = id) => update({ callback_query: { id: 'cb' + updateId, data, from: { id: from }, message: { message_id: 9, chat: chat(id) } } })
  const sent = (to) => calls.filter((c) => c.method === 'sendMessage' && String(c.body.chat_id) === String(to))
  const lastTo = (to) => sent(to).at(-1)?.body
  const price = async (id) => (await call('/api/admin/settings')).data.menu.find((m) => m.id === id).price
  try {
    const snapshot = [encode('settings.json', settings), encode('admin-sessions.json', { [session]: { email: 'owner@example.com', exp: Date.now() + 86400000 } })]
    assert.equal((await call('/_migration/import', { method: 'POST', owner: false, body: { files: snapshot, finalize: true }, headers: { 'x-import-key': importKey } })).status, 200)
    assert.equal((await call('/api/admin/telegram/bot', { method: 'POST', body: { token: TOKEN }, headers: tx })).status, 200)
    assert.ok(hook.allowed.includes('callback_query'))
    assert.ok(calls.find((c) => c.method === 'setMyCommands').body.commands.some((c) => c.command === 'check'))
    const code = new URL((await call('/api/admin/telegram/link', { method: 'POST', body: {} })).data.web).searchParams.get('start')
    await say(777, `/start ${code}`)
    assert.equal((await call('/api/admin/settings')).data.opsAi.enabled, true)

    // free text -> the model; it gets the tools and the shop facts
    await say(777, 'hai')
    assert.match(lastTo(777).text, /^model=@cf\/zai-org\/glm-5\.3-flash tools=\d+ shop=true history=2$/)
    assert.ok(calls.some((c) => c.method === 'sendChatAction'))

    // a read tool (older answer shape) runs at once and its result goes back to the model
    await say(777, 'senarai pesanan aktif')
    assert.match(lastTo(777).text, /^Jawapan: TOOL RESULTS/)
    assert.match(lastTo(777).text, /list_orders/)
    assert.equal((await call('/api/admin/ops/state')).data.history.length, 4) // memory kept across turns

    // a change (OpenAI answer shape) becomes a plan with buttons; nothing changes yet
    await say(777, 'tukar harga ayam jadi RM18')
    let plan = lastTo(777)
    assert.match(plan.text, /Ayam: harga RM16\.00 → RM18\.00/)
    assert.match(plan.text, /^Baik, ini pelannya\./)
    const [yes, no] = plan.reply_markup.inline_keyboard[0]
    assert.equal(await price('ayam'), 16)

    // only the linked owner's tap counts
    await tap(777, yes.callback_data, 31337)
    await tap(31337, yes.callback_data)
    assert.equal(await price('ayam'), 16)
    assert.ok((await call('/api/admin/ops/state')).data.pending)

    await tap(777, yes.callback_data)
    assert.equal(await price('ayam'), 18)
    assert.match(lastTo(777).text, /✅ Ayam: RM18\.00/)
    assert.ok(calls.some((c) => c.method === 'answerCallbackQuery'))
    assert.ok(calls.some((c) => c.method === 'editMessageReplyMarkup'))

    // a second tap on the same plan does nothing
    await tap(777, yes.callback_data)
    assert.match(lastTo(777).text, /tamat atau sudah diproses/)
    assert.equal(await price('ayam'), 18)

    // cancel
    await say(777, 'tutup kedai sekarang')
    plan = lastTo(777)
    assert.match(plan.text, /🔴 TUTUP kedai/)
    await tap(777, plan.reply_markup.inline_keyboard[0][1].callback_data)
    assert.match(lastTo(777).text, /Dibatalkan/)
    assert.equal((await call('/api/admin/settings')).data.open, true)
    // and confirm closes it for real
    await say(777, 'tutup kedai sekarang')
    await tap(777, lastTo(777).reply_markup.inline_keyboard[0][0].callback_data)
    assert.equal((await call('/api/admin/settings')).data.open, false)

    // a plan naming something that does not exist is never shown or stored
    const before = sent(777).length
    await say(777, 'padam pizza hantu')
    assert.equal(sent(777).length, before + 1)
    assert.ok(!lastTo(777).reply_markup)
    assert.equal((await call('/api/admin/ops/state')).data.pending, null)

    // Telegram re-sending the same update runs it once
    const n = sent(777).length
    const same = { update_id: 5555, message: { message_id: 2, text: 'hai lagi', chat: chat(777) } }
    for (let i = 0; i < 2; i++) await call('/api/telegram/webhook', { method: 'POST', owner: false, body: same, headers: { 'X-Telegram-Bot-Api-Secret-Token': hook.secret } })
    assert.equal(sent(777).length, n + 1)

    // strangers never reach the model
    await say(31337, 'tukar harga ayam jadi RM1')
    assert.match(lastTo(31337).text, /pemilik kedai/)

    // /check without AI, /reset clears the memory
    await say(777, '/check')
    assert.match(lastTo(777).text, /Semakan kedai/)
    assert.match(lastTo(777).text, /TUTUP/)
    await say(777, '/reset')
    assert.equal((await call('/api/admin/ops/state')).data.history.length, 0)

    // the bot's short owner sessions end with each turn: only the test's own session is left
    const backup = (await call('/api/admin/cloud-backup')).data
    const sessions = JSON.parse(Buffer.from(backup.files.find((f) => f.path.endsWith('admin-sessions.json')).data, 'base64').toString())
    assert.deepEqual(Object.keys(sessions), [session])

    // switched off -> plain status reply, no model
    await call('/api/admin/settings', { method: 'PUT', body: { opsAi: { enabled: false, model: '@cf/evil/model' } } })
    assert.equal((await call('/api/admin/settings')).data.opsAi.model, '@cf/zai-org/glm-5.3-flash')
    await say(777, 'hai')
    assert.match(lastTo(777).text, /Hari ini:/)
  } finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }) }
})
