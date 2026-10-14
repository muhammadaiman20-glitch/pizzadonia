// Telegram heads-ups to the owner, through the owner's own bot (the one Hermes uses: TELEGRAM_BOT_TOKEN +
// TELEGRAM_HOME_CHANNEL in %LOCALAPPDATA%\hermes\.env). Sending never blocks or breaks a request.
import fs from 'node:fs'
import path from 'node:path'

const ENV_FILE = path.join(process.env.LOCALAPPDATA || '', 'hermes', '.env')
let cache = { at: 0, token: '', chat: '' }

function creds() {
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
    /* no Hermes .env -> Telegram off */
  }
  cache = { at: Date.now(), token, chat }
  return cache
}

export const telegramReady = () => Boolean(creds().token && creds().chat)

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
export async function tgClear(minAgeMs = 0) {
  const { token, chat } = creds()
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
      else if (!/not found|can't be deleted|message to delete/i.test(res.description || '')) keep.push(m)
    } catch {
      keep.push(m)
    }
  }
  sent = keep
  saveSent()
  return { deleted, tooOld }
}

/** text (max ~1000 chars with a photo), optional file { path, type: 'jpg'|'png'|'webp'|'pdf' }. Returns a promise. */
// buttons = [[{ text, url } | { text, web_app: { url } }], ...] -> Telegram inline keyboard under the message
export async function tgSend(text, file, log = console.log, buttons = null) {
  const markup = buttons?.length ? JSON.stringify({ inline_keyboard: buttons }) : null
  const { token, chat } = creds()
  if (!token || !chat) return { ok: false, error: 'Telegram not set up in Hermes (.env)' }
  const base = `https://api.telegram.org/bot${token}`
  try {
    let r
    if (file && fs.existsSync(file.path)) {
      const isPdf = file.type === 'pdf'
      const form = new FormData()
      form.append('chat_id', chat)
      form.append('caption', text.slice(0, 1000))
      if (markup) form.append('reply_markup', markup)
      const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[file.type] || 'application/octet-stream'
      form.append(isPdf ? 'document' : 'photo', new Blob([fs.readFileSync(file.path)], { type: mime }), path.basename(file.path))
      r = await fetch(`${base}/${isPdf ? 'sendDocument' : 'sendPhoto'}`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) })
    } else {
      r = await fetch(`${base}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true, ...(markup ? { reply_markup: JSON.parse(markup) } : {}) }),
      })
    }
    const j = await r.json().catch(() => ({}))
    if (j.ok && j.result?.message_id) {
      sent.push({ id: j.result.message_id, chat, at: Date.now() })
      saveSent()
    }
    if (!j.ok) {
      log(`[telegram] failed: ${j.description || r.status}`)
      return { ok: false, error: j.description || `HTTP ${r.status}` }
    }
    return { ok: true }
  } catch (e) {
    log(`[telegram] failed: ${e.message}`)
    return { ok: false, error: e.message }
  }
}
