// Pizzadonia: shop API + the built web app on ONE port (5400).
// Data lives in ./data as JSON files (menu, settings, orders). Prices, delivery fee and totals are
// always recalculated here - the browser's numbers are never trusted.
import express from 'express'
import { createSupport } from './support.js'
import { createLedger } from './ledger.js'
import { createMarketing } from './marketing.js'
import { createSocial } from './social.js'
import { tgDelivery, tgSend } from './telegram.js'
import { AI_MODELS, aiModel } from './workers-ai.js'
import { COMMANDS, HOOK_UPDATES, LINK_TTL, TOKEN_RE, WEBHOOK_PATH, chatLabel, linkUrls, ownerKeyboard, parseCommand, tgApi } from './telegram-bot.js'
import { DEFAULT_OPS_MODEL, PLAN_TTL, healthText, opsModel } from './ops-assistant.js'
import { LOGIN_TTL, WA_WEBHOOK_PATH, loginCode, waApi, waMessages, waSigned, waText } from './whatsapp.js'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(HERE, 'data')
const DIST = path.join(HERE, 'dist')
const PORT = Number(process.env.PORT || 5400)
const HOST = process.env.HOST || '127.0.0.1'
fs.mkdirSync(DATA, { recursive: true })

// ------------------------------------------------------------------ JSON storage
const file = (name) => path.join(DATA, name)
function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'))
  } catch {
    return structuredClone(fallback)
  }
}
function save(name, value) {
  const tmp = file(name) + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file(name))
}

const MENU_SEED = [
  { id: 'daging', name: 'Daging', desc: 'Kepingan daging berempah, sos pizza dan keju cair yang melimpah.', price: 16, img: '/pizzas/daging.jpg', tag: 'Paling laris' },
  { id: 'ayam', name: 'Ayam', desc: 'Ayam berperisa, capsicum dan keju cheddar dibakar sampai garing.', price: 16, img: '/pizzas/ayam.jpg' },
  { id: 'isi-ketam', name: 'Isi Ketam', desc: 'Isi ketam, nanas dan keju mozzarella, manis-masin yang seimbang.', price: 16, img: '/pizzas/isi-ketam.jpg' },
  { id: 'meatball', name: 'Meatball', desc: 'Bebola daging juicy, lada benggala dan keju yang meleleh.', price: 20, img: '/pizzas/meatball.jpg' },
  { id: 'tuna', name: 'Tuna', desc: 'Tuna, jagung manis dan cendawan dengan keju cheddar.', price: 20, img: '/pizzas/tuna.jpg' },
  { id: 'hawaii-beef', name: 'Hawaii Beef', desc: 'Daging cincang, nanas, capsicum hijau dan merah. Klasik Hawaii.', price: 20, img: '/pizzas/hawaii-beef.jpg' },
  { id: 'hawaii-chicken', name: 'Hawaii Chicken', desc: 'Ayam, nanas, capsicum dan sos istimewa di atas keju.', price: 20, img: '/pizzas/hawaii-chicken.jpg' },
  { id: 'mix', name: 'Mix', desc: 'Semua sekali: ayam, daging, isi ketam, cendawan, nanas dan capsicum.', price: 20, img: '/pizzas/mix.jpg', tag: 'Untuk yang tak boleh pilih' },
  { id: 'udang', name: 'Udang Solo A', desc: 'Udang besar penuh satu pizza, nanas dan keju. Yang paling premium.', price: 25, img: '/pizzas/udang.jpg', tag: 'Premium' },
].map((m) => ({ available: true, ...m }))

const SETTINGS_SEED = {
  shopName: 'Pizzadonia',
  open: true,
  whatsapp: '', // shop number for customers, e.g. 60123456789
  shop: null, // { lat, lng, label } - set it on the admin page; delivery fees need it
  riderBase: null, // { lat, lng, label } where the rider waits / starts (shown on the admin map)
  delivery: { baseFee: 3, baseKm: 3, perKm: 1, maxKm: 15, freeAbove: 0 },
  minOrder: 0,
  adminPin: '',
  publicUrl: '', // the customer link shown on the admin page = siteUrl if set, else the tunnel link
  siteUrl: '', // fixed front-end address (Netlify), e.g. https://pizzadonia.netlify.app
  tunnelUrl: '', // the ngrok / Cloudflare address of this PC (Netlify passes /api/* to it)
  proxySecret: '', // Netlify adds this header when it passes requests on, so the real customer IP can be trusted
  // how customers can pay. transfer = DuitNow QR image and/or bank account, receipt uploaded on the order page
  payment: { cod: true, transfer: false, bankName: '', accountName: '', accountNumber: '', note: '', qr: '' },
  // staff pages (open on any phone through the public link): kitchen = the pizza supplier, rider = delivery.
  // Empty PIN = that page is switched off.
  staff: { kitchenPin: '', riderPin: '', kitchenName: '', kitchenPhone: '', riderName: '', riderPhone: '',
    kitchenBank: '', kitchenAccountName: '', kitchenAccountNumber: '', kitchenQr: '' },
  adminEmails: ['muhammadaiman20@gmail.com'], // Google accounts that are the owner (admin + seller), from any device
  googleClientId: '', // "Sign in with Google": OAuth Web client ID from Google Cloud Console ('' = button hidden)
  // cashback campaign: percent of the pizza money (after promo, without delivery) back into the customer's wallet
  // when the order is delivered. Dates are inclusive (YYYY-MM-DD, Malaysia time). maxPerOrder 0 = no cap.
  // welcome gift: amount into the wallet when a NEW customer's first order is delivered; spendable on an order
  // of at least minOrder. Once per phone number, ever.
  welcome: { active: false, amount: 5, minOrder: 20 },
  cashback: { active: false, percent: 10, start: '', end: '', minOrder: 0, maxPerOrder: 0, exclude: [] }, // exclude = product ids with no cashback
  // support chat AI: Cloudflare Workers AI (cloud only). Plain chat, no tools; off = built-in replies only.
  aiChat: { enabled: true, model: AI_MODELS[0].id },
  // owner's AI helper in the Telegram bot (ops-assistant.js): reads the shop, changes it only after the owner confirms
  opsAi: { enabled: true, model: DEFAULT_OPS_MODEL },
  // Telegram heads-ups to the owner: payments, new orders, support chats. Pizzadonia's own bot (token pasted on the
  // dashboard, chat linked by /start <code>).
  telegram: { enabled: true, payments: true, orders: true, support: true,
    botToken: '', bot: null, webhookSecret: '', chatId: '', chat: null, link: null, blockedAt: '' },
  // customer login by WhatsApp: the shop's WhatsApp Cloud API number (Meta). Customers send their login code to it.
  // Token + app secret are pasted on the dashboard and never leave the server. number = digits for wa.me links.
  waLogin: { phoneNumberId: '', wabaId: '', token: '', appSecret: '', verifyToken: '', number: '', name: '' },
  // Facebook Page + Instagram DMs (social.js): Page token and app secret stay on the server. mode: draft = owner approves, auto = clean replies go out
  social: { pageId: '', pageName: '', igId: '', igName: '', token: '', appSecret: '', verifyToken: '', mode: 'draft' },
  riderKeepsFee: true, // COD: the rider keeps the delivery fee and banks in the rest (pizza money) to the owner
}

let menu = load('menu.json', MENU_SEED)
let settings = { ...SETTINGS_SEED, ...load('settings.json', SETTINGS_SEED) }
settings.delivery = { ...SETTINGS_SEED.delivery, ...settings.delivery }
settings.payment = { ...SETTINGS_SEED.payment, ...settings.payment }
settings.cashback = { ...SETTINGS_SEED.cashback, ...settings.cashback }
settings.welcome = { ...SETTINGS_SEED.welcome, ...settings.welcome }
// older shops stored another AI provider here; only the on/off switch carries over
settings.aiChat = { enabled: settings.aiChat?.enabled !== false, model: aiModel(settings.aiChat?.model) }
settings.telegram = { ...SETTINGS_SEED.telegram, ...settings.telegram }
settings.opsAi = { enabled: settings.opsAi?.enabled !== false, model: opsModel(settings.opsAi?.model) }
settings.waLogin = { ...SETTINGS_SEED.waLogin, ...settings.waLogin }
settings.social = { ...SETTINGS_SEED.social, ...settings.social }
// fire-and-forget Telegram message for one kind of event (payments | orders | support)
// which bot + chat alerts go to ('' chat until the owner taps Start - then nothing is sent)
function tgCreds() {
  const t = settings.telegram
  return t.botToken ? { mode: 'own', token: t.botToken, chat: t.chatId } : { mode: 'off', token: '', chat: '' }
}
const tgReady = () => Boolean(tgCreds().chat)
const siteBase = () => settings.siteUrl || settings.publicUrl || ''
function tg(kind, text, file) {
  const t = settings.telegram
  if (!t.enabled || t[kind] === false || !tgReady()) return
  // a button under every alert instead of a long link (opens the seller dashboard in the browser)
  const site = siteBase()
  const buttons = site ? [[{ text: '🧑‍💼 Buka dashboard seller', url: `${site}/#/admin` }]] : null
  tgSend(text, file, undefined, buttons, tgCreds()).catch(() => {})
}
const rmT = (v) => 'RM' + (Number(v) || 0).toFixed(2)
const who = (o) => `${o.customer.name} (+${o.customer.phone})`
settings.staff = { ...SETTINGS_SEED.staff, ...settings.staff }
if (!Array.isArray(settings.adminEmails)) settings.adminEmails = SETTINGS_SEED.adminEmails
// owner sessions from "Sign in with Google" (token -> { email, exp }); 30 days
let adminSessions = load('admin-sessions.json', {})
const saveAdminSessions = () => save('admin-sessions.json', adminSessions)
const isAdminEmail = (email) => settings.adminEmails.includes(String(email || '').toLowerCase())
function newAdminSession(email) {
  const token = crypto.randomBytes(24).toString('hex')
  const now = Date.now()
  for (const [t, v] of Object.entries(adminSessions)) if (v.exp < now) delete adminSessions[t]
  adminSessions[token] = { email, exp: now + 30 * 24 * 3600 * 1000 }
  saveAdminSessions()
  console.log(`[admin] Google sign-in ${email}`)
  return token
}
function adminSessionOf(req) {
  const t = String(req.get('x-admin-session') || '')
  const s2 = t && adminSessions[t]
  return s2 && s2.exp > Date.now() && isAdminEmail(s2.email) ? { token: t, email: s2.email } : null
}
const RECEIPTS = path.join(DATA, 'receipts')
fs.mkdirSync(RECEIPTS, { recursive: true })
const PROOFS = path.join(DATA, 'proofs') // rider's photo of the delivered pizza
const BANKINS = path.join(DATA, 'bankins') // rider's bank-in receipts for COD cash
fs.mkdirSync(PROOFS, { recursive: true })
fs.mkdirSync(BANKINS, { recursive: true })
let orders = load('orders.json', [])
// supplier cost per pizza (what we pay the supplier) - used for "pay supplier RM X" and profit on the admin page
const SUPPLIER_COST = { daging: 16, ayam: 16, 'isi-ketam': 16, meatball: 20, tuna: 20, 'hawaii-beef': 20, 'hawaii-chicken': 20, mix: 20, udang: 25 }
for (const m of menu) if (m.cost === undefined) m.cost = SUPPLIER_COST[m.id] ?? 0
let customers = load('customers.json', { accounts: {}, sessions: {} })
// wallets: accounts keyed 'c:<phone>' (customers) or 'rider'; balance = sum of DONE transactions, pending
// withdrawals are held. tx types: topup(+) bonus(+) refund(+) fee(+) adjust(+/-) order(-) withdraw(-)
let bankins = load('bankins.json', []) // [{ id, orders, amount, file, type, at, status: pending|confirmed|rejected, reason }]
let wallets = load('wallets.json', { accounts: {}, tx: [] })
let promos = load('promos.json', []) // [{ code, kind: 'percent'|'fixed', value, minOrder, maxUses, oncePerCustomer, expires, active, createdAt }]
const WALLET_DIR = path.join(DATA, 'wallet')
fs.mkdirSync(WALLET_DIR, { recursive: true })
const saveWallets = () => save('wallets.json', wallets)
const BANKS = ['Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank', 'AmBank', 'Bank Islam', 'Bank Rakyat', 'BSN',
  'Affin Bank', 'Alliance Bank', 'OCBC Bank', 'UOB Bank', 'HSBC Bank', 'Standard Chartered', 'Bank Muamalat', 'Agrobank', 'MBSB Bank',
  'Al Rajhi Bank', 'Kuwait Finance House', 'GXBank', 'AEON Bank', 'Boost Bank', 'Ryt Bank']
const PROMO_TX = ['welcome', 'cashback', 'bonus']
function walletBal(key) {
  let bal = 0
  let held = 0
  let promo = 0
  let welcome = 0
  let spent = 0
  let real = 0
  for (const t of wallets.tx) {
    if (t.wallet !== key) continue
    if (t.status === 'done') {
      bal += t.amount
      if (PROMO_TX.includes(t.type)) promo += t.amount
      else if (t.amount > 0 && t.type !== 'refund') real += t.amount // top-ups, rider fees, + corrections
      if (t.type === 'welcome') welcome += t.amount
      if (t.type === 'order' || t.type === 'withdraw' || (t.type === 'adjust' && t.amount < 0)) spent += -t.amount
      if (t.type === 'refund') spent -= t.amount
    } else if (t.status === 'pending' && t.type === 'withdraw') held += -t.amount
  }
  // orders spend the customer's own money first; gift money is only used once that runs out,
  // and whatever gift money is left can be spent on orders but never withdrawn
  const unspentPromo = Math.max(0, Math.min(promo - Math.max(0, spent - real), bal))
  const unspentWelcome = Math.min(welcome, unspentPromo)
  const available = bal - held
  return { balance: money(bal), held: money(held), available: money(available), unspentPromo: money(unspentPromo),
    unspentWelcome: money(unspentWelcome), withdrawable: money(Math.max(0, available - unspentPromo)) }
}
function addTx(wallet, type, amount, extra = {}) {
  const id = 'TX-' + String(wallets.tx.reduce((m, t) => Math.max(m, Number(t.id.slice(3)) || 0), 0) + 1).padStart(5, '0')
  const t = { id, wallet, type, amount: money(amount), status: 'done', at: new Date().toISOString(), ...extra }
  wallets.tx.push(t)
  return t
}
const txView = ({ id, type, amount, status, at, ref, note, reason }) => ({ id, type, amount, status, at, ref, note, reason })
function walletView(key) {
  const w = wallets.accounts[key]
  if (!w) return null
  return { status: w.status, name: w.name, bankName: w.bankName, accountNumber: w.accountNumber, reason: w.reason || '',
    ...walletBal(key), tx: wallets.tx.filter((t) => t.wallet === key).slice(-60).reverse().map(txView) }
}
function promoCheck(code, subtotal, phone) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) return { ok: false, reason: '' }
  const p = promos.find((x) => x.code === c)
  if (!p || !p.active) return { ok: false, reason: 'Kod promo tidak sah' }
  if (p.expires && Date.now() > new Date(p.expires + 'T23:59:59').getTime()) return { ok: false, reason: 'Kod promo sudah tamat' }
  if (p.minOrder && subtotal < p.minOrder) return { ok: false, reason: `Kod ini untuk pesanan minimum RM${p.minOrder}` }
  const used = orders.filter((o) => o.promo?.code === c && o.status !== 'cancelled')
  if (p.maxUses && used.length >= p.maxUses) return { ok: false, reason: 'Kod promo sudah habis digunakan' }
  if (p.oncePerCustomer && phone && used.some((o) => o.customer.phone === phone)) return { ok: false, reason: 'Anda sudah guna kod ini' }
  const discount = money(Math.min(subtotal, p.kind === 'percent' ? (subtotal * p.value) / 100 : p.value))
  return { ok: true, code: c, discount, label: p.kind === 'percent' ? `${p.value}% off` : `RM${p.value} off` }
} // [{ id, orders, amount, file, type, at, status: pending|confirmed|rejected, reason }]
save('menu.json', menu)
if (!settings.adminPin) {
  settings.adminPin = String(crypto.randomInt(100000, 1000000))
  fs.writeFileSync(file('ADMIN-PIN.txt'), `Pizzadonia admin PIN: ${settings.adminPin}\nChange it on the admin page (Settings).\n`)
}
save('settings.json', settings)

// ------------------------------------------------------------------ delivery fee
const R = 6371
const rad = (d) => (d * Math.PI) / 180
function straightKm(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const routeCache = new Map()
// Road distance from the free OSRM router; if it is slow or down, straight line x 1.3 (a fair road estimate).
async function roadKm(a, b) {
  const key = [a.lat, a.lng, b.lat, b.lng].map((v) => v.toFixed(4)).join(',')
  if (routeCache.has(key)) return routeCache.get(key)
  let out
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Pizzadonia/1.0' } })
    const j = await r.json()
    if (j.code !== 'Ok' || !j.routes?.length) throw new Error('no route')
    out = { km: j.routes[0].distance / 1000, method: 'road' }
  } catch {
    out = { km: straightKm(a, b) * 1.3, method: 'estimate' }
  }
  if (routeCache.size > 2000) routeCache.clear()
  routeCache.set(key, out)
  return out
}
const money = (v) => Math.round(v * 100) / 100

async function quote(point, subtotal = 0) {
  if (!settings.shop) return { ok: false, reason: 'Kedai belum tetapkan lokasi. Sila cuba sebentar lagi.' }
  const { km, method } = await roadKm(settings.shop, point)
  const d = settings.delivery
  const kmR = Math.round(km * 10) / 10
  if (km > d.maxKm) return { ok: false, km: kmR, method, reason: `Maaf, lokasi ini ${kmR} km dari kedai. Kami hantar sehingga ${d.maxKm} km sahaja.` }
  let fee = d.baseFee + Math.max(0, Math.ceil(km - d.baseKm)) * d.perKm
  fee = Math.ceil(fee * 2) / 2 // round up to RM 0.50
  const free = d.freeAbove > 0 && subtotal >= d.freeAbove
  return { ok: true, km: kmR, method, fee: free ? 0 : money(fee), fullFee: money(fee), free }
}

// ------------------------------------------------------------------ helpers
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '')
  if (d.startsWith('0')) d = '6' + d
  return /^60\d{8,11}$/.test(d) ? d : null
}
const validPoint = (p) => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
const sizesOf = (m) => (Array.isArray(m.sizes) && m.sizes.length ? m.sizes : [{ id: '', label: '', price: m.price, cost: m.cost || 0 }])
const publicMenu = () => menu.filter((m) => !m.pendingPrice).map(({ id, name, desc, price, img, tag, available, sizes }) => ({ id, name, desc, price, img, tag, available,
  sizes: (sizes || []).map(({ id: sid, label, price: p }) => ({ id: sid, label, price: p })) }))
