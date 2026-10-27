// WhatsApp Cloud API (Meta) for customer login: shared by the local server and the Cloudflare backend (fetch only).
// Login is customer-initiated: the shop shows a code, the customer sends it to the shop's WhatsApp business number,
// Meta passes that message to our webhook, and the sender's number proves the phone is theirs. Messages a customer
// sends, and our replies within 24 hours, are free - no paid template messages are used.
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'

export const WA_WEBHOOK_PATH = '/api/whatsapp/webhook'
export const LOGIN_TTL = 10 * 60 * 1000
const GRAPH = 'https://graph.facebook.com/v23.0'

/** one Graph API call; never throws - returns { ok, result } or { ok: false, error, code } */
export async function waApi(token, method, pathname, body, timeout = 8000) {
  try {
    const r = await fetch(`${GRAPH}/${pathname}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
    })
    const j = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, result: j } : { ok: false, error: j.error?.message || `HTTP ${r.status}`, code: j.error?.code || r.status }
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'Meta did not answer in time' : e.message, code: 0 }
  }
}

/** plain text reply (free inside the 24-hour window the customer's own message opens) */
export const waText = (w, to, text) =>
  waApi(w.token, 'POST', `${w.phoneNumberId}/messages`, { messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } })

/** X-Hub-Signature-256 = sha256=HMAC(app secret, raw body): proves the request came from Meta */
export function waSigned(appSecret, raw, header) {
  if (!appSecret || !raw || !header) return false
  const want = Buffer.from('sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex'))
  const got = Buffer.from(String(header))
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}

/** inbound customer messages in a webhook body -> [{ id, from, text }] (status receipts are skipped) */
export function waMessages(body) {
  const out = []
  for (const e of body?.entry || []) for (const c of e.changes || []) for (const m of c.value?.messages || [])
    out.push({ id: String(m.id || ''), from: String(m.from || ''), text: m.type === 'text' ? String(m.text?.body || '') : '' })
  return out
}

/** the 6-digit code inside "Kod log masuk Pizzadonia: 482913" (or just "482913") */
export const loginCode = (text) => /(?:^|\D)(\d{6})(?:\D|$)/.exec(String(text || ''))?.[1] || ''
