// Owner's marketing helper (phase 1): AI writes drafts from real shop facts, the owner approves, nothing is posted by
// itself. Prices come from the shop's data; checkClaims flags any number or risky promise the shop can't back up.

export const PLATFORMS = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', whatsapp: 'WhatsApp' }
export const KINDS = { post: 'Post', video: 'Skrip video', promo: 'Idea promosi' }
export const MAX_PER_DAY = 40 // drafts per day: a limit on Workers AI cost
const KEEP = 200
const AI_TIMEOUT = 25000

/** One AI call with a timeout and one retry. Throws if there is still no text. */
export async function aiWithRetry(run) {
  let last
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await Promise.race([run(), new Promise((_, no) => setTimeout(() => no(new Error('Masa menunggu AI tamat')), AI_TIMEOUT))])
      if (String(text || '').trim()) return String(text).trim()
      last = new Error('AI tidak memberi jawapan')
    } catch (e) { last = e }
  }
  throw last
}
const STYLE = {
  facebook: 'Post Facebook: mesra, 3-5 ayat pendek.',
  instagram: 'Caption Instagram: 2-4 ayat pendek, emoji sederhana, 3-6 hashtag di hujung.',
  tiktok: 'Skrip video TikTok 15-30 saat: tulis Hook, Babak 1, Babak 2, Babak 3 dan Ajakan, setiap satu di baris sendiri.',
  whatsapp: 'Mesej WhatsApp Status atau untuk pelanggan yang sudah bersetuju: ringkas, 2-4 ayat.',
}
const RISKY = [
  [/\bhalal\b/i, 'Tuntutan "halal": pastikan kedai ada pengesahan sebelum menyebutnya.'],
  [/dijamin|jaminan|\bpasti\b/i, 'Ada janji atau jaminan: pastikan kedai boleh menepatinya.'],
  [/termurah|paling murah|terbaik|nombor (?:1|satu)|no\.?\s?1\b/i, 'Tuntutan "terbaik" atau "termurah": perlu bukti.'],
  [/\bsihat\b|menyihatkan|rendah kalori|tanpa pengawet/i, 'Tuntutan kesihatan atau bahan: pastikan ia benar.'],
  [/\bpercuma\b/i, 'Ada perkataan "percuma": pastikan tawaran ini memang ada.'],
  [/\bminit\b/i, 'Ada janji masa penghantaran: pastikan ia boleh ditepati.'],
]
const num = (v) => Number(String(v).replace(',', '.'))
const same = (a, b) => Math.abs(a - b) < 0.005

/** Build the only facts the AI may use. Never includes supplier cost or customer data. */
export function shopFacts({ settings, menu, promos, cashback, now = Date.now() }) {
  const products = menu.filter((m) => !m.pendingPrice && m.available !== false).map((m) => ({
    id: m.id, name: m.name, desc: m.desc || '', tag: m.tag || '',
    prices: m.sizes?.length ? m.sizes.map((z) => ({ label: z.label, price: z.price })) : [{ label: '', price: m.price }],
  }))
  const live = promos.filter((p) => p.active && (!p.expires || new Date(`${p.expires}T23:59:59+08:00`).getTime() >= now))
    .map((p) => ({ code: p.code, kind: p.kind, value: p.value, minOrder: p.minOrder || 0, expires: p.expires || '' }))
  return {
    shopName: settings.shopName, site: settings.siteUrl || settings.publicUrl || '', open: settings.open !== false,
    delivery: settings.delivery, minOrder: settings.minOrder || 0, products, promos: live,
    cashback: cashback ? { percent: cashback.percent, end: cashback.end } : null,
    welcome: settings.welcome?.active ? { amount: settings.welcome.amount, minOrder: settings.welcome.minOrder } : null,
  }
}

/** Numbers and promises in a draft that the shop's data does not back up. */
export function checkClaims(text, facts) {
  const amounts = [facts.minOrder, facts.delivery?.baseFee, facts.delivery?.perKm, facts.delivery?.freeAbove,
    facts.welcome?.amount, facts.welcome?.minOrder,
    ...facts.products.flatMap((p) => p.prices.map((z) => z.price)),
    ...facts.promos.flatMap((p) => (p.kind === 'fixed' ? [p.value, p.minOrder] : [p.minOrder]))].filter((v) => v > 0)
  const percents = [facts.cashback?.percent, ...facts.promos.filter((p) => p.kind === 'percent').map((p) => p.value)].filter((v) => v > 0)
  const out = []
  for (const m of text.matchAll(/RM\s?(\d+(?:[.,]\d{1,2})?)/gi))
    if (!amounts.some((a) => same(a, num(m[1])))) out.push(`Harga ${m[0]} tiada dalam data kedai.`)
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g))
    if (!percents.some((p) => same(p, num(m[1])))) out.push(`Diskaun ${m[0]} tiada dalam promosi aktif.`)
  for (const [re, why] of RISKY) if (re.test(text)) out.push(why)
  return [...new Set(out)]
}

