// Local transport for Telegram alerts (the optional PC server). server.js passes the shop's own bot + linked
// chat in as creds. Sending never blocks or breaks a request.
import fs from 'node:fs'
import path from 'node:path'
import { permanentFailure } from './telegram-bot.js'

// last delivery result, shown on the dashboard's connection card
let delivery = { at: 0, ok: null, error: '' }
export const tgDelivery = () => ({ ...delivery, queued: 0 })

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
    delivery = { at: Date.now(), ok: true, error: '' }
    return { ok: true }
  } catch (e) {
    delivery = { at: Date.now(), ok: false, error: e.message }
    log(`[telegram] failed: ${e.message}`)
    return { ok: false, error: e.message }
  }
}