function cleanSizes(list) {
  if (!Array.isArray(list)) return null
  const out = []
  for (const z of list.slice(0, 6)) {
    const label = clean(z?.label, 20)
    const price = +z?.price
    const cost = +(z?.cost ?? 0)
    if (!label || !(price > 0 && price <= 1000) || !(cost >= 0 && cost <= 1000)) return null
    const sid = label.toLowerCase().replace(/[^a-z0-9]+/g, '') || String(out.length + 1)
    if (out.some((x) => x.id === sid)) return null
    out.push({ id: sid, label, price: money(price), cost: money(cost) })
  }
  return out
}
const publicShop = () => ({
  shopName: settings.shopName, open: settings.open, whatsapp: settings.whatsapp, minOrder: settings.minOrder,
  shop: settings.shop, delivery: settings.delivery, menu: publicMenu(), payment: publicPayment(), googleClientId: settings.googleClientId || '',
  login: { wa: waReady(), tg: tgLoginReady() }, // phone login channels; WhatsApp on = no more PIN login
  welcome: settings.welcome.active && settings.welcome.amount > 0 ? { amount: settings.welcome.amount, minOrder: settings.welcome.minOrder } : null,
  cashback: cashbackLive() ? { percent: settings.cashback.percent, end: settings.cashback.end, minOrder: settings.cashback.minOrder, maxPerOrder: settings.cashback.maxPerOrder, exclude: settings.cashback.exclude || [] } : null,
})
// ---- cashback campaign
const myDay = (d = new Date()) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10) // Malaysia date
function cashbackLive(at = new Date()) {
  const c = settings.cashback
  if (!c.active || !(c.percent > 0)) return false
  const day = myDay(at)
  return (!c.start || day >= c.start) && (!c.end || day <= c.end)
}
function cashbackFor(o) {
  if (!cashbackLive(new Date(o.createdAt))) return 0
  const c = settings.cashback
  const ex = c.exclude || []
  const eligible = o.items.filter((i) => !ex.includes(i.id)).reduce((s2, i) => s2 + i.line, 0)
  const base = o.subtotal > 0 ? eligible * (1 - (o.discount || 0) / o.subtotal) : 0
  if (c.minOrder && o.subtotal - (o.discount || 0) < c.minOrder) return 0
  let amt = Math.floor(base * c.percent) / 100
  if (c.maxPerOrder > 0) amt = Math.min(amt, c.maxPerOrder)
  return Math.round(amt * 100) / 100
}
// pay the cashback of a delivered order; waits for the wallet if it is not active yet
function giveWelcome(o) {
  const w = settings.welcome
  if (!w.active || !(w.amount > 0) || !o.accountPhone || o.status !== 'done') return
  wallets.welcomed ||= []
  wallets.pendingWelcome ||= {}
  const phone = o.accountPhone
  if (wallets.welcomed.includes(phone)) return
  wallets.welcomed.push(phone)
  const key = 'c:' + phone
  if (wallets.accounts[key]?.status === 'active') addTx(key, 'welcome', w.amount, { ref: o.id, note: `Hadiah pelanggan baru (guna untuk pesanan RM${w.minOrder} ke atas)` })
  else wallets.pendingWelcome[phone] = { amount: w.amount, ref: o.id }
  o.welcome = { amount: w.amount, at: new Date().toISOString() }
  saveWallets()
  console.log(`[welcome] RM${w.amount} for ${phone} (${o.id})`)
}

function giveCashback(o) {
  if (!o.accountPhone || o.cashback?.status === 'credited' || o.status !== 'done') return
  const amount = o.cashback?.amount ?? cashbackFor(o)
  if (!amount) return
  const key = 'c:' + o.accountPhone
  if (wallets.accounts[key]?.status === 'active') {
    addTx(key, 'cashback', amount, { ref: o.id, note: `Cashback ${settings.cashback.percent}%` })
    o.cashback = { amount, status: 'credited', at: new Date().toISOString() }
    saveWallets()
  } else o.cashback = { amount, status: 'waiting_wallet' }
}

function publicPayment() {
  const p = settings.payment
  const transfer = p.transfer && Boolean(p.qr || p.accountNumber)
  return {
    cod: p.cod || !transfer, transfer,
    bankName: transfer ? p.bankName : '', accountName: transfer ? p.accountName : '', accountNumber: transfer ? p.accountNumber : '',
    note: transfer ? p.note : '', qr: transfer && p.qr ? `/api/payment-qr?v=${encodeURIComponent(p.qrAt || '')}` : '',
  }
}
// file type from the first bytes - never trust the name or the Content-Type the browser sent
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' }
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
  if (buf.length > 5 && buf.toString('latin1', 0, 5) === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' }
  return null
}
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }
function nextId() {
  const n = orders.reduce((m, o) => Math.max(m, Number(o.id.slice(3)) || 0), 0) + 1
  return 'PZ-' + String(n).padStart(4, '0')
}
// order steps, in order. supplier_paid = we paid the supplier and the pizza is in their queue.
const STATUSES = ['new', 'confirmed', 'supplier_paid', 'preparing', 'ready', 'delivering', 'done', 'cancelled']
const publicOrder = (o) => ({
  id: o.id, token: o.token, status: o.status, history: o.history, createdAt: o.createdAt,
  items: o.items.map(({ id, name, price, qty, line }) => ({ id, name, price, qty, line })), subtotal: o.subtotal,
  delivery: o.delivery, total: o.total, customer: { name: o.customer.name },
  location: { address: o.location.address, notes: o.location.notes, lat: o.location.lat, lng: o.location.lng },
  shop: settings.shop, shopName: settings.shopName, whatsapp: settings.whatsapp, cancelReason: o.cancelReason || '',
  paymentMethod: o.paymentMethod || 'cod',
  payment: { status: o.payment?.status || 'unpaid', reason: o.payment?.reason || '', paidAt: o.payment?.paidAt || null,
    receipts: (o.payment?.receipts || []).map(({ at, type }) => ({ at, type })) },
  pay: (o.paymentMethod === 'transfer') ? publicPayment() : null, promo: o.promo || null, discount: o.discount || 0, refunded: o.refunded || null,
  proof: o.proof ? { at: o.proof.at } : null,
  cashback: o.cashback || (o.status !== 'cancelled' && o.accountPhone && cashbackFor(o) ? { amount: cashbackFor(o), status: 'promised' } : null),
})
// what the rider owes the owner for one delivered COD order
const owedFor = (o) => money(o.total - (settings.riderKeepsFee ? o.delivery.fee : 0))
const codState = (o) => {
  if ((o.paymentMethod || 'cod') !== 'cod' || o.status !== 'done') return null
  const b = o.cod?.bankin && bankins.find((x) => x.id === o.cod.bankin)
  return b?.status === 'confirmed' ? 'received' : b?.status === 'pending' ? 'pending' : 'with_rider'
}
function checkToken(o, t) {
  t = String(t || '')
  return Boolean(o) && t.length === o.token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(o.token))
}

// simple per-IP limits (orders: 5 per 10 min; admin PIN: 10 wrong tries per 10 min)
const hits = new Map()
function limited(key, max, ms = 10 * 60 * 1000) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((t) => now - t < ms)
  hits.set(key, list)
  return list.length >= max
}
const hit = (key) => hits.get(key)?.push(Date.now()) ?? hits.set(key, [Date.now()])

// customer transaction PIN = their account PIN. Google-only accounts must set one before wallet money moves.
function customerTxOk(req, res, a, pin) {
  if (!a.acc.pin) {
    res.status(428).json({ error: 'Tetapkan PIN transaksi di halaman Dompet dulu.', needPinSetup: true })
    return false
  }
  if (!pin) {
    res.status(428).json({ error: 'Masukkan PIN transaksi', needTxPin: true })
    return false
  }
  if (limited('ctx:' + a.phone, 5, 15 * 60 * 1000)) {
    res.status(429).json({ error: 'Terlalu banyak PIN salah. Transaksi dikunci 15 minit.' })
    return false
  }
  const ok = crypto.timingSafeEqual(Buffer.from(hashPin(String(pin), a.acc.salt), 'hex'), Buffer.from(a.acc.pin, 'hex'))
  if (!ok) {
    hit('ctx:' + a.phone)
    res.status(403).json({ error: 'PIN transaksi salah', needTxPin: true })
    return false
  }
  return true
}

// ------------------------------------------------------------------ customer accounts (phone + PIN)
// An account only ever shows the orders placed while logged in to it, so someone who types another person's
// phone number at checkout can never read that person's older orders.
const saveCustomers = () => save('customers.json', customers)
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex')
function newSession(phone) {
  const token = crypto.randomBytes(24).toString('hex')
  const now = Date.now()
  for (const [t, v] of Object.entries(customers.sessions)) if (v.exp < now) delete customers.sessions[t]
  customers.sessions[token] = { phone, exp: now + 60 * 24 * 3600 * 1000 } // 60 days
  saveCustomers()
  return token
}
function accountOf(req) {
  const t = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const sess = t && customers.sessions[t]
  if (!sess || sess.exp < Date.now()) return null
  const acc = customers.accounts[sess.phone]
  return acc && !acc.blocked ? { token: t, phone: sess.phone, acc } : null
}
const accountView = (phone, acc) => ({
  phone, name: acc.name, addresses: acc.addresses || [], hasPin: Boolean(acc.pin),
  google: acc.google ? { email: acc.google.email, picture: acc.google.picture } : null,
  owner: isAdminEmail(acc.google?.email), // the shop owner's Gmail: the only account that may see the seller link
  orders: orders.filter((o) => o.accountPhone === phone).slice(-50).reverse().map(publicOrder),
})
function rememberAddress(acc, loc) {
  acc.addresses ||= []
  const same = acc.addresses.find((a) => Math.abs(a.lat - loc.lat) < 0.0003 && Math.abs(a.lng - loc.lng) < 0.0003)
  if (same) Object.assign(same, { address: loc.address, notes: loc.notes, used: new Date().toISOString() })
  else acc.addresses.unshift({ id: crypto.randomBytes(4).toString('hex'), lat: loc.lat, lng: loc.lng, address: loc.address, notes: loc.notes, used: new Date().toISOString() })
  acc.addresses = acc.addresses.slice(0, 5)
}

// ------------------------------------------------------------------ app
const app = express()
app.disable('x-powered-by')
// Tailscale serve/funnel proxies from localhost and passes the real visitor IP in X-Forwarded-For.
app.set('trust proxy', 'loopback')
// Requests passed on by Netlify carry our secret + the customer's real IP (x-nf-client-connection-ip).
// Without the secret the header is ignored, so nobody can fake their IP to dodge the rate limits.
app.use((req, _res, next) => {
  const sec = req.get('x-pz-proxy')
  const ip = req.get('x-nf-client-connection-ip')
  if (sec && ip && settings.proxySecret && sec.length === settings.proxySecret.length &&
    crypto.timingSafeEqual(Buffer.from(sec), Buffer.from(settings.proxySecret))) {
    Object.defineProperty(req, 'ip', { value: ip.slice(0, 60), configurable: true })
    req.viaNetlify = true
  }
  next()
})
// rawBody: the WhatsApp webhook checks Meta's signature over the exact bytes
app.use(express.json({ limit: '64kb', verify: (req, _res, buf) => { req.rawBody = buf } }))

app.get('/api/shop', (_req, res) => res.json(publicShop()))

app.post('/api/promo/check', (req, res) => {
  if (limited('promo:' + req.ip, 30)) return res.status(429).json({ ok: false, reason: 'Terlalu banyak cubaan' })
  hit('promo:' + req.ip)
  const a = accountOf(req)
  res.json(promoCheck(req.body?.code, +req.body?.subtotal || 0, a?.phone || normPhone(req.body?.phone)))
})
const walletPayTo = () => ({ bankName: settings.payment.bankName, accountName: settings.payment.accountName, accountNumber: settings.payment.accountNumber,
  qr: settings.payment.qr ? `/api/payment-qr?v=${encodeURIComponent(settings.payment.qrAt || '')}` : '' })
const needAccount = (req, res) => {
  const a = accountOf(req)
  if (!a) res.status(401).json({ error: 'Sila log masuk' })
  return a
}
app.get('/api/wallet', (req, res) => {
  const a = needAccount(req, res)
  if (!a) return
  res.json({ wallet: walletView('c:' + a.phone), payTo: walletPayTo(), banks: BANKS })
})
app.post('/api/wallet/activate', (req, res) => {
  const a = needAccount(req, res)
  if (!a) return
  const key = 'c:' + a.phone
  const w = wallets.accounts[key]
  if (w && ['active', 'pending'].includes(w.status)) return res.status(400).json({ error: 'Permohonan sudah dihantar' })
  const name = clean(req.body?.name, 80)
  const bankName = String(req.body?.bankName || '')
  const accountNumber = String(req.body?.accountNumber || '').replace(/\D/g, '')
  if (name.length < 3) return res.status(400).json({ error: 'Sila isi nama penuh seperti dalam akaun bank' })
  if (!BANKS.includes(bankName)) return res.status(400).json({ error: 'Sila pilih bank' })
  if (!/^\d{8,18}$/.test(accountNumber)) return res.status(400).json({ error: 'No. akaun bank mesti 8 hingga 18 nombor' })
  wallets.accounts[key] = { status: 'pending', name, bankName, accountNumber, phone: a.phone, createdAt: new Date().toISOString(), reason: '' }
  saveWallets()
  res.json({ wallet: walletView(key), payTo: walletPayTo(), banks: BANKS })
})
app.post('/api/wallet/topup', express.raw({ type: () => true, limit: '6mb' }), (req, res) => {
  const a = needAccount(req, res)
  if (!a) return
  const key = 'c:' + a.phone
  if (wallets.accounts[key]?.status !== 'active') return res.status(400).json({ error: 'Dompet belum aktif' })
  const amount = money(+req.query.amount)
  if (!(amount >= 5 && amount <= 2000)) return res.status(400).json({ error: 'Jumlah tambah nilai RM5 hingga RM2000' })
  if (limited('topup:' + a.phone, 10, 60 * 60 * 1000)) return res.status(429).json({ error: 'Terlalu banyak permohonan. Cuba lagi nanti.' })
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const kind = sniff(buf)
  if (!kind) return res.status(400).json({ error: 'Sila hantar gambar resit (JPG/PNG) atau PDF' })
  hit('topup:' + a.phone)
  const file = `W-${crypto.randomBytes(8).toString('hex')}.${kind.ext}`
  fs.writeFileSync(path.join(WALLET_DIR, file), buf)
  addTx(key, 'topup', amount, { status: 'pending', file, ftype: kind.ext, note: 'Tambah nilai' })
  tg('payments', `👛 Tambah nilai dompet ${rmT(amount)}\n${a.acc.name} (+${a.phone})\n\nSemak bank anda, kemudian sahkan di Wallets & promo.`, { path: path.join(WALLET_DIR, file), type: kind.ext })
  saveWallets()
  res.json({ wallet: walletView(key), payTo: walletPayTo(), banks: BANKS })
})
app.post('/api/account/pin', (req, res) => {
  const a = needAccount(req, res)
  if (!a) return
  const pin = String(req.body?.pin || '')
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN mesti 4 hingga 6 nombor' })
  if (['0000', '1234', '1111', '123456', '000000'].includes(pin)) return res.status(400).json({ error: 'PIN ini terlalu mudah diteka. Pilih PIN lain.' })
  if (a.acc.pin && !customerTxOk(req, res, a, req.body?.oldPin)) return
  a.acc.salt = crypto.randomBytes(16).toString('hex')
  a.acc.pin = hashPin(pin, a.acc.salt)
  saveCustomers()
  res.json(accountView(a.phone, a.acc))
})

app.post('/api/wallet/withdraw', (req, res) => {
  const a = needAccount(req, res)
  if (!a) return
  const key = 'c:' + a.phone
  if (wallets.accounts[key]?.status !== 'active') return res.status(400).json({ error: 'Dompet belum aktif' })
  const amount = money(+req.body?.amount)
  const { withdrawable } = walletBal(key)
  if (!(amount >= 5)) return res.status(400).json({ error: 'Minimum pengeluaran RM5' })
  if (!customerTxOk(req, res, a, req.body?.txPin)) return
  if (amount > withdrawable) return res.status(400).json({ error: `Baki boleh dikeluarkan hanya RM${withdrawable.toFixed(2)} (hadiah, bonus & cashback hanya boleh digunakan untuk order)` })
  addTx(key, 'withdraw', -amount, { status: 'pending', note: 'Permohonan refund ke bank' })
  { const w = wallets.accounts[key]; tg('payments', `↩️ Permohonan refund ${rmT(amount)}\n${a.acc.name} (+${a.phone})\nHantar ke: ${w.name} · ${w.bankName} · ${w.accountNumber}`) }
  saveWallets()
  res.json({ wallet: walletView(key), payTo: walletPayTo(), banks: BANKS })
})

