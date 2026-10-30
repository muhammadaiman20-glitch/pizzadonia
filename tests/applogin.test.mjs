import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const CLIENT = '123-test.apps.googleusercontent.com'
const settings = { shopName: 'Test Pizzadonia', open: true, shop: { lat: 5.3, lng: 103.1, label: 'Test kitchen' }, adminPin: '876543', adminEmails: ['owner@example.com'], googleClientId: CLIENT }
const importKey = crypto.randomBytes(32).toString('hex')
const encode = (p, value) => ({ path: p, data: Buffer.from(JSON.stringify(value)).toString('base64') })
const b64url = (b) => b.toString('base64url')
const pair = () => { const verifier = b64url(crypto.randomBytes(32)); return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) } }

await test('Seller app login: Google in the browser, one-time code back to the app', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pizzadonia-applogin-'))
  const outfile = path.join(dir, 'worker.mjs')
  await build({ entryPoints: ['cloudflare/backend.js'], outfile, bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], logLevel: 'silent' })
  const outboundService = async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'oauth2.googleapis.com') return Response.json({})
    const who = url.searchParams.get('id_token')
    if (who === 'bad') return Response.json({ error: 'invalid' }, { status: 400 })
    return Response.json({ aud: CLIENT, iss: 'https://accounts.google.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600), sub: 's-' + who, email: who + '@example.com', name: who })
  }
  const main = { name: 'main', modules: true, modulesRoot: dir, scriptPath: outfile, compatibilityDate: '2026-10-16', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { SHOP: { className: 'PizzadoniaShop', useSQLite: true } }, durableObjectsPersist: path.join(dir, 'storage'),
    bindings: { IMPORT_KEY: importKey, SITE_ORIGIN: 'https://pizzadonia.pages.dev' }, outboundService }
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ workers: [main] }), resourcePersistencePath: path.join(dir, 'storage') })
  const call = async (url, { method = 'GET', body, headers = {} } = {}) => {
    const r = await mf.dispatchFetch('https://pizzadonia.pages.dev' + url, { method, headers: { 'CF-Connecting-IP': '198.51.100.41', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let data = null
    try { data = JSON.parse(text) } catch { data = text }
    return { status: r.status, data }
  }
  const begin = (credential, challenge) => call('/api/admin/app-login', { method: 'POST', body: { credential, challenge } })
  const redeem = (code, verifier) => call('/api/admin/app-login/redeem', { method: 'POST', body: { code, verifier } })
  try {
    assert.equal((await call('/_migration/import', { method: 'POST', body: { files: [encode('settings.json', settings)], finalize: true }, headers: { 'x-import-key': importKey } })).status, 200)
    const a = pair()
    // only the owner, with a real Google token and a proper challenge
    assert.equal((await begin('stranger', a.challenge)).status, 403)
    assert.equal((await begin('bad', a.challenge)).status, 401)
    assert.equal((await begin('owner', 'short')).status, 400)
    // the browser never receives a session, only a code
    let r = await begin('owner', a.challenge)
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.match(r.data.code, /^[A-Za-z0-9_-]{32}$/)
    assert.equal(r.data.session, undefined)
    // an app that intercepted the code cannot use it, and the attempt burns it
    assert.equal((await redeem(r.data.code, pair().verifier)).status, 403)
    assert.equal((await redeem(r.data.code, a.verifier)).status, 403)
    // the app that started the login gets a working owner session, once
    r = await begin('owner', a.challenge)
    const ok = await redeem(r.data.code, a.verifier)
    assert.equal(ok.status, 200, JSON.stringify(ok.data))
    assert.ok(ok.data.session)
    assert.equal((await call('/api/admin/orders', { headers: { 'x-admin-session': ok.data.session } })).status, 200)
    assert.equal((await redeem(r.data.code, a.verifier)).status, 403, 'a code works once')
    assert.equal((await call('/api/admin/orders')).status, 401, 'no session, no seller data')
  } finally {
    await mf.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
