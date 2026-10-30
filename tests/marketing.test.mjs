import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { MAX_PER_DAY, checkClaims, shopFacts, weekReport } from '../marketing.js'

const menu = [
  { id: 'ayam', name: 'Peperoni Ayam', desc: 'Ayam', price: 21.9, cost: 7.77, available: true, sizes: [{ id: '8inci', label: '8 inci', price: 21.9, cost: 7.77 }, { id: '10inci', label: '10 inci', price: 36.9, cost: 8.88 }] },
  { id: 'tuna', name: 'Tuna', desc: 'Tuna', price: 25.9, cost: 9.99, available: true },
  { id: 'habis', name: 'Habis', desc: '', price: 30, available: false },
  { id: 'baru', name: 'Baru', desc: '', price: 31, pendingPrice: true, available: true },
]
const settings = { shopName: 'Test Pizzadonia', open: true, shop: { lat: 5.3, lng: 103.1, label: 'Dapur' }, delivery: { baseFee: 3, baseKm: 3, perKm: 1, maxKm: 15, freeAbove: 0 },
  adminPin: '876543', adminEmails: ['owner@example.com'], googleClientId: '123-test.apps.googleusercontent.com', siteUrl: 'https://pizzadonia.pages.dev' }
const facts = shopFacts({ settings, menu, promos: [
  { code: 'JIMAT', kind: 'percent', value: 10, minOrder: 30, active: true },
  { code: 'LAMA', kind: 'fixed', value: 99, active: true, expires: '2020-01-01' },
  { code: 'TUTUP', kind: 'percent', value: 50, active: false },
], cashback: null })

test('facts: only what customers may see, no supplier cost, no sold-out or unpriced items', () => {
  const json = JSON.stringify(facts)
  for (const secret of ['7.77', '8.88', '9.99', 'cost']) assert.ok(!json.includes(secret), secret)
  assert.deepEqual(facts.products.map((p) => p.id), ['ayam', 'tuna'])
  assert.deepEqual(facts.promos.map((p) => p.code), ['JIMAT'])
})

test('checkClaims: real numbers pass; made-up numbers and risky promises are flagged', () => {
  assert.deepEqual(checkClaims('Peperoni Ayam RM21.90 atau RM 36.90. Jimat 10% dengan kod JIMAT, min RM30. Caj dari RM3.', facts), [])
  assert.equal(checkClaims('Hanya RM9.90!', facts).length, 1)
  assert.match(checkClaims('Diskaun 50% hari ini', facts)[0], /50%/)
  assert.match(checkClaims('Pizza halal', facts)[0], /halal/)
  assert.match(checkClaims('Pizza terbaik di KT', facts)[0], /terbaik/)
  assert.match(checkClaims('Sampai dalam 20 minit', facts)[0], /masa/)
  assert.deepEqual(checkClaims('Harga rm99', facts), ['Harga rm99 tiada dalam data kedai.'])
})

test('weekReport: this week vs last, top and unsold pizzas', () => {
  const now = Date.parse('2026-10-30T12:00:00Z')
  const ago = (d) => new Date(now - d * 86400000).toISOString()
  const orders = [
    { status: 'done', createdAt: ago(1), subtotal: 50, items: [{ id: 'ayam', qty: 2 }] },
    { status: 'cancelled', createdAt: ago(1), subtotal: 500, items: [{ id: 'tuna', qty: 9 }] },
    { status: 'done', createdAt: ago(9), subtotal: 20, items: [{ id: 'tuna', qty: 1 }] },
  ]
  const r = weekReport({ orders, facts, now })
  assert.deepEqual([r.orders, r.sales, r.prevOrders, r.prevSales], [1, 50, 1, 20])
  assert.deepEqual(r.top, [{ id: 'ayam', name: 'Peperoni Ayam', qty: 2 }])
  assert.equal(r.slow[0].id, 'tuna')
  assert.match(r.suggestion, /Peperoni Ayam.*Tuna/)
  assert.match(weekReport({ orders: [], facts, now }).suggestion, /Belum ada/)
})

const FAKE_AI = `import { WorkerEntrypoint } from 'cloudflare:workers'
let flaky = 0
export class FakeAI extends WorkerEntrypoint {
  async run(model, input) {
    const all = input.messages.map((m) => m.content).join(' ')
    if (all.includes('7.77')) return { response: 'BOCOR' }
    const last = input.messages.at(-1).content
    if (last.includes('gagalsekali') && flaky++ === 0) throw new Error('sementara')
    if (last.includes('gagalselalu')) throw new Error('rosak')
    if (last.includes('tipu')) return { response: 'Pizza halal terbaik cuma RM2.' }
    return { response: 'Peperoni Ayam RM21.90 tokens=' + input.max_tokens }
  }
}
export default { fetch: () => new Response('ok') }
`