app.post('/api/account/register', (req, res) => {
  if (limited('reg:' + req.ip, 5, 60 * 60 * 1000)) return res.status(429).json({ error: 'Terlalu banyak cubaan. Cuba lagi nanti.' })
  const phone = normPhone(req.body?.phone)
  const name = clean(req.body?.name, 60)
  const pin = String(req.body?.pin || '')
  if (!phone) return res.status(400).json({ error: 'Nombor telefon tidak sah (contoh: 012-3456789)' })
  if (name.length < 2) return res.status(400).json({ error: 'Sila isi nama anda' })
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN mesti 4 hingga 6 nombor' })
  if (customers.accounts[phone]) return res.status(409).json({ error: 'Nombor ini sudah ada akaun. Sila log masuk.' })
  hit('reg:' + req.ip)
  const salt = crypto.randomBytes(16).toString('hex')
  customers.accounts[phone] = { name, salt, pin: hashPin(pin, salt), addresses: [], createdAt: new Date().toISOString() }
  const token = newSession(phone)
  res.json({ token, ...accountView(phone, customers.accounts[phone]) })
})
// ---- Sign in with Google: the browser gets a Google ID token, we check it with Google and match the account.
// First time: the customer fills in name + phone (delivery needs a phone). An existing phone account is only
// linked to Google with that account's PIN, so nobody can take over someone else's number.
const googleTickets = new Map() // ticket -> { sub, email, name, picture, exp }
async function verifyGoogle(credential) {
  if (!settings.googleClientId) throw new Error('Google sign-in belum diaktifkan oleh kedai')
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(6000) })
  const t = await r.json().catch(() => ({}))
  if (!r.ok || t.aud !== settings.googleClientId || !['accounts.google.com', 'https://accounts.google.com'].includes(t.iss) ||
    String(t.email_verified) !== 'true' || +t.exp * 1000 < Date.now()) throw new Error('Log masuk Google gagal. Cuba lagi.')
  return { sub: String(t.sub), email: String(t.email || '').toLowerCase(), name: clean(t.name, 80), picture: String(t.picture || '').slice(0, 300) }
}
app.post('/api/account/google', async (req, res) => {
  if (limited('google:' + req.ip, 20)) return res.status(429).json({ error: 'Terlalu banyak cubaan. Cuba lagi nanti.' })
  hit('google:' + req.ip)
  let g
  try {
    g = await verifyGoogle(String(req.body?.credential || ''))
  } catch (e) {
    return res.status(401).json({ error: e.message })
  }
  const found = Object.entries(customers.accounts).find(([, a]) => a.google?.sub === g.sub)
  if (found) {
    const [phone, acc] = found
    if (acc.blocked) return res.status(403).json({ error: 'Akaun ini disekat. Sila hubungi kedai.' })
    acc.google = { ...acc.google, email: g.email, picture: g.picture }
    acc.lastLogin = new Date().toISOString()
    return res.json({ token: newSession(phone), ...accountView(phone, acc), adminSession: isAdminEmail(g.email) ? newAdminSession(g.email) : undefined })
  }
  const ticket = crypto.randomBytes(18).toString('hex')
  for (const [k, v] of googleTickets) if (v.exp < Date.now()) googleTickets.delete(k)
  googleTickets.set(ticket, { ...g, exp: Date.now() + 20 * 60 * 1000 })
  res.json({ needProfile: true, ticket, email: g.email, name: g.name, picture: g.picture, adminSession: isAdminEmail(g.email) ? newAdminSession(g.email) : undefined })
})
app.post('/api/admin/google', async (req, res) => {
  if (limited('google:' + req.ip, 20)) return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' })
  hit('google:' + req.ip)
  let g
  try {
    g = await verifyGoogle(String(req.body?.credential || ''))
  } catch (e) {
    return res.status(401).json({ error: e.message })
  }
  if (!isAdminEmail(g.email)) return res.status(403).json({ error: `${g.email} is not an admin account of this shop` })
  res.json({ session: newAdminSession(g.email), email: g.email, name: g.name, picture: g.picture })
})
app.post('/api/admin/logout', (req, res) => {
  const g = adminSessionOf(req)
  if (g) {
    delete adminSessions[g.token]
    saveAdminSessions()
  }
  res.json({ ok: true })
})

app.post('/api/account/google/complete', (req, res) => {
  const g = googleTickets.get(String(req.body?.ticket || ''))
  if (!g || g.exp < Date.now()) return res.status(400).json({ error: 'Sesi tamat. Tekan "Teruskan dengan Google" semula.' })
  const name = clean(req.body?.name, 60)
  const phone = normPhone(req.body?.phone)
  if (name.length < 2) return res.status(400).json({ error: 'Sila isi nama anda' })
  if (!phone) return res.status(400).json({ error: 'Nombor telefon tidak sah (contoh: 012-3456789)' })
  const existing = customers.accounts[phone]
  if (existing) {
    if (existing.blocked) return res.status(403).json({ error: 'Akaun ini disekat. Sila hubungi kedai.' })
    if (existing.google) return res.status(409).json({ error: 'Nombor ini sudah disambung dengan akaun Google lain.' })
    if (limited('login:' + phone, 5, 15 * 60 * 1000)) return res.status(429).json({ error: 'Terlalu banyak cubaan salah. Tunggu 15 minit.' })
    const pin = String(req.body?.pin || '')
    const ok = existing.pin && pin && crypto.timingSafeEqual(Buffer.from(hashPin(pin, existing.salt), 'hex'), Buffer.from(existing.pin, 'hex'))
    if (!ok) {
      if (pin) hit('login:' + phone)
      return res.status(409).json({ needPin: true, error: 'Nombor ini sudah ada akaun. Masukkan PIN akaun itu untuk sambung dengan Google.' })
    }
    existing.google = { sub: g.sub, email: g.email, picture: g.picture, linkedAt: new Date().toISOString() }
  } else {
    customers.accounts[phone] = { name, salt: '', pin: '', addresses: [], createdAt: new Date().toISOString(),
      google: { sub: g.sub, email: g.email, picture: g.picture, linkedAt: new Date().toISOString() } }
  }
  googleTickets.delete(String(req.body.ticket))
  customers.accounts[phone].lastLogin = new Date().toISOString()
  res.json({ token: newSession(phone), ...accountView(phone, customers.accounts[phone]), adminSession: isAdminEmail(g.email) ? newAdminSession(g.email) : undefined })
})

app.post('/api/account/login', (req, res) => {
  const phone = normPhone(req.body?.phone)
  if (!phone) return res.status(400).json({ error: 'Nombor telefon tidak sah' })
  if (limited('login:' + phone, 5, 15 * 60 * 1000) || limited('login-ip:' + req.ip, 20, 15 * 60 * 1000))
    return res.status(429).json({ error: 'Terlalu banyak cubaan salah. Tunggu 15 minit.' })
  const acc = customers.accounts[phone]
  const ok = acc && acc.pin && !acc.blocked && crypto.timingSafeEqual(Buffer.from(hashPin(String(req.body?.pin || ''), acc.salt), 'hex'), Buffer.from(acc.pin, 'hex'))
  if (!ok) {
    hit('login:' + phone)
    hit('login-ip:' + req.ip)
    return res.status(401).json({ error: 'Nombor telefon atau PIN salah' })
  }
  res.json({ token: newSession(phone), ...accountView(phone, acc) })
})
// ---- phone login by WhatsApp or Telegram (no PIN). The page asks for a code; the customer sends it from their own
// WhatsApp, or opens the bot and shares their Telegram contact. Either way the phone number comes from WhatsApp /
// Telegram, not from what was typed. The page polls GET /api/account/phone-login/:id and signs in by itself.
// The id is the browser's secret; the 6-digit code alone can't sign anyone in.
const waReady = () => Boolean(settings.waLogin.token && settings.waLogin.phoneNumberId && settings.waLogin.appSecret && settings.waLogin.number)
const tgLoginReady = () => Boolean(settings.telegram.botToken && settings.telegram.bot?.username)
const showPhone = (p) => '0' + String(p).replace(/^60/, '')
function phoneLogins() {
  const p = load('phone-logins.json', { reqs: {}, seen: [], lastInboundAt: 0 })
  for (const [k, v] of Object.entries(p.reqs)) if (v.exp < Date.now()) delete p.reqs[k]
  return p
}
const savePhoneLogins = (p) => save('phone-logins.json', p)
const waitingLogin = (p, channel, code) => Object.values(p.reqs).find((r) => r.channel === channel && r.code === code && !r.phone)
// the phone is proven: the page picks it up on its next poll (fresh 10 minutes to type a name if the account is new)
function provePhone(p, r, phone, tgId) {
  Object.assign(r, { phone, exp: Date.now() + LOGIN_TTL }, tgId ? { tgId } : {})
  savePhoneLogins(p)
}
app.post('/api/account/phone-login', (req, res) => {
  const channel = req.body?.channel === 'tg' ? 'tg' : 'wa'
  if (channel === 'wa' ? !waReady() : !tgLoginReady())
    return res.status(400).json({ error: `Log masuk ${channel === 'wa' ? 'WhatsApp' : 'Telegram'} belum diaktifkan oleh kedai.` })
  if (limited('plogin:' + req.ip, 10)) return res.status(429).json({ error: 'Terlalu banyak cubaan. Cuba lagi dalam beberapa minit.' })
  hit('plogin:' + req.ip)
  const p = phoneLogins()
  let code
  do code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
  while (Object.values(p.reqs).some((r) => r.code === code))
  const id = crypto.randomBytes(18).toString('base64url')
  p.reqs[id] = { id, channel, code, exp: Date.now() + LOGIN_TTL }
  savePhoneLogins(p)
  const links = channel === 'wa'
    ? { web: `https://wa.me/${settings.waLogin.number}?text=${encodeURIComponent(`Kod log masuk ${settings.shopName}: ${code}`)}` }
    : linkUrls(settings.telegram.bot.username, 'L' + code)
  res.json({ id, channel, code, exp: p.reqs[id].exp, ...links })
})
function finishPhoneLogin(p, r, res) {
  const acc = customers.accounts[r.phone]
  delete p.reqs[r.id]
  savePhoneLogins(p)
  if (acc.blocked) return res.status(403).json({ error: 'Akaun ini disekat. Sila hubungi kedai.' })
  if (r.tgId) acc.telegram = { id: r.tgId, linkedAt: new Date().toISOString() } // next time: no contact sharing needed
  acc.lastLogin = new Date().toISOString()
  res.json({ token: newSession(r.phone), ...accountView(r.phone, acc) })
}
app.get('/api/account/phone-login/:id', (req, res) => {
  const p = phoneLogins()
  const r = p.reqs[req.params.id]
  if (!r) return res.status(410).json({ error: 'Kod sudah tamat. Tekan butang log masuk sekali lagi.', expired: true })
  if (!r.phone) return res.json({ state: 'waiting', exp: r.exp })
  if (!customers.accounts[r.phone]) return res.json({ state: 'needName', phone: r.phone, exp: r.exp })
  finishPhoneLogin(p, r, res)
})
// a new number: one name, then signed in
app.post('/api/account/phone-login/:id/name', (req, res) => {
  const p = phoneLogins()
  const r = p.reqs[req.params.id]
  if (!r?.phone) return res.status(410).json({ error: 'Kod sudah tamat. Tekan butang log masuk sekali lagi.', expired: true })
  if (!customers.accounts[r.phone]) {
    const name = clean(req.body?.name, 60)
    if (name.length < 2) return res.status(400).json({ error: 'Sila isi nama anda' })
    customers.accounts[r.phone] = { name, salt: '', pin: '', addresses: [], createdAt: new Date().toISOString() }
  }
  finishPhoneLogin(p, r, res)
})
// Telegram half: "/start L<code>" opens a login; the customer's own shared contact proves the number.
// A Telegram account that logged in before skips the contact step.
async function tgLogin(m, code) {
  const t = settings.telegram
  const site = siteBase()
  const from = String(m.from?.id || '')
  const send = (text, markup) => tgApi(t.botToken, 'sendMessage', { chat_id: m.chat.id, text, disable_web_page_preview: true, reply_markup: markup || { remove_keyboard: true } })
  const again = `Tekan "Log masuk dengan Telegram" di laman ${settings.shopName} sekali lagi.`
  const p = phoneLogins()
  const proven = (r, phone) => {
    provePhone(p, r, phone, from)
    return send(`✅ Nombor ${showPhone(phone)} disahkan.\n\nKembali ke laman ${settings.shopName} - anda sudah log masuk.${site ? '\n' + site + '/#/akaun' : ''}`)
  }
  if (code) {
    const r = waitingLogin(p, 'tg', code)
    if (!r) return send(`⚠️ Pautan log masuk ini sudah tamat. ${again}`)
    const known = Object.entries(customers.accounts).find(([, a]) => a.telegram?.id === from)
    if (known) return proven(r, known[0])
    r.tgFrom = from
    savePhoneLogins(p)
    return send('Satu langkah lagi: tekan butang di bawah untuk kongsi nombor telefon anda.\nKami guna nombor ini untuk log masuk dan penghantaran sahaja.',
      { keyboard: [[{ text: '📱 Kongsi nombor telefon saya', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true })
  }
  // a shared contact: must be the sender's own (someone else's contact card proves nothing)
  if (String(m.contact.user_id || '') !== from) return send('⚠️ Sila kongsi nombor anda sendiri dengan butang "Kongsi nombor telefon saya".')
  const r = Object.values(p.reqs).filter((x) => x.channel === 'tg' && x.tgFrom === from && !x.phone).sort((a, b) => b.exp - a.exp)[0]
  if (!r) return send(`⚠️ Tiada log masuk yang menunggu. ${again}`)
  const phone = normPhone(m.contact.phone_number)
  if (!phone) return send('Maaf, hanya nombor telefon Malaysia boleh log masuk.')
  return proven(r, phone)
}
app.get('/api/account', (req, res) => {
  const a = accountOf(req)
  if (!a) return res.status(401).json({ error: 'Sila log masuk' })
  res.json(accountView(a.phone, a.acc))
})
app.post('/api/account/logout', (req, res) => {
  const a = accountOf(req)
  if (a) {
    delete customers.sessions[a.token]
    saveCustomers()
  }
  res.json({ ok: true })
})
app.delete('/api/account/addresses/:id', (req, res) => {
  const a = accountOf(req)
  if (!a) return res.status(401).json({ error: 'Sila log masuk' })
  a.acc.addresses = (a.acc.addresses || []).filter((x) => x.id !== req.params.id)
  saveCustomers()
  res.json(accountView(a.phone, a.acc))
})

app.post('/api/quote', async (req, res) => {
  const p = { lat: +req.body?.lat, lng: +req.body?.lng }
  if (!validPoint(p)) return res.status(400).json({ ok: false, reason: 'Lokasi tidak sah' })
  res.json(await quote(p, +req.body?.subtotal || 0))
})

app.post('/api/orders', async (req, res) => {
  const ip = req.ip
  if (limited('order:' + ip, 5)) return res.status(429).json({ error: 'Terlalu banyak pesanan. Cuba lagi dalam beberapa minit.' })
  if (!settings.open) return res.status(400).json({ error: 'Maaf, kedai sedang tutup sekarang.' })
  const b = req.body || {}
  const lines = Array.isArray(b.items) ? b.items.slice(0, 30) : []
  const items = []
  for (const l of lines) {
    const m = menu.find((x) => x.id === l?.id)
    const qty = Math.floor(+l?.qty)
    if (!m || !m.available || m.pendingPrice) return res.status(400).json({ error: `${m?.name || 'Satu item'} sudah habis. Sila buang dari troli.` })
    if (!(qty >= 1 && qty <= 20)) return res.status(400).json({ error: 'Kuantiti tidak sah' })
    const sizes = sizesOf(m)
    const z = sizes.find((x) => x.id === String(l.size ?? '')) || (sizes.length === 1 || !l.size ? sizes[0] : null)
    if (!z) return res.status(400).json({ error: `Saiz untuk ${m.name} tidak sah. Sila pilih semula.` })
    const prev = items.find((x) => x.id === m.id && (x.size || '') === z.id)
    if (prev) { prev.qty = Math.min(20, prev.qty + qty); prev.line = money(prev.qty * prev.price) }
    else items.push({ id: m.id, size: z.id, name: z.label ? `${m.name} (${z.label})` : m.name, price: z.price, cost: z.cost || 0, qty, line: money(z.price * qty) })
  }
  if (!items.length) return res.status(400).json({ error: 'Troli kosong' })
  const account = accountOf(req)
  const name = clean(b.customer?.name, 60)
  const phone = account ? account.phone : normPhone(b.customer?.phone)
  if (name.length < 2) return res.status(400).json({ error: 'Sila isi nama anda' })
  if (!phone) return res.status(400).json({ error: 'Nombor telefon tidak sah (contoh: 012-3456789)' })
  if (customers.accounts[phone]?.blocked || (settings.blockedPhones || []).includes(phone)) return res.status(403).json({ error: 'Maaf, akaun ini tidak boleh membuat pesanan. Sila hubungi kedai.' })
  const loc = b.location || {}
  if (!validPoint(loc)) return res.status(400).json({ error: 'Sila pin lokasi penghantaran pada peta' })
  const address = clean(loc.address, 300)
  if (address.length < 5) return res.status(400).json({ error: 'Sila isi alamat (no. rumah, jalan, taman)' })
  const subtotal = money(items.reduce((s, x) => s + x.line, 0))
  if (settings.minOrder > 0 && subtotal < settings.minOrder) return res.status(400).json({ error: `Minimum pesanan RM${settings.minOrder}` })
  const q = await quote({ lat: +loc.lat, lng: +loc.lng }, subtotal)
  if (!q.ok) return res.status(400).json({ error: q.reason })
  const pay = publicPayment()
  const paymentMethod = ['transfer', 'wallet'].includes(b.paymentMethod) ? b.paymentMethod : 'cod'
  if (paymentMethod === 'transfer' && !pay.transfer) return res.status(400).json({ error: 'Pindahan bank tidak tersedia sekarang. Sila pilih COD.' })
  let promo = null
  if (b.promoCode) {
    const pc = promoCheck(b.promoCode, subtotal, phone)
    if (!pc.ok) return res.status(400).json({ error: pc.reason })
    promo = { code: pc.code, discount: pc.discount, label: pc.label }
  }
  const discount = promo?.discount || 0
  const walletKey = account ? 'c:' + account.phone : null
  if (paymentMethod === 'wallet') {
    if (!walletKey || wallets.accounts[walletKey]?.status !== 'active') return res.status(400).json({ error: 'Dompet belum aktif. Sila pilih cara bayaran lain.' })
    if (!customerTxOk(req, res, account, b.txPin)) return
    const wb = walletBal(walletKey)
    const welcomeOk = subtotal - discount >= (settings.welcome.minOrder || 0)
    const usable = welcomeOk ? wb.available : wb.available - wb.unspentWelcome
    if (usable < money(subtotal - discount + q.fee))
      return res.status(400).json({ error: !welcomeOk && wb.unspentWelcome > 0 && wb.available >= money(subtotal - discount + q.fee)
        ? `Hadiah RM${wb.unspentWelcome.toFixed(2)} hanya untuk pesanan pizza RM${settings.welcome.minOrder} ke atas.`
        : 'Baki dompet tidak cukup. Sila tambah nilai atau pilih cara lain.' })
  }
  if (paymentMethod === 'cod' && !pay.cod) return res.status(400).json({ error: 'COD tidak tersedia. Sila pilih pindahan bank.' })
  const now = new Date().toISOString()
  const order = {
    id: nextId(), token: crypto.randomBytes(12).toString('hex'), status: 'new', createdAt: now,
    history: [{ status: 'new', at: now }], items, subtotal,
    delivery: { km: q.km, fee: q.fee, method: q.method, free: q.free }, total: money(subtotal - discount + q.fee), paymentMethod, payment: { status: 'unpaid', receipts: [] }, promo, discount,
    customer: { name, phone }, location: { lat: +loc.lat, lng: +loc.lng, address, notes: clean(loc.notes, 200) },
    note: clean(b.note, 300),
    supplierCost: money(items.reduce((s, x) => s + x.cost * x.qty, 0)), accountPhone: account?.phone || null,
  }
  if (account) {
    rememberAddress(account.acc, order.location)
    if (name !== account.acc.name) account.acc.name = name
    saveCustomers()
  }
  if (paymentMethod === 'wallet') {
    addTx(walletKey, 'order', -order.total, { ref: order.id, note: 'Bayar pesanan' })
    order.payment = { status: 'paid', paidAt: order.createdAt, receipts: [], by: 'wallet' }
    saveWallets()
  }
  hit('order:' + ip)
  orders.push(order)
  save('orders.json', orders)
  console.log(`[order] ${order.id} RM${order.total} ${name} ${q.km} km`)
  if (paymentMethod === 'wallet') tg('payments', `👛 Dibayar dengan dompet\n${order.id} · ${who(order)}\n${rmT(order.total)} (sudah dibayar)`)
  tg('orders', `🍕 Pesanan baru ${order.id}\n${who(order)}\n${order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}\n${rmT(order.total)} · ${paymentMethod === 'cod' ? 'COD (tunai)' : paymentMethod === 'wallet' ? 'dompet' : 'pindahan bank'} · ${q.km} km`)
  res.json({ id: order.id, token: order.token, total: order.total })
})

app.get('/api/orders/:id', (req, res) => {
  const o = orders.find((x) => x.id === req.params.id)
  if (!checkToken(o, req.query.t)) return res.status(404).json({ error: 'Pesanan tidak dijumpai' })
  res.json(publicOrder(o))
})

// customer uploads a payment receipt (photo / screenshot / PDF), raw body, max 6 MB
app.post('/api/orders/:id/receipt', express.raw({ type: () => true, limit: '6mb' }), (req, res) => {
  const o = orders.find((x) => x.id === req.params.id)
  if (!checkToken(o, req.query.t)) return res.status(404).json({ error: 'Pesanan tidak dijumpai' })
  if (limited('receipt:' + req.ip, 10, 60 * 60 * 1000)) return res.status(429).json({ error: 'Terlalu banyak muat naik. Cuba lagi nanti.' })
  if (o.status === 'cancelled') return res.status(400).json({ error: 'Pesanan ini sudah dibatalkan' })
  if (o.payment?.status === 'paid') return res.status(400).json({ error: 'Bayaran sudah disahkan' })
  if ((o.payment?.receipts || []).length >= 5) return res.status(400).json({ error: 'Maksimum 5 resit. Sila WhatsApp kedai.' })
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const kind = sniff(buf)
  if (!kind) return res.status(400).json({ error: 'Sila hantar gambar (JPG/PNG) atau PDF' })
  hit('receipt:' + req.ip)
  o.payment ||= { status: 'unpaid', receipts: [] }
  const name = `${o.id}-${crypto.randomBytes(6).toString('hex')}.${kind.ext}`
  fs.writeFileSync(path.join(RECEIPTS, name), buf)
  o.payment.receipts.push({ file: name, at: new Date().toISOString(), type: kind.ext, size: buf.length })
  o.payment.status = 'pending'
  o.payment.reason = ''
  save('orders.json', orders)
  console.log(`[receipt] ${o.id} ${kind.ext} ${Math.round(buf.length / 1024)} KB`)
  tg('payments', `💳 Resit bayaran diterima\n${o.id} · ${who(o)}\nJumlah: ${rmT(o.total)} (pindahan bank)\n\nSemak bank anda, kemudian tekan "Payment received" di dashboard.`, { path: path.join(RECEIPTS, name), type: kind.ext })
  res.json(publicOrder(o))
})

app.get('/api/orders/:id/proof', (req, res) => {
  const o = orders.find((x) => x.id === req.params.id)
  if (!checkToken(o, req.query.t) || !o.proof) return res.status(404).json({ error: 'Tiada gambar' })
  res.set('Cache-Control', 'private, max-age=3600').type(MIME[o.proof.type]).send(fs.readFileSync(path.join(PROOFS, o.proof.file)))
})

app.get('/api/payment-qr', (_req, res) => {
  const f = settings.payment.qr && path.join(DATA, settings.payment.qr)
  if (!f || !fs.existsSync(f)) return res.status(404).json({ error: 'Tiada QR' })
  res.set('Cache-Control', 'public, max-age=300').type(MIME[path.extname(f).slice(1)] || 'application/octet-stream').send(fs.readFileSync(f))
})

// ---- admin (header x-admin-pin)
// The seller page only works from this PC or from the owner's private Tailscale link: Tailscale adds
// Tailscale-User-Login on tailnet requests, never on public (Funnel) ones. Direct local requests have no XFF.
// Anything that came through the public Cloudflare tunnel (cf-ray / cf-connecting-ip) is never private.
const privateRequest = (req) =>
  !req.get('cf-ray') && !req.get('cf-connecting-ip') &&
  (Boolean(req.get('tailscale-user-login')) || (!req.get('x-forwarded-for') && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)))
function admin(req, res, next) {
  // owner signed in with Google: works from any device, also through the public link
  const g = adminSessionOf(req)
  if (g) {
    req.adminEmail = g.email
    return next()
  }
  // PIN: only on this PC / the private Tailscale link
  if (!privateRequest(req)) return res.status(403).json({ error: 'The seller page only opens on your own devices (PC or your Tailscale link) - or sign in with your Google account.' })
  const key = 'pin:' + req.ip
  if (limited(key, 10) || limited('pin:all', 30)) return res.status(429).json({ error: 'Too many wrong PINs. Wait 10 minutes.' })
  const got = Buffer.from(String(req.get('x-admin-pin') || ''))
  const want = Buffer.from(settings.adminPin)
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    hit(key)
    hit('pin:all')
    return res.status(401).json({ error: 'Wrong PIN' })
  }
  next()
}
// ---- transaction PIN (like a bank): every money action needs the owner PIN again, even when signed in with
// Google. Missing -> 428 (the app shows the PIN pad), wrong -> 403 (never 401, that would log the owner out).
// 5 wrong in 15 min per device (20 overall) locks money actions.
function txOk(req, res) {
  const got = String(req.get('x-admin-txpin') || '')
  if (!got) {
    res.status(428).json({ error: 'Transaction PIN needed', needTxPin: true })
    return false
  }
  const key = 'txpin:' + req.ip
  if (limited(key, 5, 15 * 60 * 1000) || limited('txpin:all', 20, 15 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many wrong transaction PINs. Money actions are locked for 15 minutes.' })
    return false
  }
  const want = Buffer.from(settings.adminPin)
  if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), want)) {
    hit(key)
    hit('txpin:all')
    res.status(403).json({ error: 'Wrong transaction PIN', needTxPin: true })
    return false
  }
  return true
}
const adminTx = (req, res, next) => (txOk(req, res) ? next() : undefined)

