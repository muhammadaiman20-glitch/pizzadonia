// Owner's business account book (the Ryt Bank account the shop is paid into). Seller-only.
// Balance = opening balance + automatic entries (worked out from orders, bank-ins and wallets every time, so they
// always match the records) + the owner's own entries (salary, expenses, other income, corrections).
import crypto from 'node:crypto'

const CATS = {
  salary: { label: 'Salary (owner)', dir: 'out' },
  expense: { label: 'Business expense', dir: 'out' },
  income: { label: 'Other income', dir: 'in' },
  adjust_in: { label: 'Correction (+)', dir: 'in' },
  adjust_out: { label: 'Correction (-)', dir: 'out' },
}

export function createLedger({ load, save, getSettings, getOrders, getBankins, getWallets, walletBal, admin, adminTx, clean, money }) {
  let book = load('ledger.json', { opening: { amount: 0, date: '' }, entries: [] })
  const persist = () => save('ledger.json', book)

  function autoEntries() {
    const out = []
    for (const o of getOrders()) {
      if (o.paymentMethod === 'transfer' && o.payment?.status === 'paid')
        out.push({ id: `pay-${o.id}`, at: o.payment.paidAt || o.createdAt, dir: 'in', amount: o.total, cat: 'sale_transfer', label: `Customer transfer · ${o.id}`, ref: o.id, who: o.customer.name })
      const sp = o.history?.find((h) => h.status === 'supplier_paid')
      if (sp && (o.supplierCost ?? 0) > 0)
        out.push({ id: `sup-${o.id}`, at: sp.at, dir: 'out', amount: o.supplierCost, cat: 'supplier', label: `Paid kitchen · ${o.id}`, ref: o.id, who: getSettings().staff?.kitchenName || 'Kitchen' })
    }
    for (const b of getBankins()) {
      if (b.status === 'confirmed')
        out.push({ id: `bi-${b.id}`, at: b.confirmedAt || b.at, dir: 'in', amount: b.amount, cat: 'sale_cod', label: `Rider COD bank-in · ${b.id} (${b.orders.join(', ')})`, ref: b.id, who: 'Rider' })
    }
    for (const t of getWallets().tx) {
      if (t.status !== 'done') continue
      if (t.type === 'topup') out.push({ id: `tx-${t.id}`, at: t.doneAt || t.at, dir: 'in', amount: t.amount, cat: 'wallet_topup', label: `Wallet top-up · ${t.wallet.startsWith('c:') ? '+' + t.wallet.slice(2) : t.wallet}`, ref: t.id })
      if (t.type === 'withdraw') out.push({ id: `tx-${t.id}`, at: t.doneAt || t.at, dir: 'out', amount: -t.amount, cat: t.wallet === 'rider' ? 'rider_payout' : 'wallet_refund', label: t.wallet === 'rider' ? 'Rider payout' : `Wallet refund · +${t.wallet.slice(2)}`, ref: t.id })
    }
    return out
  }

  // money in the bank that is not the owner's yet: customer + rider wallet balances
  function heldForOthers() {
    const w = getWallets()
    return money(Object.keys(w.accounts).reduce((s, k) => s + Math.max(0, walletBal(k).balance), 0))
  }

  function statement() {
    const from = book.opening.date ? new Date(book.opening.date + 'T00:00:00+08:00').getTime() : 0
    const all = [...autoEntries().map((e) => ({ ...e, auto: true })), ...book.entries.map((e) => ({ ...e, auto: false }))]
      .filter((e) => new Date(e.at).getTime() >= from)
      .sort((a, b) => a.at.localeCompare(b.at))
    let bal = book.opening.amount || 0
    for (const e of all) {
      bal = money(bal + (e.dir === 'in' ? e.amount : -e.amount))
      e.balance = bal
    }
    return { opening: book.opening, balance: bal, held: heldForOthers(), entries: all }
  }

  return function routes(app) {
    app.get('/api/admin/ledger', admin, (_req, res) => {
      const s = statement()
      res.json({ ...s, safeToWithdraw: money(Math.max(0, s.balance - s.held)), bank: getSettings().payment?.bankName || 'Bank', cats: CATS })
    })
    app.post('/api/admin/ledger/opening', admin, adminTx, (req, res) => {
      const amount = +req.body?.amount
      const date = String(req.body?.date || '')
      if (!Number.isFinite(amount) || Math.abs(amount) > 10_000_000) return res.status(400).json({ error: 'Enter the balance in RM' })
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Bad date' })
      book.opening = { amount: money(amount), date, setAt: new Date().toISOString() }
      persist()
      res.json({ ok: true })
    })
    app.post('/api/admin/ledger', admin, adminTx, (req, res) => {
      const b = req.body || {}
      const cat = CATS[b.cat] ? b.cat : null
      const amount = money(+b.amount)
      if (!cat) return res.status(400).json({ error: 'Pick a type' })
      if (!(amount > 0 && amount <= 1_000_000)) return res.status(400).json({ error: 'Amount must be more than RM0' })
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : null
      const at = date ? new Date(`${date}T12:00:00+08:00`).toISOString() : new Date().toISOString()
      const e = { id: 'L-' + crypto.randomBytes(4).toString('hex'), at, dir: CATS[cat].dir, amount, cat, label: clean(b.note, 120) || CATS[cat].label, createdAt: new Date().toISOString() }
      book.entries.push(e)
      persist()
      console.log(`[ledger] ${cat} RM${amount} ${e.label}`)
      res.json({ ok: true, entry: e })
    })
    app.delete('/api/admin/ledger/:id', admin, adminTx, (req, res) => {
      const n = book.entries.length
      book.entries = book.entries.filter((e) => e.id !== req.params.id)
      if (book.entries.length === n) return res.status(404).json({ error: 'Only your own entries can be deleted (automatic ones follow the orders)' })
      persist()
      res.json({ ok: true })
    })
  }
}