test('marketing API: owner only, draft, check, approve, edit, reject, daily limit', async () => {
  const session = crypto.randomBytes(24).toString('hex')
  const importKey = crypto.randomBytes(32).toString('hex')
  const encode = (p, value) => ({ path: p, data: Buffer.from(JSON.stringify(value)).toString('base64') })
  const dir = await mkdtemp(path.join(tmpdir(), 'pizzadonia-mk-'))
  const outfile = path.join(dir, 'worker.mjs')
  await build({ entryPoints: ['cloudflare/backend.js'], outfile, bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], logLevel: 'silent' })
  await writeFile(path.join(dir, 'ai.mjs'), FAKE_AI)
  const main = { name: 'main', modules: true, modulesRoot: dir, scriptPath: outfile, compatibilityDate: '2026-10-16', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { SHOP: { className: 'PizzadoniaShop', useSQLite: true } }, durableObjectsPersist: path.join(dir, 'storage'),
    bindings: { IMPORT_KEY: importKey, SITE_ORIGIN: 'https://pizzadonia.pages.dev' }, serviceBindings: { AI: { name: 'ai', entrypoint: 'FakeAI' } } }
  const ai = { name: 'ai', modules: true, modulesRoot: dir, scriptPath: path.join(dir, 'ai.mjs'), compatibilityDate: '2026-10-16' }
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ workers: [main, ai] }), resourcePersistencePath: path.join(dir, 'storage') })
  const call = async (url, { method = 'GET', body, owner = true, headers = {} } = {}) => {
    const send = () => mf.dispatchFetch('https://pizzadonia.pages.dev' + url, { method,
      headers: { 'CF-Connecting-IP': '198.51.100.31', ...(owner ? { 'x-admin-session': session } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined })
    // local workerd may close the socket after an early 4xx (same as tests/cloud.test.mjs); resend once
    const r = await send().catch((e) => { if (e.cause?.code === 'ECONNRESET') return send(); throw e })
    return { status: r.status, data: await r.json().catch(() => null) }
  }
  const gen = (goal = '') => call('/api/admin/marketing/generate', { method: 'POST', body: { platform: 'facebook', kind: 'post', goal } })
  const act = (id, action, extra = {}) => call(`/api/admin/marketing/${id}`, { method: 'PATCH', body: { action, ...extra } })
  const importFiles = (files) => call('/_migration/import', { method: 'POST', owner: false, body: { files, finalize: true }, headers: { 'x-import-key': importKey } })
  try {
    // start 4 drafts below the daily limit, so the limit is reached near the end of this test
    const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    assert.equal((await importFiles([encode('settings.json', settings), encode('menu.json', menu), encode('marketing.json', { drafts: [], nextId: 1, usage: { day, count: MAX_PER_DAY - 4 } }),
      encode('admin-sessions.json', { [session]: { email: 'owner@example.com', exp: Date.now() + 86400000 } })])).status, 200)

    // strangers get nothing
    assert.equal((await call('/api/admin/marketing', { owner: false })).status, 401)
    assert.equal((await call('/api/admin/marketing/generate', { method: 'POST', owner: false, body: { platform: 'facebook', kind: 'post' } })).status, 401)
    // bad input
    assert.equal((await call('/api/admin/marketing/generate', { method: 'POST', body: { platform: 'myspace', kind: 'post' } })).status, 400)
    assert.equal((await call('/api/admin/marketing/generate', { method: 'POST', body: { platform: 'facebook', kind: 'post', products: ['habis'] } })).status, 400)

    // a clean draft: no supplier cost reached the AI, longer token limit used, approved straight away
    const good = (await gen()).data.draft
    assert.equal(good.text, 'Peperoni Ayam RM21.90 tokens=900')
    assert.equal(good.status, 'draft')
    assert.deepEqual(good.warnings, [])
    assert.equal((await act(good.id, 'posted')).status, 409) // can't post before approval
    assert.equal((await act(good.id, 'approve')).data.draft.status, 'approved')

    // editing approved text sends it back for approval
    const edited = (await act(good.id, 'edit', { text: 'Tuna RM25.90' })).data.draft
    assert.equal(edited.status, 'draft')
    assert.equal(edited.approvedAt, undefined)
    assert.equal((await act(good.id, 'approve')).status, 200)
    assert.equal((await act(good.id, 'posted')).data.draft.status, 'posted')
    assert.equal((await act(good.id, 'edit', { text: 'x' })).status, 409)

    // made-up claims can't be approved until the owner acknowledges them
    const bad = (await gen('tipu')).data.draft
    assert.equal(bad.warnings.length, 3)
    assert.equal((await act(bad.id, 'approve')).status, 409)
    assert.equal((await act(bad.id, 'approve', { ack: true })).status, 200)

    // reject, then delete; only rejected drafts can be deleted
    assert.equal((await call(`/api/admin/marketing/${bad.id}`, { method: 'DELETE' })).status, 409)
    assert.equal((await act(bad.id, 'reject')).data.draft.status, 'rejected')
    assert.equal((await call(`/api/admin/marketing/${bad.id}`, { method: 'DELETE' })).status, 200)

    // one temporary AI failure is retried; lasting failure saves nothing
    assert.equal((await gen('gagalsekali')).status, 200)
    const before = (await call('/api/admin/marketing')).data
    assert.equal((await gen('gagalselalu')).status, 502)
    const after = (await call('/api/admin/marketing')).data
    assert.equal(after.drafts.length, before.drafts.length)
    assert.equal(after.drafts.length, 2)
    assert.equal(after.usedToday, MAX_PER_DAY - 1) // the failed attempt did not count
    assert.equal(after.report.orders, 0)

    // the daily cost limit
    assert.equal((await gen()).status, 200)
    assert.equal((await gen()).status, 429)
  } finally {
    await mf.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