// ---- staff: kitchen (supplier) and rider. They only see what their job needs and can only move orders
// one step forward inside their own part of the flow.
const STAFF = {
  kitchen: { list: ['supplier_paid', 'preparing', 'ready'], moves: { supplier_paid: 'preparing', preparing: 'ready' } },
  rider: { list: ['ready', 'delivering'], moves: { ready: 'delivering', delivering: 'done' } },
}
function staff(req, res, next) {
  const key = 'staffpin:' + req.ip
  if (limited(key, 10) || limited('staffpin:all', 50)) return res.status(429).json({ error: 'Terlalu banyak PIN salah. Tunggu 10 minit.' })
  const got = String(req.get('x-staff-pin') || '')
  const same = (want) => want && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))
  // the page decides the role (/api/staff/kitchen... or /api/staff/rider...), so both jobs may share one PIN
  const want = req.params.role || (req.originalUrl.startsWith('/api/staff/rider') ? 'rider' : req.originalUrl.startsWith('/api/staff/kitchen') ? 'kitchen' : null)
  const role = want === 'kitchen' && same(settings.staff.kitchenPin) ? 'kitchen' : want === 'rider' && same(settings.staff.riderPin) ? 'rider' : null
  if (!role) {
    hit(key)
    hit('staffpin:all')
    return res.status(401).json({ error: 'PIN salah' })
  }
  req.role = role
  next()
}
const todayStr = () => new Date().toDateString()
function staffView(o, role) {
  const base = { id: o.id, status: o.status, createdAt: o.createdAt, note: o.note, history: o.history,
    items: o.items.map(({ name, qty }) => ({ name, qty })), customerName: o.customer.name }
  if (role === 'kitchen') return { ...base, supplierCost: o.supplierCost ?? 0 }
  const cod = (o.paymentMethod || 'cod') === 'cod'
  return { ...base, phone: o.customer.phone, location: o.location, total: o.total, km: o.delivery.km, fee: o.delivery.fee,
    cod, paid: o.payment?.status === 'paid', collect: cod && o.payment?.status !== 'paid' ? o.total : 0,
    owed: cod ? owedFor(o) : 0, cash: codState(o), proof: Boolean(o.proof) }
}
function riderCash() {
  const owing = orders.filter((o) => codState(o) === 'with_rider')
  return {
    owing: owing.map((o) => ({ id: o.id, total: o.total, owed: owedFor(o), at: o.proof?.at || o.createdAt })),
    amount: money(owing.reduce((s, o) => s + owedFor(o), 0)),
    keepsFee: settings.riderKeepsFee,
    bankins: bankins.slice(-10).reverse().map(({ id, amount, orders: ids, at, status, reason }) => ({ id, amount, orders: ids, at, status, reason })),
    pay: { bankName: settings.payment.bankName, accountName: settings.payment.accountName, accountNumber: settings.payment.accountNumber,
      qr: settings.payment.qr ? `/api/payment-qr?v=${encodeURIComponent(settings.payment.qrAt || '')}` : '' },
  }
}
app.get('/api/staff/:role', staff, (req, res) => {
  const cfg = STAFF[req.role]
  const active = orders.filter((o) => cfg.list.includes(o.status))
  const doneToday = orders.filter((o) => new Date(o.createdAt).toDateString() === todayStr() &&
    (req.role === 'kitchen' ? ['delivering', 'done'] : ['done']).includes(o.status))
  res.json({ role: req.role, defaultPin: settings.staff[req.role === 'kitchen' ? 'kitchenPin' : 'riderPin'] === '0000', shopName: settings.shopName, shop: settings.shop, whatsapp: settings.whatsapp,
    orders: active.map((o) => staffView(o, req.role)), done: doneToday.slice(-30).reverse().map((o) => staffView(o, req.role)),
    cash: req.role === 'rider' ? riderCash() : undefined,
    wallet: req.role === 'rider' ? { ...(walletView('rider') || { status: 'active', ...walletBal('rider'), tx: [] }), banks: BANKS } : undefined,
    statement: req.role === 'kitchen' ? kitchenStatement() : undefined,
    menu: req.role === 'kitchen' ? menu.map(({ id, name, desc, img, available, sizes, cost, pendingPrice }) => ({ id, name, desc, img, available, pendingPrice: Boolean(pendingPrice),
      sizes: (sizes || []).map((z) => ({ id: z.id, label: z.label, cost: z.cost })), cost: sizes?.length ? undefined : cost })) : undefined })
})
// supplier statement: every order the owner paid the supplier for (time of the supplier_paid step)
function kitchenStatement() {
  const rows = []
  for (const o of orders) {
    const h = o.history.find((x) => x.status === 'supplier_paid')
    if (h && o.status !== 'cancelled') rows.push({ id: o.id, amount: o.supplierCost ?? 0, at: h.at })
  }
  const since = (d) => new Date(new Date().toDateString()).getTime() - (d - 1) * 86400000
  const total = (d) => money(rows.filter((r) => new Date(r.at).getTime() >= since(d)).reduce((s2, r) => s2 + r.amount, 0))
  return { today: total(1), week: total(7), month: total(30), rows: rows.slice(-40).reverse() }
}
app.post('/api/staff/:role/pin', staff, (req, res) => {
  const pin = String(req.body?.pin || '')
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN mesti 4 hingga 8 nombor' })
  if (pin === '0000') return res.status(400).json({ error: 'Pilih PIN selain 0000' })
  settings.staff[req.role === 'kitchen' ? 'kitchenPin' : 'riderPin'] = pin
  save('settings.json', settings)
  console.log(`[${req.role}] changed own PIN`)
  res.json({ ok: true })
})
// kitchen marks a pizza available / sold out (shows on the shop at once; owner gets a Telegram heads-up)
// ---- kitchen manages products: name, description, sizes + modal (what the owner pays the kitchen), photo.
// Selling prices stay with the owner: a new product / new size waits hidden until the owner sets its price.
function kitchenSizes(list, old = []) {
  if (!Array.isArray(list) || !list.length || list.length > 6) return null
  const out = []
  for (const z of list) {
    const label = clean(z?.label, 20)
    const cost = +z?.cost
    if (!label || !(cost > 0 && cost <= 1000)) return null
    const prev = old.find((o) => (z.id && o.id === z.id) || o.label.toLowerCase() === label.toLowerCase())
    const sid = prev?.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '') || String(out.length + 1)
    if (out.some((x) => x.id === sid)) return null
    out.push({ id: sid, label, price: prev?.price || 0, cost: money(cost) })
  }
  return out
}
const kitchenOnly = (req, res, next) => (req.role === 'kitchen' ? next() : res.status(403).json({ error: 'Untuk dapur sahaja' }))
app.post('/api/staff/kitchen/products', staff, kitchenOnly, (req, res) => {
  const b = req.body || {}
  const name = clean(b.name, 40)
  if (name.length < 2) return res.status(400).json({ error: 'Nama menu terlalu pendek' })
  const sizes = kitchenSizes(b.sizes)
  if (!sizes) return res.status(400).json({ error: 'Setiap saiz perlu nama (cth 8 inci) dan harga modal' })
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
  for (let n = 2; menu.some((x) => x.id === id); n++) id = id.replace(/-\d+$/, '') + '-' + n
  const m = { id, name, desc: clean(b.desc, 200), price: 0, cost: sizes[0].cost, img: '/logo.svg', tag: 'Baru!', available: true, sizes, pendingPrice: true, addedBy: 'kitchen', createdAt: new Date().toISOString() }
  menu.push(m)
  save('menu.json', menu)
  console.log(`[kitchen] new product ${id}`)
  tg('orders', `🆕 Dapur tambah menu baru: ${name}\n${sizes.map((z) => `${z.label}: modal ${rmT(z.cost)}`).join('\n')}\n\n⚠️ Tersembunyi daripada pelanggan sehingga anda letak harga jualan (Menu → Edit).`)
  res.json({ ok: true, id })
})
app.put('/api/staff/kitchen/products/:id', staff, kitchenOnly, (req, res) => {
  const m = menu.find((x) => x.id === req.params.id)
  if (!m) return res.status(404).json({ error: 'Menu tidak dijumpai' })
  const b = req.body || {}
  const changes = []
  if (b.name !== undefined) {
    const name = clean(b.name, 40)
    if (name.length < 2) return res.status(400).json({ error: 'Nama menu terlalu pendek' })
    if (name !== m.name) changes.push(`nama: ${m.name} → ${name}`)
    m.name = name
  }
  if (b.desc !== undefined) m.desc = clean(b.desc, 200)
  if (b.sizes !== undefined) {
    const old = m.sizes?.length ? m.sizes : [{ id: '', label: 'Biasa', price: m.price, cost: m.cost || 0 }]
    const sizes = kitchenSizes(b.sizes, old)
    if (!sizes) return res.status(400).json({ error: 'Setiap saiz perlu nama dan harga modal' })
    for (const z of sizes) {
      const prev = old.find((o) => o.id === z.id)
      if (!prev) changes.push(`saiz baru ${z.label}: modal ${rmT(z.cost)} (perlu harga jualan)`)
      else if (prev.cost !== z.cost) changes.push(`${z.label}: modal ${rmT(prev.cost)} → ${rmT(z.cost)}${z.price ? ` (jualan ${rmT(z.price)}, untung ${rmT(z.price - z.cost)})` : ''}`)
    }
    // sizes the kitchen dropped stay with the owner (only the owner removes a size)
    for (const o of old) if (o.id && !sizes.some((z) => z.id === o.id)) sizes.push(o)
    m.sizes = sizes.filter((z) => z.id !== '' || sizes.length === 1)
    m.cost = m.sizes[0].cost
    if (m.sizes.some((z) => !(z.price > 0))) m.pendingPrice = true
    m.costChangedAt = new Date().toISOString()
  }
  save('menu.json', menu)
  if (changes.length) {
    console.log(`[kitchen] ${m.id}: ${changes.join('; ')}`)
    tg('orders', `✏️ Dapur ubah menu ${m.name}\n${changes.join('\n')}${m.pendingPrice ? '\n\n⚠️ Perlu harga jualan sebelum pelanggan boleh order.' : ''}`)
  }
  res.json({ ok: true })
})
app.post('/api/staff/kitchen/products/:id/photo', staff, kitchenOnly, express.raw({ type: () => true, limit: '8mb' }), (req, res) => {
  const m = menu.find((x) => x.id === req.params.id)
  if (!m) return res.status(404).json({ error: 'Menu tidak dijumpai' })
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const kind = sniff(buf)
  if (!kind || kind.ext === 'pdf') return res.status(400).json({ error: 'Sila hantar gambar (JPG/PNG)' })
  const file = `${m.id}-${crypto.randomBytes(5).toString('hex')}.${kind.ext}`
  fs.writeFileSync(path.join(MENU_PHOTOS, file), buf)
  m.img = `/api/menu-photo/${file}`
  save('menu.json', menu)
  res.json({ ok: true, img: m.img })
})

app.post('/api/staff/kitchen/menu/:id', staff, (req, res) => {
  if (req.role !== 'kitchen') return res.status(403).json({ error: 'Untuk dapur sahaja' })
  const m = menu.find((x) => x.id === req.params.id)
  if (!m) return res.status(404).json({ error: 'Menu tidak dijumpai' })
  const on = Boolean(req.body?.available)
  if (m.available !== on) {
    m.available = on
    save('menu.json', menu)
    console.log(`[kitchen] ${m.name} -> ${on ? 'available' : 'sold out'}`)
    tg('orders', on ? `🟢 Dapur: ${m.name} ADA semula` : `🔴 Dapur: ${m.name} HABIS (disembunyikan dari pelanggan)`)
  }
  res.json({ id: m.id, available: m.available })
})
const riderOnly = (req, res, next) => (req.role === 'rider' ? next() : res.status(403).json({ error: 'Untuk rider sahaja' }))
const photoOnly = (buf) => { const k = sniff(buf); return k && k.ext !== 'pdf' ? k : null }