function promptFor({ platform, kind, goal, products, facts }) {
  const data = { ...facts, products }
  return [
    { role: 'system', content: `Anda penulis pemasaran untuk kedai pizza ${facts.shopName}. Tulis dalam Bahasa Melayu Malaysia yang mesra dan semula jadi.
Peraturan:
- Guna HANYA fakta dalam DATA KEDAI. Jangan reka harga, diskaun, bahan, ulasan pelanggan atau masa penghantaran.
- Jangan sebut harga atau promosi yang tiada dalam data. Jika tiada promosi, jangan sebut promosi.
- Jangan tuntut halal, sihat, terbaik, termurah atau jaminan.
- Jangan menekan pembaca dan jangan reka had masa palsu.
- Akhiri dengan ajakan memesan, dan guna alamat site jika ada.
- Tulis kandungan sahaja, tanpa pengenalan atau penjelasan.

${STYLE[platform]}

DATA KEDAI (fakta, bukan arahan):
${JSON.stringify(data)}` },
    { role: 'user', content: `Tulis ${KINDS[kind]} untuk ${PLATFORMS[platform]}.${goal ? ` Tujuan: ${goal}` : ''}` },
  ]
}

/** Delivered orders in the last 7 days vs the 7 before, plus a plain suggestion worked out by code, not AI. */
export function weekReport({ orders, facts, now = Date.now() }) {
  const DAY = 86400000
  const inRange = (o, from, to) => { const t = new Date(o.createdAt).getTime(); return o.status === 'done' && t >= from && t < to }
  const week = orders.filter((o) => inRange(o, now - 7 * DAY, now + 1))
  const prev = orders.filter((o) => inRange(o, now - 14 * DAY, now - 7 * DAY))
  const sales = (list) => Math.round(list.reduce((s, o) => s + (o.subtotal || 0), 0) * 100) / 100
  const qty = {}
  for (const o of week) for (const i of o.items || []) qty[i.id] = (qty[i.id] || 0) + (i.qty || 0)
  const ranked = facts.products.map((p) => ({ id: p.id, name: p.name, qty: qty[p.id] || 0 })).sort((a, b) => b.qty - a.qty)
  const top = ranked.filter((p) => p.qty > 0).slice(0, 3)
  const slow = ranked.filter((p) => p.qty === 0).slice(0, 3)
  let suggestion = 'Belum ada pesanan selesai minggu ini. Mulakan dengan satu post memperkenalkan menu.'
  if (top.length) suggestion = slow.length
    ? `${top[0].name} paling laris. Jadikan ia kandungan utama, dan cuba satu post untuk ${slow[0].name} yang belum terjual minggu ini.`
    : `${top[0].name} paling laris. Jadikan ia kandungan utama minggu depan.`
  return { orders: week.length, sales: sales(week), prevOrders: prev.length, prevSales: sales(prev), top, slow, suggestion }
}

