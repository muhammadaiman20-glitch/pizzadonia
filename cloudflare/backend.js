import { DurableObject } from 'cloudflare:workers'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import { ShopFiles } from './runtime/storage.js'
import { createCloudApp } from './runtime/app.js'
import { permanentFailure, tgApi } from '../telegram-bot.js'
import { opsModel, runOpsTurn } from '../ops-assistant.js'
import { aiModel, aiText } from '../workers-ai.js'
import { aiWithRetry } from '../marketing.js'

const response = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y)
}

export default {
  async fetch(request, env) {
    // This service is private. Pages calls it with an in-process service binding.
    const headers = new Headers(request.headers)
    for (const h of ['x-pz-proxy', 'x-nf-client-connection-ip', 'x-forwarded-for', 'x-real-ip', 'tailscale-user-login', 'tailscale-user-name']) headers.delete(h)
    return env.SHOP.getByName('pizzadonia').fetch(new Request(request, { headers }))
  },
}

// One coordinator for this shop: order IDs, promo limits and wallet debits must commit together.
// A future multi-shop system must create a separate object per shop.
export class PizzadoniaShop extends DurableObject {
  queue = Promise.resolve()
  ops = Promise.resolve()
  social = Promise.resolve()
  internalKey = crypto.randomUUID() // proves a request came from this object, never leaves it
  constructor(ctx, env) {
    super(ctx, env)
    ShopFiles.initialize(this.ctx.storage.sql)
  }
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/api/admin/marketing/generate' && request.method === 'POST' && this.env.AI) return this.marketingDraft(request)
    // Serialize business commands, including their network waits, without blockConcurrencyWhile.
    const previous = this.queue
    let release
    this.queue = new Promise(resolve => { release = resolve })
    await previous
    const opsJobs = []
    const socialJobs = []
    let result
    try { result = await this.handle(request, opsJobs, socialJobs) }
    catch (e) {
      opsJobs.length = 0 // its owner session was discarded with the failed command
      socialJobs.length = 0
      console.error(JSON.stringify({ event: 'shop_error', message: e.message, path: new URL(request.url).pathname }))
      result = response({ error: 'Sistem tidak dapat memproses permintaan. Sila cuba lagi.' }, 500)
    } finally { release() }
    // The owner's AI helper runs after the shop lock is released: each of its tool calls is its own serialized
    // request, so orders keep flowing while the model thinks. Telegram gets its 200 when the turn ends.
    for (const job of opsJobs) await this.runOps(job)
    // Customer messages: Meta gets its 200 now, and the AI writes the reply in the background.
    for (const id of socialJobs) this.ctx.waitUntil(this.runSocial(id))
    return result
  }
  aiRun(messages, model, maxTokens, temperature) {
    return aiWithRetry(async () => aiText(await this.env.AI.run(aiModel(model), { messages, max_tokens: maxTokens, temperature })))
  }
  // Marketing draft: the AI writes with no lock held, so orders never wait for it.
  async marketingDraft(request) {
    const body = await request.text()
    const step = async (path, json) => {
      const r = await this.fetch(new Request('https://shop.internal/api/admin/marketing/' + path, { method: 'POST', headers: request.headers, body: json }))
      return { r, data: await r.clone().json().catch(() => null) }
    }
    const prep = await step('prepare', body)
    if (!prep.r.ok) return prep.r
    let text
    try { text = await this.aiRun(prep.data.messages, prep.data.model, 900, 0.7) }
    catch (e) {
      console.error(JSON.stringify({ event: 'marketing_ai_error', message: e.message }))
      return response({ error: 'AI gagal menulis draf. Cuba sekali lagi sebentar nanti.' }, 502)
    }
    return (await step('save', JSON.stringify({ ...prep.data.draft, text }))).r
  }
  // One customer reply at a time, so two quick messages cannot overlap. Each shop call is its own serialized request.
  runSocial(id) {
    const run = this.social.then(async () => {
      const call = async (method, body) => {
        const r = await this.fetch(new Request('https://shop.internal/api/social/internal/' + encodeURIComponent(id), { method,
          headers: { 'x-internal-key': this.internalKey, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }))
        return r.json().catch(() => null)
      }
      const job = await call('GET')
      if (!job) return
      if (job.limit) return call('POST', { limit: true, at: job.at })
      if (job.skip) return
      let answer
      try { answer = { text: await this.aiRun(job.messages, job.model, 300, 0.3) } }
      catch (e) {
        console.error(JSON.stringify({ event: 'social_ai_error', message: e.message }))
        answer = { error: true }
      }
      await call('POST', { ...answer, at: job.at })
    })
    this.social = run.catch((e) => console.error(JSON.stringify({ event: 'social_job_error', message: e.message })))
    return this.social
  }
  // One helper turn at a time, so two quick messages cannot interleave the helper's memory.
  runOps(job) {
    const run = this.ops.then(async () => {
      const api = async (method, path, body) => {
        const r = await this.fetch(new Request('https://shop.internal' + path, { method,
          headers: { 'x-admin-session': job.session, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }))
        return { status: r.status, data: await r.json().catch(() => null) }
      }
      const ai = this.env.AI ? (messages, tools, model) => this.env.AI.run(opsModel(model), { messages, tools, max_tokens: 1500, temperature: 0.2 }) : null
      try { await runOpsTurn(job, { ai, api, tg: (method, body) => tgApi(job.token, method, body, 15000) }) }
      catch (e) {
        console.error(JSON.stringify({ event: 'ops_error', message: e.message }))
        await tgApi(job.token, 'sendMessage', { chat_id: job.chatId, text: '⚠️ Pembantu AI tersekat. Cuba lagi, atau hantar /check.' })
      } finally { await api('POST', '/api/admin/logout') } // the bot's 5-minute owner session ends with the turn
    })
    this.ops = run.catch(() => {})
    return run
  }
  async handle(request, opsJobs = [], socialJobs = []) {
    const url = new URL(request.url)
    const fs = new ShopFiles(this.ctx.storage)
    const ready = this.ctx.storage.sql.exec("SELECT value FROM metadata WHERE key = 'ready'").toArray().length > 0
    if (url.pathname === '/_migration/import' && request.method === 'POST') {
      if (!safeEqual(request.headers.get('x-import-key'), this.env.IMPORT_KEY)) return response({ error: 'Not found' }, 404)
      if (ready) return response({ error: 'Migration already finalized' }, 409)
      const body = await boundedJson(request, 14 * 1024 * 1024)
      if (!Array.isArray(body.files) || body.files.length > 200) return response({ error: 'Invalid snapshot' }, 400)
      for (const f of body.files) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\/-]*$/.test(f.path) || f.path.includes('..') || typeof f.data !== 'string') return response({ error: 'Invalid path' }, 400)
        const b = Buffer.from(f.data, 'base64')
        if (b.length > 8 * 1024 * 1024) return response({ error: 'File exceeds upload limit' }, 413)
        fs.writeFileSync('/data/' + f.path, b)
      }
      if (body.finalize) {
        const s = fs.load('settings.json', {})
        if (!s.googleClientId || !Array.isArray(s.adminEmails) || !s.adminEmails.length || !s.adminPin) return response({ error: 'Owner sign-in and transaction PIN required' }, 400)
        s.siteUrl = this.env.SITE_ORIGIN || 'https://pizzadonia.pages.dev'
        s.publicUrl = s.siteUrl; s.tunnelUrl = ''; s.proxySecret = ''
        // The support assistant runs on Workers AI.
        s.aiChat = { enabled: s.aiChat?.enabled !== false, model: aiModel(s.aiChat?.model) }
        fs.save('settings.json', s)
      }
      this.ctx.storage.transactionSync(() => {
        fs.commit()
        if (body.finalize) this.ctx.storage.sql.exec("INSERT INTO metadata(key,value) VALUES ('ready',?)", new Date().toISOString())
      })
      return response({ ok: true, files: body.files.length, finalized: Boolean(body.finalize) })
    }
    if (url.pathname === '/api/health') return response({ ok: ready, hosting: 'cloudflare', pcRequired: false, storage: 'durable-sqlite' }, ready ? 200 : 503)
    if (!ready) return response({ error: 'Pemindahan data sedang dijalankan. Sila cuba sebentar lagi.' }, 503)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const origin = request.headers.get('origin')
      if (origin && origin !== (this.env.SITE_ORIGIN || 'https://pizzadonia.pages.dev')) return response({ error: 'Origin not allowed' }, 403)
    }
    const load = fs.load.bind(fs), save = fs.save.bind(fs)
    const hits = new Map(load('rate-limits.json', []).map(([k,v]) => [k,v.filter(t => t > Date.now()-3600000)]).filter(([,v]) => v.length))
    const googleTickets = new Map(load('google-tickets.json', []).filter(([,v]) => v.exp > Date.now()))
    // Notifications use a persistent outbox. No fire-and-forget work can mutate a finished request.
    const outbox = load('outbox.json', [])
    // The shop's own bot + linked chat live in settings (Shop & fees -> Telegram).
    const tgSend = async (text, file, _log, buttons, creds) => {
      if (!creds?.chat) return { ok: false, error: 'Telegram is not connected' }
      outbox.push({ id: crypto.randomUUID(), chat: creds.chat, text, file: file ? { ...file, data: fs.readFileSync(file.path).toString('base64') } : null, buttons, at: Date.now() })
      save('outbox.json', outbox)
      return { ok: true, queued: true }
    }
    const tgDelivery = () => ({ ...load('telegram-delivery.json', { at: 0, ok: null, error: '' }), queued: outbox.length })
    const aiGenerate = this.env.AI ? async (messages, model, opts = {}) => aiText(await this.env.AI.run(aiModel(model), { messages, max_tokens: opts.maxTokens || 300, temperature: opts.temperature ?? 0.3 })) : null
    const app = createCloudApp({ fs, load, save, hits, googleTickets, tgSend, tgDelivery, aiGenerate, deferOps: job => { opsJobs.push(job) }, deferSocial: id => { socialJobs.push(id) }, internalKey: this.internalKey })
    // Owner-only complete backup, including PIN hashes and private documents. Never public or logged.
    app.get('/api/admin/cloud-backup', (_req, res) => {
      const sessions = load('admin-sessions.json', {})
      const s = sessions[request.headers.get('x-admin-session')]
      const settings = load('settings.json', {})
      if (!s || s.exp <= Date.now() || !settings.adminEmails.includes(s.email)) return res.status(401).json({ error: 'Log in as the owner first' })
      return res.json({ version: 1, exportedAt: new Date().toISOString(), files: fs.export() })
    })
    const result = await app.fetch(request)
    save('rate-limits.json', [...hits].filter(([,v]) => v.length))
    save('google-tickets.json', [...googleTickets])
    fs.commit()
    if (outbox.length) await this.ctx.storage.setAlarm(Date.now() + 1000)
    return result
  }
  async alarm() {
    const previous = this.queue
    let release
    this.queue = new Promise(resolve => { release = resolve })
    await previous
    try {
      const fs = new ShopFiles(this.ctx.storage)
      const outbox = fs.load('outbox.json', [])
      const item = outbox[0]
      if (!item) return
      const tgs = fs.load('settings.json', {}).telegram || {}
      const token = tgs.botToken
      const chat = item.chat
      if (!token || !chat) return
      // Schedule retry before I/O so a terminated invocation does not strand the outbox.
      await this.ctx.storage.setAlarm(Date.now() + 60000)
      let body, method = 'sendMessage', headers = {}
      if (item.file) {
        const f = new FormData(); const pdf = item.file.type === 'pdf'
        f.append('chat_id', chat)
        f.append('caption', item.text.slice(0,1000))
        if (item.buttons) f.append('reply_markup', JSON.stringify({ inline_keyboard: item.buttons }))
        f.append(pdf ? 'document' : 'photo', new Blob([Buffer.from(item.file.data,'base64')], { type: pdf ? 'application/pdf' : 'image/' + (item.file.type === 'jpg' ? 'jpeg' : item.file.type) }), item.file.path.split('/').pop())
        body = f; method = pdf ? 'sendDocument' : 'sendPhoto'
      } else {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({ chat_id: chat, text: item.text.slice(0,4000), ...(item.buttons ? { reply_markup: { inline_keyboard: item.buttons } } : {}) })
      }
      let data
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) })
        data = await r.json().catch(() => ({ ok: false, error_code: r.status, description: `HTTP ${r.status}` }))
      } catch (e) { data = { ok: false, error_code: 0, description: e.message } }
      // Success, or a failure retrying can't fix (bot blocked, chat gone, bad token): move on to the next alert.
      const done = data.ok || permanentFailure(data.error_code)
      fs.save('telegram-delivery.json', { at: Date.now(), ok: Boolean(data.ok), error: data.ok ? '' : data.description || 'Send failed', permanent: !data.ok && done })
      if (done) fs.save('outbox.json', outbox.slice(1))
      fs.commit()
      if (done) {
        if (outbox.length > 1) await this.ctx.storage.setAlarm(Date.now()+1000)
        else await this.ctx.storage.deleteAlarm()
      }
    } finally { release() }
  }
}

async function boundedJson(request, limit) {
  const chunks = []; let size = 0
  const reader = request.body?.getReader()
  if (reader) while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) { await reader.cancel(); throw new Error('Snapshot too large') }
    chunks.push(Buffer.from(value))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