// rider: delivered = photo of the pizza at the door (raw image body, max 8 MB)
app.post('/api/staff/rider/orders/:id/deliver', staff, riderOnly, express.raw({ type: () => true, limit: '8mb' }), (req, res) => {
  const o = orders.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Pesanan tidak dijumpai' })
  if (o.status !== 'delivering') return res.status(409).json({ error: `Status pesanan sudah berubah (${o.status}). Muat semula.` })
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const kind = photoOnly(buf)
  if (!kind) return res.status(400).json({ error: 'Sila ambil gambar (JPG/PNG)' })
  const file = `${o.id}-${crypto.randomBytes(6).toString('hex')}.${kind.ext}`
  fs.writeFileSync(path.join(PROOFS, file), buf)
  const now = new Date().toISOString()
  o.proof = { file, type: kind.ext, at: now }
  o.status = 'done'
  o.history.push({ status: 'done', at: now, by: 'rider' })
  if ((o.paymentMethod || 'cod') === 'cod') {
    o.payment = { ...(o.payment || { receipts: [] }), status: 'paid', paidAt: now, by: 'rider' }
    o.cod = { collectedAt: now, owed: owedFor(o), bankin: null }
  }
  giveCashback(o)
  giveWelcome(o)
  if (o.delivery.fee > 0 && ((o.paymentMethod || 'cod') !== 'cod' || !settings.riderKeepsFee)) {
    wallets.accounts.rider ||= { status: 'active', name: '', bankName: '', accountNumber: '', createdAt: now }
    addTx('rider', 'fee', o.delivery.fee, { ref: o.id, note: 'Caj penghantaran' })
    saveWallets()
  }
  save('orders.json', orders)
  console.log(`[rider] ${o.id} delivered (photo ${Math.round(buf.length / 1024)} KB)`)
  tg((o.paymentMethod || 'cod') === 'cod' ? 'payments' : 'orders',
    (o.paymentMethod || 'cod') === 'cod' ? `💵 Tunai dikutip oleh rider\n${o.id} · ${who(o)}\n${rmT(o.total)} (rider perlu bank-in ${rmT(owedFor(o))})` : `📦 Sudah sampai\n${o.id} · ${who(o)}`,
    { path: path.join(PROOFS, file), type: kind.ext })
  res.json(staffView(o, 'rider'))
})

// rider wallet: delivery fees earned on non-cash orders; payout to their bank on request
app.post('/api/staff/rider/wallet', staff, riderOnly, (req, res) => {
  const b = req.body || {}
  wallets.accounts.rider ||= { status: 'active', createdAt: new Date().toISOString() }
  const w = wallets.accounts.rider
  if (b.bank) {
    const bankName = String(b.bank.bankName || '')
    const accountNumber = String(b.bank.accountNumber || '').replace(/\D/g, '')
    if (!BANKS.includes(bankName) || !/^\d{8,18}$/.test(accountNumber) || clean(b.bank.name, 80).length < 3)
      return res.status(400).json({ error: 'Isi nama, bank dan no. akaun (8-18 nombor)' })
    Object.assign(w, { name: clean(b.bank.name, 80), bankName, accountNumber })
  }
  if (b.withdraw) {
    if (!b.txPin) return res.status(428).json({ error: 'Masukkan PIN untuk sahkan', needTxPin: true })
    if (String(b.txPin) !== settings.staff.riderPin) {
      hit('staffpin:' + req.ip)
      return res.status(403).json({ error: 'PIN salah', needTxPin: true })
    }
    const amount = money(+b.withdraw)
    if (!w.accountNumber) return res.status(400).json({ error: 'Isi maklumat bank dulu' })
    if (!(amount >= 5) || amount > walletBal('rider').available) return res.status(400).json({ error: `Jumlah RM5 hingga RM${walletBal('rider').available.toFixed(2)}` })
    addTx('rider', 'withdraw', -amount, { status: 'pending', note: 'Pengeluaran rider' })
    tg('payments', `↩️ Rider minta bayaran ${rmT(amount)}\nHantar ke: ${w.name} · ${w.bankName} · ${w.accountNumber}`)
  }
  saveWallets()
  res.json({ wallet: walletView('rider'), banks: BANKS })
})

// rider: bank-in of the COD cash they hold -> one record covering every order not yet banked in
app.post('/api/staff/rider/bankin', staff, riderOnly, express.raw({ type: () => true, limit: '6mb' }), (req, res) => {
  const owing = orders.filter((o) => codState(o) === 'with_rider')
  if (!owing.length) return res.status(400).json({ error: 'Tiada tunai untuk di-bank-in' })
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const kind = sniff(buf)
  if (!kind) return res.status(400).json({ error: 'Sila hantar gambar resit (JPG/PNG) atau PDF' })
  const id = 'BI-' + String(bankins.reduce((m, b) => Math.max(m, Number(b.id.slice(3)) || 0), 0) + 1).padStart(4, '0')
  const file = `${id}-${crypto.randomBytes(6).toString('hex')}.${kind.ext}`
  fs.writeFileSync(path.join(BANKINS, file), buf)
  const b = { id, orders: owing.map((o) => o.id), amount: money(owing.reduce((s, o) => s + owedFor(o), 0)), file, type: kind.ext,
    at: new Date().toISOString(), status: 'pending', reason: '' }
  bankins.push(b)
  for (const o of owing) o.cod = { ...(o.cod || {}), bankin: id }
  save('bankins.json', bankins)
  save('orders.json', orders)
  console.log(`[rider] bank-in ${id} RM${b.amount} for ${b.orders.length} orders`)
  tg('payments', `🏦 Rider bank-in ${b.id}: ${rmT(b.amount)}\nPesanan: ${b.orders.join(', ')}\n\nSemak bank anda, kemudian tekan Received di Money.`, { path: path.join(BANKINS, file), type: kind.ext })
  res.json(riderCash())
})
app.post('/api/staff/:role/orders/:id', staff, (req, res) => {
  const o = orders.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Pesanan tidak dijumpai' })
  const want = STAFF[req.role].moves[o.status]
  if (!want || String(req.body?.status) !== want) return res.status(409).json({ error: `Status pesanan sudah berubah (${o.status}). Muat semula.` })
  if (want === 'done') return res.status(400).json({ error: 'Ambil gambar pizza yang diterima dulu.' })
  const now = new Date().toISOString()
  o.status = want
  o.history.push({ status: want, at: now, by: req.role })
  if (want === 'done' && (o.paymentMethod || 'cod') === 'cod') o.payment = { ...(o.payment || { receipts: [] }), status: 'paid', paidAt: now, by: 'rider' }
  save('orders.json', orders)
  console.log(`[${req.role}] ${o.id} -> ${want}`)
  res.json(staffView(o, req.role))
})

app.get('/api/admin/orders', admin, (_req, res) => res.json({
  orders: orders.slice(-300).reverse().map((o) => ({ ...o, cash: codState(o) })),
  // for the "WhatsApp kitchen / rider" buttons on each order
  locations: { kitchen: settings.shop, rider: settings.riderBase },
  staff: { kitchenName: settings.staff.kitchenName, kitchenPhone: settings.staff.kitchenPhone, riderName: settings.staff.riderName, riderPhone: settings.staff.riderPhone,
    kitchenBank: settings.staff.kitchenBank, kitchenAccountName: settings.staff.kitchenAccountName, kitchenAccountNumber: settings.staff.kitchenAccountNumber, kitchenQr: Boolean(settings.staff.kitchenQr) },
  base: settings.publicUrl || '',
}))
const sendFile = (dir, re) => (req, res) => {
  const name = String(req.params.file)
  if (!re.test(name)) return res.status(400).json({ error: 'Bad name' })
  const f = path.join(dir, name)
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not found' })
  res.set('Cache-Control', 'private, no-store').type(MIME[name.split('.').pop()]).send(fs.readFileSync(f))
}
app.get('/api/admin/proofs/:file', admin, sendFile(PROOFS, /^PZ-\d{4,}-[0-9a-f]{12}\.(jpg|png|webp)$/))
app.get('/api/admin/bankin-files/:file', admin, sendFile(BANKINS, /^BI-\d{4,}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/))
app.get('/api/admin/wallets', admin, (_req, res) => {
  const list = Object.entries(wallets.accounts).map(([key, w]) => ({ key, ...w, ...walletBal(key),
    customerName: key.startsWith('c:') ? customers.accounts[key.slice(2)]?.name || '' : 'Rider' }))
  res.json({ wallets: list, tx: wallets.tx.slice(-300).reverse(), promos: promos.map((p) => ({ ...p, used: orders.filter((o) => o.promo?.code === p.code && o.status !== 'cancelled').length })),
    customers: Object.entries(customers.accounts).map(([phone, c]) => ({ phone, name: c.name, wallet: wallets.accounts['c:' + phone]?.status || null })) })
})
app.post('/api/admin/wallets/:key/status', admin, (req, res) => {
  const w = wallets.accounts[req.params.key]
  if (!w) return res.status(404).json({ error: 'Not found' })
  const action = String(req.body?.action || '')
  if (action === 'approve') {
    Object.assign(w, { status: 'active', reason: '', approvedAt: new Date().toISOString() })
    const phone = req.params.key.slice(2)
    for (const o of orders) if (o.accountPhone === phone && o.cashback?.status === 'waiting_wallet') giveCashback(o)
    const pw = wallets.pendingWelcome?.[phone]
    if (pw) {
      addTx(req.params.key, 'welcome', pw.amount, { ref: pw.ref, note: `Hadiah pelanggan baru (guna untuk pesanan RM${settings.welcome.minOrder} ke atas)` })
      delete wallets.pendingWelcome[phone]
    }
    save('orders.json', orders)
  }
  else if (action === 'reject') Object.assign(w, { status: 'rejected', reason: clean(req.body?.reason, 200) || 'Maklumat tidak lengkap' })
  else if (action === 'freeze') Object.assign(w, { status: 'frozen', reason: clean(req.body?.reason, 200) })
  else return res.status(400).json({ error: 'Bad action' })
  saveWallets()
  res.json({ ok: true })
})
app.post('/api/admin/wallet-tx/:id', admin, adminTx, (req, res) => {
  const t = wallets.tx.find((x) => x.id === req.params.id)
  if (!t || t.status !== 'pending') return res.status(404).json({ error: 'Not pending' })
  const action = String(req.body?.action || '')
  if (action === 'confirm') Object.assign(t, { status: 'done', doneAt: new Date().toISOString(), note: clean(req.body?.note, 120) || t.note })
  else if (action === 'reject') Object.assign(t, { status: 'rejected', reason: clean(req.body?.reason, 200) || 'Ditolak' })
  else return res.status(400).json({ error: 'Bad action' })
  saveWallets()
  res.json({ ok: true })
})
app.post('/api/admin/wallets/:key/credit', admin, adminTx, (req, res) => {
  let key = req.params.key
  if (key.startsWith('c:') && !wallets.accounts[key]) return res.status(400).json({ error: 'That customer has no active wallet yet' })
  if (wallets.accounts[key]?.status !== 'active') return res.status(400).json({ error: 'Wallet is not active' })
  const amount = money(+req.body?.amount)
  if (!amount || Math.abs(amount) > 2000) return res.status(400).json({ error: 'Amount between -2000 and 2000, not 0' })
  if (amount < 0 && walletBal(key).available + amount < 0) return res.status(400).json({ error: 'Would make the balance negative' })
  addTx(key, amount > 0 ? 'bonus' : 'adjust', amount, { note: clean(req.body?.note, 120) || (amount > 0 ? 'Bonus / promo' : 'Pelarasan') })
  saveWallets()
  res.json({ ok: true })
})
app.get('/api/admin/wallet-files/:file', admin, sendFile(WALLET_DIR, /^W-[0-9a-f]{16}\.(jpg|png|webp|pdf)$/))
app.post('/api/admin/orders/:id/refund-wallet', admin, adminTx, (req, res) => {
  const o = orders.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Not found' })
  if (o.refunded) return res.status(400).json({ error: 'Already refunded' })
  if (o.payment?.status !== 'paid') return res.status(400).json({ error: 'This order was not paid' })
  const key = o.accountPhone ? 'c:' + o.accountPhone : null
  if (!key || wallets.accounts[key]?.status !== 'active') return res.status(400).json({ error: 'Customer has no active wallet - refund by bank transfer instead' })
  addTx(key, 'refund', o.total, { ref: o.id, note: 'Refund pesanan' })
  o.refunded = { to: 'wallet', amount: o.total, at: new Date().toISOString() }
  saveWallets()
  save('orders.json', orders)
  res.json(o)
})
const savePromos = () => save('promos.json', promos)
app.post('/api/admin/promos', admin, (req, res) => {
  const b = req.body || {}
  const code = String(b.code || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{3,16}$/.test(code)) return res.status(400).json({ error: 'Code: 3-16 letters/numbers' })
  if (promos.some((p) => p.code === code)) return res.status(400).json({ error: 'Code already exists' })
  const kind = b.kind === 'fixed' ? 'fixed' : 'percent'
  const value = money(+b.value)
  if (!(value > 0) || (kind === 'percent' && value > 100) || value > 500) return res.status(400).json({ error: 'Bad discount value' })
  promos.push({ code, kind, value, minOrder: Math.max(0, +b.minOrder || 0), maxUses: Math.max(0, Math.floor(+b.maxUses || 0)),
    oncePerCustomer: Boolean(b.oncePerCustomer), expires: /^\d{4}-\d{2}-\d{2}$/.test(b.expires || '') ? b.expires : '', active: true,
    createdAt: new Date().toISOString() })
  savePromos()
  res.json({ ok: true })
})
app.patch('/api/admin/promos/:code', admin, (req, res) => {
  const p = promos.find((x) => x.code === req.params.code)
  if (!p) return res.status(404).json({ error: 'Not found' })
  if (req.body?.delete) promos = promos.filter((x) => x !== p)
  else p.active = Boolean(req.body?.active)
  savePromos()
  res.json({ ok: true })
})
// ---- customers (admin has full control): registered accounts + guests who ordered without an account
app.get('/api/admin/customers', admin, (_req, res) => {
  const stats = (phone) => {
    const mine = orders.filter((o) => o.customer.phone === phone)
    const done = mine.filter((o) => o.status === 'done')
    return { orders: mine.length, delivered: done.length, spent: money(done.reduce((s2, o) => s2 + o.total, 0)), lastOrder: mine.at(-1)?.createdAt || null }
  }
  const list = Object.entries(customers.accounts).map(([phone, a]) => ({
    phone, name: a.name, email: a.google?.email || '', picture: a.google?.picture || '', google: Boolean(a.google), hasPin: Boolean(a.pin),
    blocked: Boolean(a.blocked), createdAt: a.createdAt, lastLogin: a.lastLogin || null, addresses: (a.addresses || []).length,
    wallet: wallets.accounts['c:' + phone] ? { status: wallets.accounts['c:' + phone].status, ...walletBal('c:' + phone) } : null,
    ...stats(phone),
  }))
  const guests = {}
  for (const o of orders) if (!customers.accounts[o.customer.phone]) guests[o.customer.phone] = o.customer.name
  for (const [phone, name] of Object.entries(guests))
    list.push({ phone, name, email: '', picture: '', google: false, hasPin: false, guest: true, blocked: (settings.blockedPhones || []).includes(phone), ...stats(phone) })
  res.json({ customers: list.sort((a, b) => String(b.lastOrder || b.createdAt || '').localeCompare(String(a.lastOrder || a.createdAt || ''))) })
})
app.post('/api/admin/customers/:phone', admin, (req, res) => {
  const phone = String(req.params.phone)
  const acc = customers.accounts[phone]
  const action = String(req.body?.action || '')
  const dropSessions = () => { for (const [t, v] of Object.entries(customers.sessions)) if (v.phone === phone) delete customers.sessions[t] }
  if (action === 'block' || action === 'unblock') {
    const on = action === 'block'
    if (acc) acc.blocked = on
    settings.blockedPhones = (settings.blockedPhones || []).filter((x) => x !== phone).concat(on ? [phone] : [])
    if (on) dropSessions()
    save('settings.json', settings)
  } else if (!acc) {
    return res.status(404).json({ error: 'Guest customers have no account - only block / unblock' })
  } else if (action === 'rename') {
    const name = clean(req.body?.name, 60)
    if (name.length < 2) return res.status(400).json({ error: 'Name too short' })
    acc.name = name
  } else if (action === 'resetPin') {
    const pin = String(req.body?.pin || '')
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-6 digits' })
    acc.salt = crypto.randomBytes(16).toString('hex')
    acc.pin = hashPin(pin, acc.salt)
    dropSessions()
  } else if (action === 'unlinkGoogle') {
    if (!acc.pin) return res.status(400).json({ error: 'Set a PIN first, or the customer could not log in any more' })
    delete acc.google
  } else if (action === 'delete') {
    if (wallets.accounts['c:' + phone] && walletBal('c:' + phone).balance > 0) return res.status(400).json({ error: 'Customer still has wallet money - refund it first' })
    delete customers.accounts[phone]
    dropSessions()
  } else return res.status(400).json({ error: 'Bad action' })
  saveCustomers()
  console.log(`[admin] customer ${phone} ${action}`)
  res.json({ ok: true })
})

const KITCHEN_QR_RE = /^kitchen-qr\.(jpg|png|webp)$/
app.post('/api/admin/kitchen-qr', admin, adminTx, express.raw({ type: () => true, limit: '4mb' }), (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const kind = sniff(buf)
  if (!kind || kind.ext === 'pdf') return res.status(400).json({ error: 'Upload the QR as an image (JPG / PNG / WEBP)' })
  for (const f of fs.readdirSync(DATA)) if (KITCHEN_QR_RE.test(f)) fs.rmSync(path.join(DATA, f))
  fs.writeFileSync(path.join(DATA, `kitchen-qr.${kind.ext}`), buf)
  settings.staff.kitchenQr = `kitchen-qr.${kind.ext}`
  save('settings.json', settings)
  res.json(settingsView())
})
app.get('/api/admin/kitchen-qr', admin, (_req, res) => {
  const f = settings.staff.kitchenQr && path.join(DATA, settings.staff.kitchenQr)
  if (!f || !fs.existsSync(f)) return res.status(404).json({ error: 'No kitchen QR' })
  res.set('Cache-Control', 'private, no-store').type(MIME[f.split('.').pop()]).send(fs.readFileSync(f))
})

