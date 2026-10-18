// Pizzadonia's own Telegram bot: shared by the local server and the Cloudflare backend (fetch only, no Node APIs).
// Flow: owner pastes the BotFather token -> we register a webhook -> the dashboard "Connect" button opens
// t.me/<bot>?start=<one-time code> -> owner taps Start -> the webhook sees "/start <code>" and saves that chat.
export const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,64}$/
export const LINK_TTL = 10 * 60 * 1000
export const WEBHOOK_PATH = '/api/telegram/webhook'
export const COMMANDS = [
  { command: 'start', description: 'Status kedai & butang pantas' },
  { command: 'status', description: 'Pesanan hari ini & yang perlu tindakan' },
  { command: 'check', description: 'Semakan kesihatan kedai & sistem' },
  { command: 'reset', description: 'Mula perbualan baru dengan pembantu AI' },
  { command: 'stop', description: 'Berhenti terima notifikasi di chat ini' },
]
// callback_query = the Confirm / Cancel buttons under the AI helper's change plans
export const HOOK_UPDATES = ['message', 'callback_query', 'my_chat_member']

/** one Bot API call; never throws - returns { ok, result } or { ok: false, error, code } */
export async function tgApi(token, method, body, timeout = 10000) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeout),
      body: JSON.stringify(body || {}),
    })
    const j = await r.json().catch(() => ({}))
    return j.ok ? { ok: true, result: j.result } : { ok: false, error: j.description || `HTTP ${r.status}`, code: j.error_code || r.status }
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'Telegram did not answer in time' : e.message, code: 0 }
  }
}

/** a failed send that will never succeed by retrying (bad chat, bot blocked, bad token) */
export const permanentFailure = (code) => code === 400 || code === 401 || code === 403 || code === 404

// t.me opens the app on phones and offers it on desktop; tg:// jumps straight into an installed app
export function linkUrls(username, code = '') {
  const q = code ? `?start=${code}` : ''
  return { web: `https://t.me/${username}${q}`, app: `tg://resolve?domain=${username}${code ? `&start=${code}` : ''}` }
}

/** "/start abc", "/start@MyBot abc" -> { cmd: 'start', arg: 'abc' } */
export function parseCommand(text) {
  const m = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?$/i.exec(String(text || '').trim())
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] || '').trim() } : null
}

export const chatLabel = (chat = {}) =>
  [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || (chat.username ? '@' + chat.username : `Chat ${chat.id}`)

/** shortcuts under owner messages: shop / kitchen / rider open inside Telegram, seller in the browser (Google sign-in) */
export function ownerKeyboard(site) {
  if (!site) return null
  return [
    [{ text: '🛒 Buka Kedai', web_app: { url: site } }],
    [{ text: '🍳 Dapur', web_app: { url: `${site}/#/dapur` } }, { text: '🛵 Rider', web_app: { url: `${site}/#/rider` } }],
    [{ text: '🧑‍💼 Seller dashboard', url: `${site}/#/admin` }],
  ]
}