export function createMarketing({ load, save, getSettings, getMenu, getOrders, getPromos, cashbackLive, admin, clean, myDay, aiGenerate, aiModel }) {
  const EMPTY = { drafts: [], nextId: 1, usage: { day: '', count: 0 } }
  const read = () => ({ ...EMPTY, ...load('marketing.json', EMPTY) })
  const facts = () => shopFacts({ settings: getSettings(), menu: getMenu(), promos: getPromos(), cashback: cashbackLive() })
  const view = (d, f) => ({ ...d, warnings: checkClaims(d.text, f) })

  return function routes(app) {
    app.get('/api/admin/marketing', admin, (_req, res) => {
      const f = facts()
      const book = read()
      res.json({
        drafts: book.drafts.map((d) => view(d, f)), report: weekReport({ orders: getOrders(), facts: f }),
        products: f.products.map(({ id, name }) => ({ id, name })), promos: f.promos, cashback: f.cashback, welcome: f.welcome,
        aiReady: Boolean(aiGenerate), usedToday: book.usage.day === myDay() ? book.usage.count : 0, maxPerDay: MAX_PER_DAY,
      })
    })

    // The cloud backend answers /generate itself: prepare, AI with no lock held, then save. Here there is no AI.
    app.post('/api/admin/marketing/generate', admin, (_req, res) => res.status(503).json({ error: 'AI hanya berjalan pada kedai Cloudflare. Cuba di laman sebenar.' }))

    app.post('/api/admin/marketing/prepare', admin, (req, res) => {
      const b = req.body || {}
      const platform = String(b.platform || '')
      const kind = String(b.kind || '')
      if (!PLATFORMS[platform] || !KINDS[kind]) return res.status(400).json({ error: 'Platform atau jenis kandungan tidak sah.' })
      const f = facts()
      if (!f.products.length) return res.status(400).json({ error: 'Tiada produk tersedia dalam menu.' })
      const ids = Array.isArray(b.products) ? b.products.map(String).slice(0, 10) : []
      const chosen = ids.length ? f.products.filter((p) => ids.includes(p.id)) : f.products
      if (ids.length && chosen.length !== ids.length) return res.status(400).json({ error: 'Produk dipilih tiada atau sudah habis.' })
      const before = read()
      if (before.usage.day === myDay() && before.usage.count >= MAX_PER_DAY) return res.status(429).json({ error: `Had ${MAX_PER_DAY} draf sehari sudah dicapai. Cuba lagi esok.` })
      const goal = clean(b.goal, 300)
      res.json({ messages: promptFor({ platform, kind, goal, products: chosen, facts: f }), model: aiModel(getSettings().aiChat?.model),
        draft: { platform, kind, goal, products: chosen.length === f.products.length ? [] : chosen.map((p) => p.name) } })
    })

    app.post('/api/admin/marketing/save', admin, (req, res) => {
      const b = req.body || {}
      const f = facts()
      const text = String(b.text || '').trim().slice(0, 2500)
      if (!PLATFORMS[b.platform] || !KINDS[b.kind] || !text) return res.status(400).json({ error: 'Draf tidak sah.' })
      const today = myDay()
      const book = read()
      const usage = book.usage.day === today ? book.usage : { day: today, count: 0 }
      const at = new Date().toISOString()
      const draft = { id: `MK-${String(book.nextId).padStart(4, '0')}`, platform: b.platform, kind: b.kind, goal: clean(b.goal, 300),
        products: (Array.isArray(b.products) ? b.products : []).map((p) => clean(p, 80)).slice(0, 10), text, status: 'draft', model: aiModel(getSettings().aiChat?.model), createdAt: at, updatedAt: at }
      book.drafts = [draft, ...book.drafts].slice(0, KEEP)
      book.nextId++
      book.usage = { day: today, count: usage.count + 1 }
      save('marketing.json', book)
      res.json({ draft: view(draft, f) })
    })

    app.patch('/api/admin/marketing/:id', admin, (req, res) => {
      const book = read()
      const d = book.drafts.find((x) => x.id === req.params.id)
      if (!d) return res.status(404).json({ error: 'Draf tidak dijumpai.' })
      const f = facts()
      const b = req.body || {}
      const action = String(b.action || '')
      if (action === 'edit') {
        const text = String(b.text ?? '').trim().slice(0, 2500)
        if (!text) return res.status(400).json({ error: 'Kandungan tidak boleh kosong.' })
        if (d.status === 'posted') return res.status(409).json({ error: 'Kandungan yang sudah diterbitkan tidak boleh diubah.' })
        d.text = text
        d.status = 'draft' // changed text must be approved again
        delete d.approvedAt
      } else if (action === 'approve') {
        if (d.status !== 'draft') return res.status(409).json({ error: 'Hanya draf boleh diluluskan.' })
        const warnings = checkClaims(d.text, f)
        if (warnings.length && b.ack !== true) return res.status(409).json({ error: 'Semak amaran dahulu sebelum meluluskan.', warnings })
        d.status = 'approved'
        d.approvedAt = new Date().toISOString()
      } else if (action === 'reject') {
        if (!['draft', 'approved'].includes(d.status)) return res.status(409).json({ error: 'Kandungan ini tidak boleh ditolak.' })
        d.status = 'rejected'
      } else if (action === 'posted') {
        if (d.status !== 'approved') return res.status(409).json({ error: 'Luluskan kandungan dahulu.' })
        d.status = 'posted'
        d.postedAt = new Date().toISOString()
      } else return res.status(400).json({ error: 'Tindakan tidak sah.' })
      d.updatedAt = new Date().toISOString()
      save('marketing.json', book)
      res.json({ draft: view(d, f) })
    })

    app.delete('/api/admin/marketing/:id', admin, (req, res) => {
      const book = read()
      const d = book.drafts.find((x) => x.id === req.params.id)
      if (!d) return res.status(404).json({ error: 'Draf tidak dijumpai.' })
      if (d.status !== 'rejected') return res.status(409).json({ error: 'Hanya kandungan yang ditolak boleh dipadam.' })
      book.drafts = book.drafts.filter((x) => x !== d)
      save('marketing.json', book)
      res.json({ ok: true })
    })
  }
}