app.get('/api/admin/bankins', admin, (_req, res) => res.json({ bankins: bankins.slice().reverse() }))
app.post('/api/admin/bankins/:id', admin, adminTx, (req, res) => {
  const b = bankins.find((x) => x.id === req.params.id)
  if (!b) return res.status(404).json({ error: 'Not found' })
  const action = String(req.body?.action || '')
  if (action === 'confirm') Object.assign(b, { status: 'confirmed', confirmedAt: new Date().toISOString(), reason: '' })
  else if (action === 'reject') {
    // rejected: the orders go back to "cash with rider" so the rider can bank in again
    Object.assign(b, { status: 'rejected', reason: clean(req.body?.reason, 200) || 'Resit tidak sah atau jumlah tidak sama' })
    for (const o of orders) if (o.cod?.bankin === b.id) o.cod.bankin = null
    save('orders.json', orders)
  } else return res.status(400).json({ error: 'Bad action' })
  save('bankins.json', bankins)
  res.json({ bankins: bankins.slice().reverse() })
})
// money report over delivered orders: profit = pizza sales - supplier cost (delivery fee is separate)
app.get('/api/admin/report', admin, (req, res) => {
  const days = Math.max(0, Math.min(3650, Number(req.query.days) || 0)) // 0 = all time
  const since = days ? new Date(new Date().toDateString()).getTime() - (days - 1) * 86400000 : 0
  const done = orders.filter((o) => o.status === 'done' && new Date(o.createdAt).getTime() >= since)
  const sum = (list, f) => money(list.reduce((s, o) => s + f(o), 0))
  const fee = (o) => o.delivery.fee || 0
  const cod = done.filter((o) => (o.paymentMethod || 'cod') === 'cod')
  const tr = done.filter((o) => o.paymentMethod === 'transfer')
  const byDay = {}
  for (const o of done) {
    const d = new Date(o.createdAt).toLocaleDateString('en-CA')
    const r = (byDay[d] ||= { day: d, orders: 0, sales: 0, cost: 0, profit: 0, fees: 0 })
    r.orders++
    r.sales = money(r.sales + o.subtotal)
    r.cost = money(r.cost + (o.supplierCost ?? 0))
    r.profit = money(r.profit + o.subtotal - (o.discount || 0) - (o.cashback?.amount || 0) - (o.supplierCost ?? 0))
    r.fees = money(r.fees + fee(o))
  }
  res.json({
    days, orders: done.length,
    sales: sum(done, (o) => o.subtotal), discounts: sum(done, (o) => o.discount || 0), cost: sum(done, (o) => o.supplierCost ?? 0),
    profit: sum(done, (o) => o.subtotal - (o.discount || 0) - (o.cashback?.amount || 0) - (o.supplierCost ?? 0)),
    cashback: sum(done, (o) => o.cashback?.amount || 0),
    gifts: money(wallets.tx.filter((t) => ['welcome', 'bonus'].includes(t.type) && t.status === 'done' && new Date(t.at).getTime() >= since).reduce((s2, t) => s2 + t.amount, 0)),
    walletIn: sum(done.filter((o) => o.paymentMethod === 'wallet'), (o) => o.total),
    fees: sum(done, fee), riderFees: settings.riderKeepsFee ? sum(cod, fee) : 0,
    transferIn: sum(tr.filter((o) => o.payment?.status === 'paid'), (o) => o.total),
    codReceived: sum(cod.filter((o) => codState(o) === 'received'), owedFor),
    codPending: sum(cod.filter((o) => codState(o) === 'pending'), owedFor),
    codWithRider: sum(cod.filter((o) => codState(o) === 'with_rider'), owedFor),
    byDay: Object.values(byDay).sort((a, b) => (a.day < b.day ? 1 : -1)),
    riderKeepsFee: settings.riderKeepsFee,
  })
})
app.patch('/api/admin/orders/:id', admin, (req, res) => {
  const o = orders.find((x) => x.id === req.params.id)
  const status = String(req.body?.status || '')
  if (!o) return res.status(404).json({ error: 'Not found' })
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Bad status' })
  if (o.status !== status) {
    o.status = status
    o.history.push({ status, at: new Date().toISOString(), by: 'owner' })
    if (status === 'cancelled') o.cancelReason = clean(req.body?.reason, 200)
    if (status === 'cancelled' && o.paymentMethod === 'wallet' && o.payment?.status === 'paid' && !o.refunded && o.accountPhone) {
      addTx('c:' + o.accountPhone, 'refund', o.total, { ref: o.id, note: 'Pesanan dibatalkan' })
      o.refunded = { to: 'wallet', amount: o.total, at: new Date().toISOString() }
      saveWallets()
    }
    // COD: the cash is collected at the door, so "delivered" also means paid
    if (status === 'done' && (o.paymentMethod || 'cod') === 'cod') o.payment = { ...(o.payment || { receipts: [] }), status: 'paid', paidAt: new Date().toISOString() }
    if (status === 'done') (giveCashback(o), giveWelcome(o))
    save('orders.json', orders)
  }
  res.json(o)
})
app.post('/api/admin/orders/:id/payment', admin, adminTx, (req, res) => {
  const o = orders.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Not found' })
  const action = String(req.body?.action || '')
  o.payment ||= { status: 'unpaid', receipts: [] }
  if (action === 'paid') {
    Object.assign(o.payment, { status: 'paid', paidAt: new Date().toISOString(), reason: '' })
    tg('payments', `✅ Bayaran disahkan\n${o.id} · ${who(o)}\n${rmT(o.total)} sudah diterima`)
  }
  else if (action === 'reject') Object.assign(o.payment, { status: 'rejected', reason: clean(req.body?.reason, 200) || 'Resit tidak sah atau jumlah tidak sama' })
  else if (action === 'unpaid') Object.assign(o.payment, { status: 'unpaid', paidAt: null, reason: '' })
  else return res.status(400).json({ error: 'Bad action' })
  o.payment.log = [...(o.payment.log || []), { status: o.payment.status, at: new Date().toISOString() }]
  save('orders.json', orders)
  res.json(o)
})
app.get('/api/admin/receipts/:file', admin, (req, res) => {
  const name = String(req.params.file)
  if (!/^PZ-\d{4,}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/.test(name)) return res.status(400).json({ error: 'Bad name' })
  const f = path.join(RECEIPTS, name)
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not found' })
  res.set('Cache-Control', 'private, no-store').type(MIME[name.split('.').pop()]).send(fs.readFileSync(f))
})
app.post('/api/admin/payment-qr', admin, adminTx, express.raw({ type: () => true, limit: '4mb' }), (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const kind = sniff(buf)
  if (!kind || kind.ext === 'pdf') return res.status(400).json({ error: 'Upload the QR as an image (JPG / PNG / WEBP)' })
  for (const f of fs.readdirSync(DATA)) if (/^payment-qr\./.test(f)) fs.rmSync(path.join(DATA, f))
  fs.writeFileSync(path.join(DATA, `payment-qr.${kind.ext}`), buf)
  settings.payment.qr = `payment-qr.${kind.ext}`
  settings.payment.qrAt = new Date().toISOString()
  save('settings.json', settings)
  res.json(settingsView())
})
app.delete('/api/admin/payment-qr', admin, adminTx, (_req, res) => {
  for (const f of fs.readdirSync(DATA)) if (/^payment-qr\./.test(f)) fs.rmSync(path.join(DATA, f))
  settings.payment.qr = ''
  save('settings.json', settings)
  res.json(settingsView())
})
function settingsView(extra = {}) {
  // the bot token, webhook secret and link code never leave the server
  const { botToken, webhookSecret, link, ...telegram } = settings.telegram
  const { token: _token, appSecret: _secret, verifyToken: _verify, ...waLogin } = settings.waLogin // same for WhatsApp
  const { token: _pageToken, appSecret: _pageSecret, verifyToken: _pageVerify, ...social } = settings.social // same for Facebook + Instagram
  return { ...settings, social, telegram: { ...telegram, hasToken: Boolean(botToken) }, waLogin: { ...waLogin, connected: waReady() },
    telegramReady: tgReady(), telegramMode: tgCreds().mode, menu, ...extra }
}
app.get('/api/admin/settings', admin, (req, res) => res.json(settingsView({ me: req.adminEmail || null })))
app.put('/api/admin/settings', admin, (req, res) => {
  const b = req.body || {}
  const same = (a, c) => JSON.stringify(a) === JSON.stringify(c)
  const payKeys = ['cod', 'transfer', 'bankName', 'accountName', 'accountNumber']
  const sensitive =
    (b.payment !== undefined && payKeys.some((k) => b.payment?.[k] !== undefined && String(b.payment[k]).replace(/[^\w@. -]/g, '') !== String(settings.payment[k]).replace(/[^\w@. -]/g, ''))) ||
    (b.adminPin !== undefined && String(b.adminPin) !== settings.adminPin) ||
    (b.adminEmails !== undefined && !same(String(b.adminEmails).toLowerCase().split(/[\s,]+/).filter(Boolean).sort(), [...settings.adminEmails].sort())) ||
    (b.staff !== undefined && !same({ k: String(b.staff?.kitchenPin ?? settings.staff.kitchenPin), r: String(b.staff?.riderPin ?? settings.staff.riderPin) }, { k: settings.staff.kitchenPin, r: settings.staff.riderPin })) ||
    (b.staff !== undefined && ['kitchenBank', 'kitchenAccountName', 'kitchenAccountNumber'].some((k) => b.staff?.[k] !== undefined && String(b.staff[k]).trim() !== String(settings.staff[k] || ''))) ||
    (b.googleClientId !== undefined && String(b.googleClientId).trim() !== settings.googleClientId) ||
    (b.welcome !== undefined && ['active', 'amount', 'minOrder'].some((k) => b.welcome?.[k] !== undefined && String(b.welcome[k]) !== String(settings.welcome[k]))) ||
    (b.cashback !== undefined && ['active', 'percent', 'start', 'end', 'minOrder', 'maxPerOrder', 'exclude'].some((k) => b.cashback?.[k] !== undefined && String(b.cashback[k]) !== String(settings.cashback[k] ?? '')))
  if (sensitive && !txOk(req, res)) return
  const n = (v, lo, hi, def) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : def)
  const d = b.delivery || {}
  const next = {
    ...settings,
    shopName: clean(b.shopName ?? settings.shopName, 40) || 'Pizzadonia',
    open: b.open === undefined ? settings.open : Boolean(b.open),
    whatsapp: b.whatsapp === undefined ? settings.whatsapp : (b.whatsapp === '' ? '' : normPhone(b.whatsapp) ?? settings.whatsapp),
    minOrder: n(b.minOrder, 0, 500, settings.minOrder),
    delivery: {
      baseFee: n(d.baseFee, 0, 100, settings.delivery.baseFee), baseKm: n(d.baseKm, 0, 50, settings.delivery.baseKm),
      perKm: n(d.perKm, 0, 20, settings.delivery.perKm), maxKm: n(d.maxKm, 1, 100, settings.delivery.maxKm),
      freeAbove: n(d.freeAbove, 0, 1000, settings.delivery.freeAbove),
    },
  }
  if (b.payment !== undefined) {
    const p = b.payment || {}
    next.payment = {
      ...settings.payment,
      cod: p.cod === undefined ? settings.payment.cod : Boolean(p.cod),
      transfer: p.transfer === undefined ? settings.payment.transfer : Boolean(p.transfer),
      bankName: clean(p.bankName ?? settings.payment.bankName, 60),
      accountName: clean(p.accountName ?? settings.payment.accountName, 80),
      accountNumber: clean(p.accountNumber ?? settings.payment.accountNumber, 30).replace(/[^\d -]/g, ''),
      note: clean(p.note ?? settings.payment.note, 200),
    }
    if (!next.payment.cod && !next.payment.transfer) next.payment.cod = true
  }
  if (b.welcome !== undefined) {
    const w = b.welcome || {}
    const amt = w.amount === undefined ? settings.welcome.amount : +w.amount
    if (!(amt >= 0 && amt <= 100)) return res.status(400).json({ error: 'Welcome gift must be RM0 - RM100' })
    next.welcome = { active: w.active === undefined ? settings.welcome.active : Boolean(w.active), amount: money(amt),
      minOrder: Math.max(0, +(w.minOrder ?? settings.welcome.minOrder) || 0) }
  }
  if (b.cashback !== undefined) {
    const c = b.cashback || {}
    const date = (v, old) => (v === undefined ? old : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : '')
    const pct = c.percent === undefined ? settings.cashback.percent : +c.percent
    if (!(pct >= 0 && pct <= 50)) return res.status(400).json({ error: 'Cashback must be 0-50 %' })
    next.cashback = { active: c.active === undefined ? settings.cashback.active : Boolean(c.active), percent: pct,
      start: date(c.start, settings.cashback.start), end: date(c.end, settings.cashback.end),
      minOrder: Math.max(0, +(c.minOrder ?? settings.cashback.minOrder) || 0), maxPerOrder: Math.max(0, +(c.maxPerOrder ?? settings.cashback.maxPerOrder) || 0),
      exclude: Array.isArray(c.exclude) ? c.exclude.filter((x) => menu.some((m) => m.id === x)) : settings.cashback.exclude || [] }
    if (next.cashback.start && next.cashback.end && next.cashback.end < next.cashback.start) return res.status(400).json({ error: 'End date is before the start date' })
  }
  if (b.riderKeepsFee !== undefined) next.riderKeepsFee = Boolean(b.riderKeepsFee)
  if (b.siteUrl !== undefined) {
    const u = String(b.siteUrl || '').trim().replace(/\/+$/, '')
    if (u && !/^https:\/\/[a-z0-9.-]+$/i.test(u)) return res.status(400).json({ error: 'Site URL must look like https://pizzadonia.netlify.app' })
    next.siteUrl = u
    next.publicUrl = u || settings.tunnelUrl || settings.publicUrl
  }
  if (b.telegram !== undefined) {
    const t = b.telegram || {}
    // only the switches come from this form - bot + chat are managed by the /api/admin/telegram/* routes
    next.telegram = { ...settings.telegram, ...Object.fromEntries(['enabled', 'payments', 'orders', 'support'].map((k) => [k, t[k] === undefined ? settings.telegram[k] : Boolean(t[k])])) }
  }
  if (b.aiChat !== undefined) {
    const a = b.aiChat || {}
    next.aiChat = { enabled: a.enabled === undefined ? settings.aiChat.enabled : Boolean(a.enabled), model: aiModel(a.model ?? settings.aiChat.model) }
  }
  if (b.opsAi !== undefined) {
    const a = b.opsAi || {}
    next.opsAi = { enabled: a.enabled === undefined ? settings.opsAi.enabled : Boolean(a.enabled), model: opsModel(a.model ?? settings.opsAi.model) }
  }
  if (b.adminEmails !== undefined) {
    const list = [...new Set((Array.isArray(b.adminEmails) ? b.adminEmails : String(b.adminEmails).split(/[\s,]+/))
      .map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
    if (list.some((e) => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e))) return res.status(400).json({ error: 'One of the admin emails is not valid' })
    if (req.adminEmail && !list.includes(req.adminEmail)) return res.status(400).json({ error: `You are signed in as ${req.adminEmail} - keep it in the list or you lock yourself out` })
    next.adminEmails = list.slice(0, 10)
  }
  if (b.googleClientId !== undefined) {
    const id = String(b.googleClientId || '').trim()
    if (id && !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) return res.status(400).json({ error: 'That does not look like a Google OAuth Web client ID (….apps.googleusercontent.com)' })
    next.googleClientId = id
  }
  if (b.staff !== undefined) {
    const st = b.staff || {}
    const pinOk = (v) => v === '' || /^\d{4,8}$/.test(String(v))
    if ((st.kitchenPin !== undefined && !pinOk(st.kitchenPin)) || (st.riderPin !== undefined && !pinOk(st.riderPin)))
      return res.status(400).json({ error: 'Staff PINs must be 4-8 digits (or empty to switch the page off)' })
    const phoneOf = (v, old) => (v === undefined ? old : String(v).trim() === '' ? '' : normPhone(v))
    const kitchenPhone = phoneOf(st.kitchenPhone, settings.staff.kitchenPhone)
    const riderPhone = phoneOf(st.riderPhone, settings.staff.riderPhone)
    if (kitchenPhone === null || riderPhone === null) return res.status(400).json({ error: 'Staff WhatsApp number not valid (e.g. 012-3456789)' })
    next.staff = { ...settings.staff, kitchenPin: String(st.kitchenPin ?? settings.staff.kitchenPin), riderPin: String(st.riderPin ?? settings.staff.riderPin),
      kitchenName: clean(st.kitchenName ?? settings.staff.kitchenName, 40), riderName: clean(st.riderName ?? settings.staff.riderName, 40), kitchenPhone, riderPhone,
      kitchenBank: clean(st.kitchenBank ?? settings.staff.kitchenBank, 40), kitchenAccountName: clean(st.kitchenAccountName ?? settings.staff.kitchenAccountName, 80),
      kitchenAccountNumber: clean(st.kitchenAccountNumber ?? settings.staff.kitchenAccountNumber, 30).replace(/[^\d -]/g, ''), kitchenQr: settings.staff.kitchenQr }
  }
  if (b.riderBase !== undefined) next.riderBase = validPoint(b.riderBase) ? { lat: +b.riderBase.lat, lng: +b.riderBase.lng, label: clean(b.riderBase.label, 120) } : null
  if (b.shop !== undefined) next.shop = validPoint(b.shop) ? { lat: +b.shop.lat, lng: +b.shop.lng, label: clean(b.shop.label, 120) } : settings.shop
  if (b.adminPin !== undefined) {
    if (!/^\d{4,8}$/.test(String(b.adminPin))) return res.status(400).json({ error: 'PIN must be 4-8 digits' })
    next.adminPin = String(b.adminPin)
  }
  settings = next
  save('settings.json', settings)
  if (b.adminPin !== undefined) fs.writeFileSync(file('ADMIN-PIN.txt'), `Pizzadonia admin PIN: ${settings.adminPin}\n`)
  res.json(settingsView())
})
app.put('/api/admin/menu/:id', admin, (req, res) => {
  const m = menu.find((x) => x.id === req.params.id)
  if (!m) return res.status(404).json({ error: 'Not found' })
  const b = req.body || {}
  if (b.price !== undefined) {
    const p = +b.price
    if (!(p > 0 && p <= 1000)) return res.status(400).json({ error: 'Bad price' })
    m.price = money(p)
  }
  if (b.cost !== undefined) {
    const c = +b.cost
    if (!(c >= 0 && c <= 1000)) return res.status(400).json({ error: 'Bad cost' })
    m.cost = money(c)
  }
  if (b.available !== undefined) m.available = Boolean(b.available)
  if (b.name !== undefined) m.name = clean(b.name, 40) || m.name
  if (b.desc !== undefined) m.desc = clean(b.desc, 200)
  if (b.tag !== undefined) m.tag = clean(b.tag, 30)
  if (b.sizes !== undefined) {
    const sz = b.sizes === null || (Array.isArray(b.sizes) && !b.sizes.length) ? [] : cleanSizes(b.sizes)
    if (sz === null) return res.status(400).json({ error: 'Each size needs a name, a price and a cost (names must differ)' })
    m.sizes = sz
    if (sz.length && sz.every((z) => z.price > 0)) delete m.pendingPrice
    if (sz.length) Object.assign(m, { price: sz[0].price, cost: sz[0].cost })
  }
  if (b.move === -1 || b.move === 1) {
    const i = menu.indexOf(m)
    const j = i + b.move
    if (j >= 0 && j < menu.length) [menu[i], menu[j]] = [menu[j], menu[i]]
  }
  save('menu.json', menu)
  res.json({ item: m, menu })
})

