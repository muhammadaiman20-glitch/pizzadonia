// Telegram /pizza (Hermes quick command): sends the shop status with tappable buttons, then prints a one-liner
// that Hermes posts as its reply. Shop / kitchen / rider open INSIDE Telegram (Web App buttons, private chat only);
// the seller dashboard opens in the browser because Google sign-in does not work inside Telegram's viewer.
import fs from 'node:fs'
import path from 'node:path'

const SITE = process.env.SITE_URL || 'https://pizzadonia.pages.dev'
const env = {}
try {
  for (const line of fs.readFileSync(path.join(process.env.LOCALAPPDATA || '', 'hermes', '.env'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
} catch {
  /* no Hermes .env */
}

let shop = null
try {
  shop = await (await fetch(`${SITE}/api/shop`, { signal: AbortSignal.timeout(5000) })).json()
} catch {
  /* shop not running */
}
const lines = ['🍕 Pizzadonia']
if (!shop) lines.push('⚠️ Kedai tidak dapat dihubungi sekarang. Cuba buka pautan di bawah.')
else {
  lines.push(shop.open ? '🟢 Dibuka - menerima pesanan' : '🔴 Tutup sekarang')
  if (shop.welcome) lines.push(`🎁 Pelanggan baru: hadiah RM${shop.welcome.amount}`)
  if (shop.cashback) lines.push(`💸 Cashback ${shop.cashback.percent}% hingga ${shop.cashback.end}`)
}
lines.push('', `🔗 ${SITE}`)

const keyboard = [
  [{ text: '🛒 Buka Kedai', web_app: { url: SITE } }],
  [{ text: '🍳 Dapur', web_app: { url: `${SITE}/#/dapur` } }, { text: '🛵 Rider', web_app: { url: `${SITE}/#/rider` } }],
  [{ text: '🧑‍💼 Seller dashboard', url: `${SITE}/#/admin` }],
]

let sent = false
if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_HOME_CHANNEL) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ chat_id: env.TELEGRAM_HOME_CHANNEL, text: lines.join('\n'), disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } }),
    })
    sent = (await r.json()).ok === true
  } catch {
    sent = false
  }
}
// Hermes posts whatever we print: a short pointer when the buttons went out, the full links if they did not
console.log(sent ? '👆 Tekan butang di atas' : [...lines, `🧑‍💼 Seller: ${SITE}/#/admin`, `🍳 Dapur: ${SITE}/#/dapur`, `🛵 Rider: ${SITE}/#/rider`].join('\n'))
