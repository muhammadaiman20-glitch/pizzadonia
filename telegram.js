// Local transport for Telegram alerts. server.js decides WHICH bot and chat (Pizzadonia's own bot from the
// dashboard, else Hermes' bot from %LOCALAPPDATA%\hermes\.env as a fallback) and passes them in as creds.
// Sending never blocks or breaks a request.
import fs from 'node:fs'
import path from 'node:path'
import { permanentFailure } from './telegram-bot.js'

const ENV_FILE = path.join(process.env.LOCALAPPDATA || '', 'hermes', '.env')
let cache = { at: 0, token: '', chat: '' }

/** fallback bot: Hermes' TELEGRAM_BOT_TOKEN + TELEGRAM_HOME_CHANNEL (re-read every minute) */
export function telegramEnv() {
  if (Date.now() - cache.at < 60000) return cache
  let token = ''
  let chat = ''
  try {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=')
      if (i < 0) continue
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
      if (k === 'TELEGRAM_BOT_TOKEN') token = v
      if (k === 'TELEGRAM_HOME_CHANNEL') chat = v
    }
  } catch {
    /* no Hermes .env -> no fallback bot */
  }
  cache = { at: Date.now(), token, chat }
  return cache
}

// last delivery result, shown on the dashboard's connection card
let delivery = { at: 0, ok: null, error: '' }
export const tgDelivery = () => ({ ...delivery, queued: 0 })

// every alert we send is remembered (id + time) so it can be deleted later - only OUR messages, never Hermes'.
// Telegram lets a bot delete its own messages for 48 hours only.
const SENT_FILE = path.join(process.cwd(), 'data', 'telegram-sent.json')
let sent = []
try {
  sent = JSON.parse(fs.readFileSync(SENT_FILE, 'utf8'))
} catch {
  sent = []
}
function saveSent() {
  try {
    fs.writeFileSync(SENT_FILE, JSON.stringify(sent.slice(-2000)))
  } catch {
    /* best effort */
  }
}
const MAX_AGE = 47.5 * 3600e3
export const sentCount = () => ({ total: sent.length, deletable: sent.filter((m) => Date.now() - m.at < MAX_AGE).length })

/** delete our alerts older than minAgeMs (0 = every one Telegram still allows). Returns { deleted, tooOld }. */
export async function tgClear(minAgeMs, { token, chat }) {
  if (!token || !chat) return { deleted: 0, tooOld: 0, error: 'Telegram not set up' }
  const now = Date.now()
  let deleted = 0
  let tooOld = 0
  const keep = []
  for (const m of sent) {
    if (now - m.at < minAgeMs) {
      keep.push(m)
      continue
    }
    if (now - m.at > MAX_AGE) {
      tooOld++ // Telegram refuses after 48 h - forget it
      continue
    }
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ chat_id: m.chat || chat, message_id: m.id }),
      })
      const res = await r.json().catch(() => ({}))
      if (res.ok) deleted++
      else if (!/not found|can't be deleted|message to delete|chat not found|bot was blocked/i.test(res.description || '')) keep.push(m)
    } catch {
      keep.push(m)
    }
  }
  sent = keep
  saveSent()
  return { deleted, tooOld }
}

/** text (max ~1000 chars with a photo), optional file { path, type: 'jpg'|'png'|'webp'|'pdf' }.
 *  buttons = [[{ text, url } | { text, web_app: { url } }], ...] -> inline keyboard under the message */
export async function tgSend(text, file, log = console.log, buttons = null, { token, chat } = {}) {
  if (!token || !chat) return { ok: false, error: 'Telegram is not connected' }
  const markup = buttons?.length ? { inline_keyboard: buttons } : null
  const base = `https://api.telegram.org/bot${token}`
  try {
    let r
    if (file && fs.existsSync(file.path)) {
      const isPdf = file.type === 'pdf'
      const form = new FormData()
      form.append('chat_id', chat)
      form.append('caption', text.slice(0, 1000))
      if (markup) form.append('reply_markup', JSON.stringify(markup))
      const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[file.type] || 'application/octet-stream'
      form.append(isPdf ? 'document' : 'photo', new Blob([fs.readFileSync(file.path)], { type: mime }), path.basename(file.path))
      r = await fetch(`${base}/${isPdf ? 'sendDocument' : 'sendPhoto'}`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) })
    } else {
      r = await fetch(`${base}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) }),
      })
    }
    const j = await r.json().catch(() => ({}))
    if (!j.ok) {
      const error = j.description || `HTTP ${r.status}`
      delivery = { at: Date.now(), ok: false, error, permanent: permanentFailure(j.error_code || r.status) }
      log(`[telegram] failed: ${error}`)
      return { ok: false, error }
    }
    if (j.result?.message_id) {
      sent.push({ id: j.result.message_id, chat, at: Date.now() })
      saveSent()
    }
    delivery = { at: Date.now(), ok: true, error: '' }
    return { ok: true }
  } catch (e) {
    delivery = { at: Date.now(), ok: false, error: e.message }
    log(`[telegram] failed: ${e.message}`)
    return { ok: false, error: e.message }
  }
}