// ---- products: add, photo, delete (orders keep their own copy of name + price, so old orders are safe)
const MENU_PHOTOS = path.join(DATA, 'menu-photos')
fs.mkdirSync(MENU_PHOTOS, { recursive: true })
app.post('/api/admin/menu', admin, (req, res) => {
  const b = req.body || {}
  const name = clean(b.name, 40)
  const price = +b.price
  const cost = +(b.cost ?? 0)
  if (name.length < 2) return res.status(400).json({ error: 'Product name is too short' })
  if (!(price > 0 && price <= 1000) && !(Array.isArray(b.sizes) && b.sizes.length)) return res.status(400).json({ error: 'Price must be RM0.01 - RM1000' })
  if (!(cost >= 0 && cost <= 1000)) return res.status(400).json({ error: 'Bad supplier cost' })
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
  for (let n = 2; menu.some((x) => x.id === id); n++) id = id.replace(/-\d+$/, '') + '-' + n
  const sizes = b.sizes && b.sizes.length ? cleanSizes(b.sizes) : []
  if (sizes === null) return res.status(400).json({ error: 'Each size needs a name, a price and a cost (names must differ)' })
  const m = { id, name, desc: clean(b.desc, 200), price: money(sizes[0]?.price ?? price), cost: money(sizes[0]?.cost ?? cost), img: '/logo.svg', tag: clean(b.tag, 30), available: true, sizes }
  menu.push(m)
  save('menu.json', menu)
  console.log(`[admin] product added ${id}`)
  res.json({ item: m, menu })
})
app.post('/api/admin/menu/:id/photo', admin, express.raw({ type: () => true, limit: '8mb' }), (req, res) => {
  const m = menu.find((x) => x.id === req.params.id)
  if (!m) return res.status(404).json({ error: 'Not found' })
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const kind = sniff(buf)
  if (!kind || kind.ext === 'pdf') return res.status(400).json({ error: 'Upload a photo (JPG / PNG / WEBP)' })
  const file = `${m.id}-${crypto.randomBytes(5).toString('hex')}.${kind.ext}`
  fs.writeFileSync(path.join(MENU_PHOTOS, file), buf)
  m.img = `/api/menu-photo/${file}`
  save('menu.json', menu)
  res.json({ item: m, menu })
})
app.get('/api/menu-photo/:file', (req, res) => {
  const name = String(req.params.file)
  if (!/^[a-z0-9-]+-[0-9a-f]{10}\.(jpg|png|webp)$/.test(name)) return res.status(400).json({ error: 'Bad name' })
  const f = path.join(MENU_PHOTOS, name)
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not found' })
  res.set('Cache-Control', 'public, max-age=604800, immutable').type(MIME[name.split('.').pop()]).send(fs.readFileSync(f))
})
app.delete('/api/admin/menu/:id', admin, (req, res) => {
  const m = menu.find((x) => x.id === req.params.id)
  if (!m) return res.status(404).json({ error: 'Not found' })
  if (orders.some((o) => !['done', 'cancelled'].includes(o.status) && o.items.some((i) => i.id === m.id)))
    return res.status(400).json({ error: `${m.name} is in an active order - finish that order first (or switch it to Sold out)` })
  menu = menu.filter((x) => x !== m)
  save('menu.json', menu)
  console.log(`[admin] product deleted ${m.id}`)
  res.json({ menu })
})

// support chat AI (Workers AI). Exists only in the cloud copy: prepare-cloud swaps in the AI binding.
const aiGenerate = null
// try the support AI with a sample question (Shop & fees)
app.post('/api/admin/ai-test', admin, async (req, res) => {
  if (!aiGenerate) return res.status(503).json({ error: 'Workers AI runs on the Cloudflare shop only - try it on the live site.' })
  const model = aiModel(req.body?.model || settings.aiChat.model)
  const question = clean(req.body?.question, 300) || 'Ada pizza apa? Berapa caj hantar?'
  const started = Date.now()
  try {
    const text = await aiGenerate([{ role: 'system', content: `Anda pembantu kedai pizza ${settings.shopName}. Jawab ringkas dalam Bahasa Melayu (maks 3 ayat).` }, { role: 'user', content: question }], model)
    if (!text) return res.status(502).json({ error: 'The model answered with nothing - try another model.' })
    res.json({ model, question, text: text.slice(0, 800), ms: Date.now() - started })
  } catch (e) {
    res.status(502).json({ error: `Workers AI: ${e.message}` })
  }
})

createSupport({ load, save, getSettings: () => settings, getMenu: () => menu, getOrders: () => orders, limited, hit, clean, normPhone,
  accountOf, admin, publicPayment, cashbackLive, notify: (text) => tg('support', text), aiGenerate })(app)

createLedger({ load, save, getSettings: () => settings, getOrders: () => orders, getBankins: () => bankins, getWallets: () => wallets,
  walletBal, admin, adminTx, clean, money })(app)

createMarketing({ load, save, getSettings: () => settings, getMenu: () => menu, getOrders: () => orders, getPromos: () => promos, cashbackLive,
  admin, clean, myDay, aiGenerate, aiModel })(app)

// ---- Telegram: Pizzadonia's own bot. The owner pastes the BotFather token, then "Connect" opens Telegram on
// t.me/<bot>?start=<code>; the webhook below sees "/start <code>" and links that chat. The dashboard polls
// GET /api/admin/telegram until it flips to connected.
const sameSecret = (a, b) => Boolean(a) && Boolean(b) && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
function ownerStatusText() {
  const today = orders.filter((o) => myDay(new Date(o.createdAt)) === myDay())
  const active = orders.filter((o) => !['done', 'cancelled'].includes(o.status))
  const receipts = orders.filter((o) => o.payment?.status === 'pending').length
  const sales = today.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + (+o.total || 0), 0)
  return [
    `🍕 ${settings.shopName}`,
    settings.open ? '🟢 Dibuka - menerima pesanan' : '🔴 Tutup sekarang',
    '',
    `📦 Hari ini: ${today.length} pesanan · ${rmT(sales)}`,
    `⏳ Sedang berjalan: ${active.length}`,
    ...(receipts ? [`🧾 Resit perlu disemak: ${receipts}`] : []),
  ].join('\n')
}
// ---- owner's AI helper (ops-assistant.js). The webhook mints a 5-minute owner session for the bot and hands the
// turn to deferOps; the helper then works only through the seller API with that session and never has the
// transaction PIN. Telegram may re-send a slow webhook, so each update runs once (seen ids).
// Needs Workers AI: this local copy only says where it runs; prepare-cloud swaps in the Cloudflare runner.
const deferOps = (job) => tgApi(job.token, 'sendMessage', { chat_id: job.chatId, text: '🤖 Pembantu AI hanya berjalan pada kedai Cloudflare. Hantar /check untuk semakan kedai.' })
const OPS_SESSION = 5 * 60 * 1000
const opsState = () => load('ops-assistant.json', { history: [], pending: null, seen: [] })
function firstTime(updateId) {
  const s2 = opsState()
  if (s2.seen.includes(updateId)) return false
  s2.seen = [...s2.seen, updateId].slice(-50)
  save('ops-assistant.json', s2)
  return true
}
function startOps(job) {
  const token = crypto.randomBytes(24).toString('hex')
  const now = Date.now()
  for (const [k, v] of Object.entries(adminSessions)) if (v.exp < now) delete adminSessions[k]
  adminSessions[token] = { email: settings.adminEmails[0], exp: now + OPS_SESSION, via: 'telegram' }
  saveAdminSessions()
  return deferOps({ ...job, token: settings.telegram.botToken, session: token })
}
async function onTelegramUpdate(u) {
  const t = settings.telegram
  // Confirm / Cancel under a change plan: only the linked owner's taps count
  const q = u.callback_query
  if (q) {
    const plan = /^ops:([yn]):(\w{1,16})$/.exec(q.data || '')
    const owner = Boolean(t.chatId) && q.message?.chat?.type === 'private' && String(q.message.chat.id) === t.chatId && String(q.from?.id) === t.chatId
    if (!plan || !owner || !settings.adminEmails.length || !firstTime(u.update_id)) return tgApi(t.botToken, 'answerCallbackQuery', { callback_query_id: q.id })
    return startOps({ chatId: t.chatId, plan: plan[2], yes: plan[1] === 'y', messageId: q.message.message_id, callbackId: q.id })
  }
  // the owner blocked / unblocked the bot -> shown on the dashboard instead of silent failures
  const mcm = u.my_chat_member
  if (mcm) {
    if (String(mcm.chat?.id) === t.chatId) {
      t.blockedAt = mcm.new_chat_member?.status === 'kicked' ? new Date().toISOString() : ''
      save('settings.json', settings)
    }
    return
  }
  const m = u.message
  if (!m?.chat || m.chat.type !== 'private') return // groups and channels are ignored
  const c = parseCommand(m.text)
  const site = siteBase()
  const reply = (text, buttons) => tgApi(t.botToken, 'sendMessage', { chat_id: m.chat.id, text, disable_web_page_preview: true, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) })
  const isOwner = Boolean(t.chatId) && String(m.chat.id) === t.chatId
  // customer login (t.me/<bot>?start=L<code>, then the shared contact) - checked first: the owner may log in too
  const loginStart = c?.cmd === 'start' ? /^L(\d{6})$/.exec(c.arg) : null
  if (loginStart || m.contact) return firstTime(u.update_id) ? tgLogin(m, loginStart?.[1]) : undefined
  if (c?.cmd === 'start' && c.arg) {
    if (t.link && t.link.exp > Date.now() && sameSecret(c.arg, t.link.code)) {
      t.chatId = String(m.chat.id)
      t.chat = { name: chatLabel(m.chat), username: m.chat.username || '', at: new Date().toISOString() }
      t.link = null
      t.blockedAt = ''
      save('settings.json', settings)
      console.log(`[telegram] linked to ${t.chat.name}`)
      await tgMenus() // this chat's Menu now opens the seller dashboard
      return reply(`✅ Bersambung dengan ${settings.shopName}!\n\nNotifikasi pesanan, bayaran dan chat pelanggan akan masuk ke sini.\nHantar /status bila-bila masa untuk ringkasan kedai.`, ownerKeyboard(site))
    }
    if (!isOwner) return reply('⚠️ Pautan sambungan ini sudah tamat atau telah digunakan.\nBuka dashboard seller → Shop & fees → Telegram, kemudian tekan "Connect Telegram" sekali lagi.')
  }
  if (isOwner) {
    if (c?.cmd === 'stop') {
      t.chatId = ''
      t.chat = null
      save('settings.json', settings)
      return reply('🔕 Notifikasi dihentikan. Sambung semula dari dashboard seller bila-bila masa.')
    }
    if (c?.cmd === 'check') return reply(healthText(await diagnostics()))
    if (c?.cmd === 'reset') {
      save('ops-assistant.json', { ...opsState(), history: [], pending: null })
      return reply('🧹 Perbualan dengan pembantu AI dikosongkan. Tanya apa sahaja tentang kedai.')
    }
    // plain words (not a command) go to the AI helper
    if (!c && m.text && settings.opsAi.enabled && settings.adminEmails.length) {
      if (!firstTime(u.update_id)) return
      return startOps({ chatId: t.chatId, text: String(m.text).slice(0, 2000) })
    }
    return reply(ownerStatusText() + (settings.opsAi.enabled ? '\n\n🤖 Tanya saya apa sahaja dalam ayat biasa, cth: "kenapa notifikasi tak masuk?" atau "tutup kedai".' : ''), ownerKeyboard(site))
  }
  // anyone else who finds the bot: point them to the shop
  return reply(`🍕 ${settings.shopName}\nBot ini untuk log masuk pelanggan dan notifikasi pemilik kedai. Untuk membuat pesanan, tekan butang di bawah.`,
    site ? [[{ text: '🛒 Buka Kedai', web_app: { url: site } }]] : null)
}
// ---- Menu button Mini App. Customers' Menu opens the shop; the owner's Menu (and the "Seller dashboard" button)
// opens /#/tg inside Telegram, which trades Telegram's signed initData for an owner session - Google sign-in
// doesn't work in Telegram's in-app browser. Money actions still ask for the transaction PIN as usual.
const TG_MENU_VERSION = '1' // bump to push new Menu buttons to Telegram
const TG_APP_SESSION = 12 * 3600 * 1000
/** Telegram Mini App initData check (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) */
function tgInitUser(initData, token, maxAgeS = 3600) {
  if (!initData || !token || String(initData).length > 4096) return null
  const p = new URLSearchParams(String(initData))
  const hash = p.get('hash') || ''
  p.delete('hash')
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest()
  const good = crypto.createHmac('sha256', secret).update(check).digest('hex')
  if (!sameSecret(hash, good) || Date.now() / 1000 - Number(p.get('auth_date') || 0) > maxAgeS) return null
  try {
    const user = JSON.parse(p.get('user') || 'null')
    return Number.isInteger(user?.id) ? user : null
  } catch {
    return null
  }
}
/** Menu buttons: shop for everyone, seller dashboard for the linked owner chat. Never throws. */
async function tgMenus() {
  const t = settings.telegram
  const site = siteBase()
  if (!t.botToken || !/^https:\/\//.test(site)) return false
  const shop = await tgApi(t.botToken, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Menu', web_app: { url: site } } })
  const owner = t.chatId ? await tgApi(t.botToken, 'setChatMenuButton', { chat_id: Number(t.chatId), menu_button: { type: 'web_app', text: 'Menu', web_app: { url: `${site}/#/tg` } } }) : { ok: true }
  if (!shop.ok || !owner.ok) return false
  t.menuVer = `${TG_MENU_VERSION}|${t.chatId || ''}|${site}`
  save('settings.json', settings)
  return true
}
// the owner opened the Mini App: Telegram signed who they are -> a 12-hour owner session for this phone
app.post('/api/telegram/app-session', (req, res) => {
  const t = settings.telegram
  const key = 'tgapp:' + req.ip
  if (limited(key, 10) || limited('tgapp:all', 50)) return res.status(429).json({ error: 'Terlalu banyak cubaan. Tunggu 10 minit.' })
  const user = tgInitUser(req.body?.initData, t.botToken)
  if (!user || !t.chatId || String(user.id) !== t.chatId || !settings.adminEmails.length) {
    hit(key)
    hit('tgapp:all')
    return res.status(403).json({ error: 'Hanya pemilik kedai (chat Telegram yang disambungkan) boleh buka dashboard seller di sini.' })
  }
  const token = crypto.randomBytes(24).toString('hex')
  const now = Date.now()
  for (const [k, v] of Object.entries(adminSessions)) if (v.exp < now) delete adminSessions[k]
  adminSessions[token] = { email: settings.adminEmails[0], exp: now + TG_APP_SESSION, via: 'telegram-app' }
  saveAdminSessions()
  res.json({ session: token })
})
app.post(WEBHOOK_PATH, async (req, res) => {
  const t = settings.telegram
  if (!t.botToken || !sameSecret(String(req.get('x-telegram-bot-api-secret-token') || ''), t.webhookSecret)) return res.status(401).json({ error: 'Not allowed' })
  try {
    // once per Menu version / owner chat / site: point the Menu buttons at the shop and the seller dashboard
    if (t.menuVer !== `${TG_MENU_VERSION}|${t.chatId || ''}|${siteBase()}`) await tgMenus()
    await onTelegramUpdate(req.body || {})
  } catch (e) {
    console.log(`[telegram] update failed: ${e.message}`)
  }
  res.json({ ok: true }) // always 200, or Telegram keeps re-sending the same update
})
// connection card on Shop & fees. live=1 also asks Telegram about the bot and its webhook.
app.get('/api/admin/telegram', admin, async (req, res) => {
  const t = settings.telegram
  const c = tgCreds()
  const site = siteBase()
  const out = {
    mode: c.mode, enabled: t.enabled, bot: t.bot, connected: Boolean(c.chat), blockedAt: c.mode === 'own' ? t.blockedAt || '' : '',
    chat: c.mode === 'own' ? t.chat : null,
    waiting: t.link && t.link.exp > Date.now() ? { exp: t.link.exp } : null,
    delivery: tgDelivery(), site, siteOk: /^https:\/\//.test(site),
  }
  if (req.query.live === '1' && c.token) {
    const w = await webhookCheck()
    out.reachable = w.reachable
    out.error = w.error
    if (w.reachable) out.webhook = { ok: w.ok, pending: w.pending, lastError: w.lastError, lastErrorAt: w.lastErrorAt }
  }
  res.json(out)
})
// asks Telegram where the bot's webhook points. A webhook made before the Confirm buttons existed does not deliver
// button taps: re-register it in place (same address and secret). A different address is left alone - another
// program owns it, and the owner must choose.
async function webhookCheck() {
  const t = settings.telegram
  const want = siteBase() + WEBHOOK_PATH
  const w = await tgApi(t.botToken, 'getWebhookInfo', {}, 6000)
  if (!w.ok) return { reachable: false, error: w.error }
  const r = w.result
  let fixed = false
  if (r.url === want && r.allowed_updates && !HOOK_UPDATES.every((x) => r.allowed_updates.includes(x)))
    fixed = (await tgApi(t.botToken, 'setWebhook', { url: want, secret_token: t.webhookSecret, allowed_updates: HOOK_UPDATES }, 6000)).ok
  return { reachable: true, error: '', ok: r.url === want, url: r.url || '', fixed, pending: r.pending_update_count || 0,
    lastError: r.last_error_message || '', lastErrorAt: r.last_error_date ? r.last_error_date * 1000 : 0 }
}
// paste / replace the bot token: checks it with Telegram, points the bot's webhook at this shop
app.post('/api/admin/telegram/bot', admin, adminTx, async (req, res) => {
  const token = String(req.body?.token || '').trim()
  if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'That does not look like a bot token. Copy the whole line BotFather sent, like 123456789:AAH…' })
  const site = siteBase()
  if (!/^https:\/\//.test(site)) return res.status(400).json({ error: 'The shop needs its public https link first (Telegram only talks to https).' })
  const me = await tgApi(token, 'getMe')
  if (!me.ok) return res.status(400).json({ error: me.code === 401 || me.code === 404 ? 'Telegram says this token is wrong or was revoked.' : `Telegram: ${me.error}` })
  const secret = crypto.randomBytes(24).toString('base64url')
  const hook = await tgApi(token, 'setWebhook', { url: site + WEBHOOK_PATH, secret_token: secret, allowed_updates: HOOK_UPDATES, drop_pending_updates: true })
  if (!hook.ok) return res.status(502).json({ error: `Telegram refused the webhook: ${hook.error}` })
  await tgApi(token, 'setMyCommands', { commands: COMMANDS })
  const t = settings.telegram
  const sameBot = t.bot?.id === me.result.id
  Object.assign(t, { botToken: token, webhookSecret: secret, bot: { id: me.result.id, username: me.result.username, name: me.result.first_name }, link: null },
    sameBot ? {} : { chatId: '', chat: null, blockedAt: '' }) // a different bot can't message the old chat
  save('settings.json', settings)
  await tgMenus()
  console.log(`[telegram] bot set @${me.result.username}`)
  res.json({ ok: true, bot: t.bot })
})
// forget the bot (and stop its webhook) -> alerts stop
app.delete('/api/admin/telegram/bot', admin, adminTx, async (_req, res) => {
  const t = settings.telegram
  if (t.botToken) await tgApi(t.botToken, 'deleteWebhook', { drop_pending_updates: true })
  Object.assign(t, { botToken: '', webhookSecret: '', bot: null, chatId: '', chat: null, link: null, blockedAt: '' })
  save('settings.json', settings)
  res.json({ ok: true })
})
// one-time /start code (10 min) for the "Connect Telegram" button
app.post('/api/admin/telegram/link', admin, (_req, res) => {
  const t = settings.telegram
  if (!t.botToken || !t.bot?.username) return res.status(400).json({ error: 'Add your bot token first' })
  t.link = { code: crypto.randomBytes(12).toString('base64url'), exp: Date.now() + LINK_TTL }
  save('settings.json', settings)
  res.json({ ...linkUrls(t.bot.username, t.link.code), exp: t.link.exp })
})
app.post('/api/admin/telegram/unlink', admin, async (_req, res) => {
  const t = settings.telegram
  if (t.botToken && t.chatId) await tgApi(t.botToken, 'sendMessage', { chat_id: t.chatId, text: '🔕 Chat ini telah diputuskan daripada dashboard Pizzadonia. Tiada lagi notifikasi di sini.' }, 6000)
  Object.assign(t, { chatId: '', chat: null, link: null, blockedAt: '' })
  save('settings.json', settings)
  res.json({ ok: true })
})
app.post('/api/admin/telegram-test', admin, async (_req, res) => {
  const c = tgCreds()
  if (!c.chat) return res.status(400).json({ error: c.mode === 'own' ? 'Connect your Telegram chat first (tap Start in the bot).' : 'Add your Telegram bot first.' })
  const r = await tgSend(`🍕 ${settings.shopName}: notifikasi Telegram berfungsi! Anda akan dapat mesej bila pelanggan buat pesanan atau bayaran.`, null, undefined, ownerKeyboard(siteBase()), c)
  res.status(r.ok ? 200 : 502).json(r)
})

// ---- WhatsApp half of the phone login (whatsapp.js). Meta checks the address once with GET (verify token), then
// POSTs each message the customer sends to the shop's WhatsApp number, signed with the app secret.
app.get(WA_WEBHOOK_PATH, (req, res) => {
  const w = settings.waLogin
  if (req.query['hub.mode'] !== 'subscribe' || !sameSecret(String(req.query['hub.verify_token'] || ''), w.verifyToken)) return res.status(403).json({ error: 'Not allowed' })
  res.type('text/plain').send(String(req.query['hub.challenge'] || ''))
})
app.post(WA_WEBHOOK_PATH, express.raw({ type: () => true, limit: '64kb' }), async (req, res) => {
  const w = settings.waLogin
  // cloud: the body arrives as bytes; local express already parsed it and kept the bytes in rawBody
  const raw = Buffer.isBuffer(req.body) ? req.body : req.rawBody
  if (!waReady() || !waSigned(w.appSecret, raw, req.get('x-hub-signature-256'))) return res.status(401).json({ error: 'Not allowed' })
  try {
    const body = Buffer.isBuffer(req.body) ? JSON.parse(raw.toString('utf8')) : req.body
    for (const m of waMessages(body)) await onWhatsAppMessage(m)
  } catch (e) {
    console.log(`[whatsapp] message failed: ${e.message}`)
  }
  res.json({ ok: true }) // always 200, or Meta keeps re-sending
})
async function onWhatsAppMessage(m) {
  const p = phoneLogins()
  if (!m.id || p.seen.includes(m.id)) return // Meta may deliver the same message twice
  p.seen = [...p.seen, m.id].slice(-100)
  p.lastInboundAt = Date.now()
  const code = loginCode(m.text)
  const r = code && waitingLogin(p, 'wa', code)
  const phone = normPhone(m.from)
  const site = siteBase()
  let text = ''
  if (r && phone) {
    provePhone(p, r, phone)
    text = `✅ Nombor ${showPhone(phone)} disahkan.\n\nKembali ke laman ${settings.shopName} - anda sudah log masuk.${site ? '\n' + site + '/#/akaun' : ''}`
  } else {
    savePhoneLogins(p)
    // a few replies per sender, so a stuck phone or a script can't make us send forever
    if (limited('wa-reply:' + m.from, 5)) return
    hit('wa-reply:' + m.from)
    if (r) text = 'Maaf, hanya nombor telefon Malaysia boleh log masuk.'
    else if (code) text = `⚠️ Kod ini sudah tamat atau tidak sah. Tekan "Log masuk dengan WhatsApp" di laman ${settings.shopName} sekali lagi.`
    else text = `🍕 ${settings.shopName}\nNombor ini untuk kod log masuk sahaja.${site ? `\nOrder di ${site}` : ''}${settings.whatsapp ? `\nUntuk bertanya, WhatsApp kedai: https://wa.me/${settings.whatsapp}` : ''}`
  }
  const sent = await waText(settings.waLogin, m.from, text)
  if (!sent.ok) console.log(`[whatsapp] reply failed: ${sent.error}`)
}
// WhatsApp login card on Shop & fees. The token and app secret never leave the server.
app.get('/api/admin/whatsapp', admin, (_req, res) => {
  const w = settings.waLogin
  res.json({ connected: waReady(), number: w.number, name: w.name, phoneNumberId: w.phoneNumberId, wabaId: w.wabaId,
    webhookUrl: siteBase() + WA_WEBHOOK_PATH, verifyToken: w.verifyToken, lastInboundAt: phoneLogins().lastInboundAt || 0, telegram: tgLoginReady() })
})
// save / replace the keys: checked with Meta first. Blank token or secret = keep the saved one.
app.post('/api/admin/whatsapp', admin, adminTx, async (req, res) => {
  const b = req.body || {}
  const w = settings.waLogin
  const phoneNumberId = String(b.phoneNumberId ?? w.phoneNumberId).replace(/\D/g, '')
  const wabaId = String(b.wabaId ?? w.wabaId).replace(/\D/g, '')
  const token = String(b.token || '').trim() || w.token
  const appSecret = String(b.appSecret || '').trim() || w.appSecret
  if (!/^\d{6,25}$/.test(phoneNumberId)) return res.status(400).json({ error: 'Phone number ID is the long number under WhatsApp → API Setup (not the phone number itself).' })
  if (!/^\S{20,600}$/.test(token)) return res.status(400).json({ error: 'Paste the permanent access token from your System user.' })
  if (!/^[0-9a-f]{32}$/i.test(appSecret)) return res.status(400).json({ error: 'App secret is 32 letters and numbers: App settings → Basic → App secret → Show.' })
  if (!/^https:\/\//.test(siteBase())) return res.status(400).json({ error: 'The shop needs its public https link first (Meta only talks to https).' })
  const me = await waApi(token, 'GET', `${phoneNumberId}?fields=display_phone_number,verified_name`)
  if (!me.ok) return res.status(400).json({ error: `Meta: ${me.error}` })
  const number = String(me.result.display_phone_number || '').replace(/\D/g, '')
  if (!number) return res.status(400).json({ error: 'Meta did not return a phone number for this ID.' })
  // makes Meta deliver this business account's messages to the app (and so to our webhook)
  const subscribed = wabaId ? (await waApi(token, 'POST', `${wabaId}/subscribed_apps`)).ok : null
  Object.assign(w, { phoneNumberId, wabaId, token, appSecret, number, name: clean(me.result.verified_name, 80),
    verifyToken: w.verifyToken || crypto.randomBytes(18).toString('base64url') })
  save('settings.json', settings)
  console.log(`[whatsapp] login number set +${number}`)
  res.json({ ok: true, number, name: w.name, subscribed })
})
// switch WhatsApp login off (customers then see the Telegram / PIN login again)
app.delete('/api/admin/whatsapp', admin, adminTx, (_req, res) => {
  Object.assign(settings.waLogin, { token: '', appSecret: '', number: '', name: '' })
  save('settings.json', settings)
  res.json({ ok: true })
})

// Facebook + Instagram DMs. The AI turn runs after the shop lock is released (cloud only).
const deferSocial = (_id) => {}
const internalKey = ''
createSocial({ load, save, getSettings: () => settings, saveSettings: () => save('settings.json', settings), getMenu: () => menu, getPromos: () => promos, cashbackLive,
  admin, adminTx, clean, myDay, siteBase, aiModel, tg, deferSocial, internalKey, sameSecret, express })(app)

// health checks for /check and the AI helper's check_health tool. level: error = customers or alerts are affected,
// warn = needs attention, ok = fine.
async function diagnostics() {
  const out = []
  const add = (level, area, text) => out.push({ level, area, text })
  add(settings.open ? 'ok' : 'warn', 'Kedai', settings.open ? 'Dibuka, menerima pesanan' : 'TUTUP - pelanggan tidak boleh order')
  if (!settings.shop) add('error', 'Lokasi kedai', 'Belum ditetapkan - caj penghantaran tidak boleh dikira, checkout gagal')
  const selling = menu.filter((m) => m.available && !m.pendingPrice)
  add(selling.length ? 'ok' : 'error', 'Menu', `${selling.length}/${menu.length} produk boleh dijual`)
  const noPrice = menu.filter((m) => m.pendingPrice)
  if (noPrice.length) add('warn', 'Menu', `Dapur tambah produk tanpa harga jualan: ${noPrice.map((m) => m.name).join(', ')}`)
  const p = settings.payment
  if (p.transfer && !p.qr && !p.accountNumber) add('warn', 'Bayaran', 'Pindahan bank hidup tetapi tiada QR atau nombor akaun')
  const off = [!settings.staff.kitchenPin && 'dapur', !settings.staff.riderPin && 'rider'].filter(Boolean)
  if (off.length) add('warn', 'Staf', `Halaman ${off.join(' & ')} dimatikan (tiada PIN)`)
  const now = Date.now()
  const stuck = orders.filter((o) => !['done', 'cancelled'].includes(o.status) && now - new Date(o.history?.at(-1)?.at || o.createdAt).getTime() > 3 * 3600 * 1000)
  if (stuck.length) add('warn', 'Pesanan', `Tidak bergerak lebih 3 jam: ${stuck.slice(0, 8).map((o) => `${o.id} (${o.status})`).join(', ')}`)
  const receipts = orders.filter((o) => o.payment?.status === 'pending').length
  if (receipts) add('warn', 'Resit', `${receipts} resit pindahan menunggu semakan`)
  const bankinWait = bankins.filter((b) => b.status === 'pending').length
  if (bankinWait) add('warn', 'Bank-in rider', `${bankinWait} bank-in menunggu pengesahan`)
  const walletWait = Object.values(wallets.accounts).filter((w) => w.status === 'pending').length + wallets.tx.filter((x) => x.status === 'pending').length
  if (walletWait) add('warn', 'Dompet', `${walletWait} permohonan dompet menunggu kelulusan`)
  const waiting = load('support.json', []).filter((x) => x.status === 'waiting').length
  if (waiting) add('warn', 'Chat pelanggan', `${waiting} pelanggan menunggu balasan anda`)
  if (!settings.googleClientId) add('warn', 'Log masuk seller', 'Google sign-in belum ditetapkan')
  if (settings.aiChat.enabled && !aiGenerate) add('warn', 'AI chat pelanggan', 'Workers AI tiada di sini (server tempatan) - balasan terbina dalam sahaja')
  else add('ok', 'AI chat pelanggan', settings.aiChat.enabled ? 'Hidup' : 'Mati - balasan terbina dalam sahaja')
  const t = settings.telegram
  const c = tgCreds()
  if (c.mode === 'off') add('warn', 'Telegram', 'Bot belum ditambah')
  else {
    if (!c.chat) add('warn', 'Telegram', 'Bot ada tetapi chat pemilik belum disambung')
    if (t.blockedAt) add('error', 'Telegram', 'Bot disekat dalam Telegram - buka bot dan tekan Restart/Unblock')
    if (!t.enabled) add('warn', 'Telegram', 'Semua notifikasi dimatikan dalam tetapan')
    const d = tgDelivery()
    if (d.ok === false) add('error', 'Notifikasi', `Hantaran terakhir gagal: ${d.error}`)
    if (d.queued > 3) add('warn', 'Notifikasi', `${d.queued} mesej masih dalam barisan`)
    const w = await webhookCheck()
    if (!w.reachable) add('error', 'Webhook', `Telegram tidak dapat dihubungi: ${w.error}`)
    else if (!w.ok) add('error', 'Webhook', `Bot menghala ke ${w.url || 'tiada alamat'}, bukan kedai ini. Tampal semula token bot di dashboard.`)
    else if (w.lastError && now - w.lastErrorAt < 3600 * 1000) add('warn', 'Webhook', `Ralat dalam sejam lepas: ${w.lastError}`)
    else add('ok', 'Webhook', w.fixed ? 'OK (butang Sahkan dibaiki sekarang)' : 'OK')
  }
  return out
}
// the AI helper's memory: last messages + at most one change plan waiting for Confirm
app.get('/api/admin/ops/state', admin, (_req, res) => {
  const { history, pending } = opsState()
  res.json({ history, pending, model: settings.opsAi.model, shopName: settings.shopName, today: myDay() })
})
app.put('/api/admin/ops/state', admin, (req, res) => {
  const b = req.body || {}
  const s2 = opsState()
  if (b.history !== undefined) s2.history = (Array.isArray(b.history) ? b.history : []).filter((x) => ['user', 'assistant'].includes(x?.role)).slice(-16)
    .map((x) => ({ role: x.role, content: String(x.content || '').slice(0, 3000) }))
  if (b.pending !== undefined) s2.pending = b.pending && Array.isArray(b.pending.calls)
    ? { id: String(b.pending.id).slice(0, 16), calls: b.pending.calls.slice(0, 10).map((x) => ({ name: String(x?.name), args: x?.args || {} })), exp: Math.min(+b.pending.exp || 0, Date.now() + PLAN_TTL) } : null
  save('ops-assistant.json', s2)
  res.json({ ok: true })
})
app.get('/api/admin/ops/diagnostics', admin, async (_req, res) => res.json({ checks: await diagnostics(), at: new Date().toISOString() }))

// ---- end of shared business rules (scripts/prepare-cloud.mjs copies everything above into the cloud backend)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// ---- web app
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }))
  app.get('/{*any}', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
} else {
  app.get('/', (_req, res) => res.send('Web app not built yet: run "npm run build" (Start Pizzadonia.bat does it).'))
}

// ---- public link for customers, saved as settings.publicUrl and shown on the admin page.
// TUNNEL=ngrok (default): the ngrok account's free FIXED address (same link after restarts; visitors see ngrok's
// "You are about to visit" page once and tap Visit Site). If ngrok is missing or keeps failing (e.g. another ngrok
// session already runs on this account), falls back to a Cloudflare quick tunnel (new random link every start).
// TUNNEL=cloudflare forces Cloudflare; PUBLIC=0 turns the public link off.
const NGROK = [path.join(process.env.LOCALAPPDATA || '', 'ngrok', 'ngrok.exe')].find((f) => fs.existsSync(f))
const CLOUDFLARED = ['C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe'].find((f) => fs.existsSync(f))
let tunnel = null
let ngrokFails = 0
function startTunnel() {
  if (process.env.PUBLIC === '0') return
  const useNgrok = NGROK && process.env.TUNNEL !== 'cloudflare' && ngrokFails < 3
  if (!useNgrok && !CLOUDFLARED) return console.log('Public link off: neither ngrok nor cloudflared is installed.')
  const [exe, args, pattern] = useNgrok
    ? [NGROK, ['http', `http://127.0.0.1:${PORT}`, '--log', 'stdout', '--log-format', 'logfmt'], /url=(https:\/\/[a-z0-9.-]+\.ngrok[a-z.-]*)/]
    : [CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/]
  const startedAt = Date.now()
  tunnel = spawn(exe, args, { windowsHide: true })
  let found = false
  const scan = (buf) => {
    const text = String(buf)
    const err = useNgrok && text.match(/ERR_NGROK_\d+[^\n]*/)
    if (err) console.log(`ngrok: ${err[0].slice(0, 200)}`)
    const m = !found && text.match(pattern)
    if (!m) return
    found = true
    ngrokFails = useNgrok ? 0 : ngrokFails
    settings.tunnelUrl = m[1]
    settings.publicUrl = settings.siteUrl || m[1]
    save('settings.json', settings)
    console.log(`PUBLIC customer link (${useNgrok ? 'ngrok, fixed' : 'Cloudflare, changes on restart'}): ${m[1]}`)
  }
  tunnel.stdout.on('data', scan)
  tunnel.stderr.on('data', scan)
  tunnel.on('error', (e) => console.log(`Public tunnel could not start: ${e.message}`))
  tunnel.on('exit', (code) => {
    tunnel = null
    if (useNgrok && Date.now() - startedAt < 60000) ngrokFails++
    console.log(`Public tunnel stopped (code ${code}) - restarting in 10 s${useNgrok && ngrokFails >= 3 ? ' with Cloudflare instead' : ''}`)
    if (!useNgrok && settings.tunnelUrl.includes('trycloudflare')) (settings.tunnelUrl = ''), (settings.publicUrl = settings.siteUrl || ''), save('settings.json', settings)
    setTimeout(startTunnel, 10000)
  })
}
const stopTunnel = () => tunnel?.kill()
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => (stopTunnel(), process.exit(0)))
process.on('exit', stopTunnel)

app.listen(PORT, HOST, () => {
  console.log(`Pizzadonia shop   http://127.0.0.1:${PORT}`)
  console.log(`Admin (orders)    http://127.0.0.1:${PORT}/#/admin   PIN: ${settings.adminPin}`)
  if (!settings.shop) console.log('NOTE: set the shop location on the admin page (Settings) - delivery fees need it.')
  startTunnel()
})
