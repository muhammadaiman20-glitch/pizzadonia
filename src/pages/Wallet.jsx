import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Clock, FileUp, Gift, Landmark, Loader2, RotateCcw, Sparkles, Wallet as WalletIcon } from 'lucide-react'
import { Header } from './Shop.jsx'
import { autoRefresh, api, rm, useAccount } from '../lib.js'
import { BANKS, guessBank } from '../banks.js'
import { shrink } from '../components/PaymentPanel.jsx'
import { withTxPin } from '../components/PinPrompt.jsx'
import { accountApi } from '../lib.js'

export const TX = {
  topup: ['Tambah nilai', ArrowDownLeft], bonus: ['Bonus / promo', Gift], refund: ['Refund', RotateCcw], fee: ['Caj penghantaran', ArrowDownLeft],
  adjust: ['Pelarasan', Sparkles], cashback: ['Cashback', Gift], welcome: ['Hadiah pelanggan baru', Gift], order: ['Bayar pesanan', ArrowUpRight], withdraw: ['Keluar ke bank', Landmark],
}
const TX_STATUS = { pending: ['Menunggu', 'bg-cheese text-ink'], done: ['Selesai', 'bg-basil/15 text-basil'], rejected: ['Ditolak', 'bg-tomato/10 text-tomato'] }

export function TxList({ tx }) {
  if (!tx?.length) return <p className="card p-6 text-center text-[14px] text-muted">Belum ada transaksi.</p>
  return (
    <ul className="card divide-y divide-line">
      {tx.map((t) => {
        const [label, Icon] = TX[t.type] || [t.type, Sparkles]
        const [sl, scls] = TX_STATUS[t.status] || ['', '']
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${t.amount >= 0 ? 'bg-basil/10 text-basil' : 'bg-tomato/10 text-tomato'}`}><Icon className="size-4" /></span>
            <div className="min-w-0 flex-1 text-[13.5px]">
              <div className="font-bold">{label}{t.ref ? ` · ${t.ref}` : ''}</div>
              <div className="truncate text-[12px] text-muted">
                {new Date(t.at).toLocaleString('ms-MY', { dateStyle: 'short', timeStyle: 'short' })}{t.note && t.note !== label ? ` · ${t.note}` : ''}
                {t.status === 'rejected' && t.reason ? ` · ${t.reason}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className={`font-extrabold tabular-nums ${t.amount >= 0 ? 'text-basil' : 'text-ink'}`}>{t.amount >= 0 ? '+' : '-'}{rm(Math.abs(t.amount))}</div>
              {t.status !== 'done' && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${scls}`}>{sl}</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Name + bank + account number, with the smart bank guess. Used by customers and the rider. */
export function BankForm({ initial = {}, busy, onSubmit, submitLabel }) {
  const [name, setName] = useState(initial.name || '')
  const [acct, setAcct] = useState(initial.accountNumber || '')
  const [bank, setBank] = useState(initial.bankName || '')
  const [touched, setTouched] = useState(Boolean(initial.bankName))
  const guesses = guessBank(acct)
  useEffect(() => {
    if (!touched && guesses[0]) setBank(guesses[0].bank)
  }, [acct]) // eslint-disable-line react-hooks/exhaustive-deps
  const digits = acct.replace(/\D/g, '')
  const ok = name.trim().length >= 3 && /^\d{8,18}$/.test(digits) && BANKS.includes(bank)
  return (
    <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), ok && onSubmit({ name: name.trim(), accountNumber: digits, bankName: bank }))}>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-bold">Nama penuh (seperti dalam akaun bank)</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nama pemilik akaun" autoComplete="name" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-bold">No. akaun bank</span>
        <input className="field tabular-nums tracking-wide" value={acct} onChange={(e) => setAcct(e.target.value.replace(/[^\d -]/g, ''))} inputMode="numeric" maxLength={22} placeholder="Contoh: 1621 2345 6789" />
      </label>
      {guesses.length > 0 && (
        <div className="rounded-2xl bg-cream px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-muted"><Sparkles className="size-3.5 text-crust" /> Tekaan pintar - tekan untuk pilih</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {guesses.map((g) => (
              <button type="button" key={g.bank} onClick={() => (setBank(g.bank), setTouched(true))}
                className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${bank === g.bank ? 'bg-tomato text-white' : 'border border-line bg-white'}`}>
                {g.bank} <span className="font-normal opacity-75">({g.why})</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted">No. akaun tidak ada kod bank, jadi ini hanya tekaan. Sila pastikan bank betul.</p>
        </div>
      )}
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-bold">Bank</span>
        <select className="field" value={bank} onChange={(e) => (setBank(e.target.value), setTouched(true))}>
          <option value="">Pilih bank…</option>
          {BANKS.map((b) => <option key={b}>{b}</option>)}
        </select>
      </label>
      <button className="btn btn-red w-full py-3.5 text-[15px]" disabled={!ok || busy}>{busy && <Loader2 className="size-4 animate-spin" />} {submitLabel}</button>
    </form>
  )
}

function TopUp({ payTo, onDone }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef(null)
  const a = +amount
  const send = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    setErr('')
    try {
      const body = await shrink(f)
      const token = JSON.parse(localStorage.getItem('pz.session') || 'null')
      const r = await fetch(`/api/wallet/topup?amount=${a}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': body.type || 'application/octet-stream' }, body })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Gagal')
      onDone(j)
      setAmount('')
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[20, 50, 100, 200].map((v) => (
          <button key={v} type="button" onClick={() => setAmount(String(v))} className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${a === v ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{rm(v)}</button>
        ))}
      </div>
      <input className="field" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Jumlah lain (RM5 - RM2000)" />
      {a >= 5 && (
        <div className="rounded-2xl bg-cream p-3 text-[13.5px]">
          <p className="mb-2">1. Pindah tepat <b>{rm(a)}</b> ke akaun Pizzadonia. 2. Muat naik resit di bawah.</p>
          <div className="flex flex-wrap items-center gap-4">
            {payTo.qr && <img src={payTo.qr} alt="QR Pizzadonia" className="size-32 rounded-xl bg-white object-contain p-1" />}
            <div>
              <div className="font-bold">{payTo.bankName || 'Bank belum ditetapkan oleh kedai'}</div>
              <div className="text-muted">{payTo.accountName}</div>
              <div className="select-all text-[16px] font-extrabold tabular-nums">{payTo.accountNumber}</div>
            </div>
          </div>
        </div>
      )}
      <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={send} />
      <button className="btn btn-red w-full py-3" disabled={!(a >= 5 && a <= 2000) || busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Muat naik resit {a >= 5 ? rm(a) : ''}
      </button>
      {err && <p className="text-[13px] font-semibold text-tomato">{err}</p>}
    </div>
  )
}

function Withdraw({ w, onDone }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const a = +amount
  const send = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await withTxPin(`Refund ${rm(a)} ke bank`, (txPin) => api('/api/wallet/withdraw', { method: 'POST', body: { amount: a, txPin } }), `${w.bankName} · ${w.accountNumber}`)
      if (r) onDone(r)
      setAmount('')
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Wang dihantar ke <b className="text-ink">{w.bankName} · {w.accountNumber}</b> ({w.name}) selepas kedai luluskan.</p>
      {w.unspentPromo > 0 && (
        <p className="rounded-xl bg-cheese/30 px-3 py-2 text-[12.5px]">{rm(w.unspentPromo)} daripada baki anda ialah hadiah / bonus / cashback - boleh digunakan untuk order, tetapi tidak boleh dikeluarkan ke bank.</p>
      )}
      <div className="flex gap-2">
        <input className="field" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={`Maks ${rm(w.withdrawable ?? w.available)}`} />
        <button type="button" className="btn btn-ghost shrink-0 px-4 text-[13px]" onClick={() => setAmount(String(w.withdrawable ?? w.available))}>Semua</button>
      </div>
      <button className="btn btn-red w-full py-3" disabled={!(a >= 5 && a <= (w.withdrawable ?? w.available)) || busy} onClick={send}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Landmark className="size-4" />} Mohon refund {a >= 5 ? rm(a) : ''}
      </button>
      {err && <p className="text-[13px] font-semibold text-tomato">{err}</p>}
    </div>
  )
}

/** Set or change the transaction PIN (Google-only customers have none until they set it here). */
function TxPinCard({ acc }) {
  const [open, setOpen] = useState(!acc.hasPin)
  const [oldPin, setOldPin] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const save = async (e) => {
    e.preventDefault()
    if (p1 !== p2) return setMsg('PIN tidak sama')
    setBusy(true)
    setMsg('')
    try {
      const r = await api('/api/account/pin', { method: 'POST', body: { pin: p1, oldPin: acc.hasPin ? oldPin : undefined } })
      accountApi.set({ ...acc, ...r })
      setOpen(false)
      setOldPin('')
      setP1('')
      setP2('')
      setMsg('PIN transaksi disimpan')
    } catch (e2) {
      setMsg(e2.message)
    }
    setBusy(false)
  }
  const digits = (set) => (e) => set(e.target.value.replace(/\D/g, '').slice(0, 6))
  return (
    <section className={`card mt-4 p-4 ${acc.hasPin ? '' : 'ring-2 ring-tomato'}`}>
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <span className="font-bold">PIN transaksi</span>
        <span className="text-muted">{acc.hasPin ? 'diperlukan untuk bayar dengan dompet dan refund' : 'belum ditetapkan - wajib sebelum guna dompet'}</span>
        <button className="btn btn-ghost ml-auto px-3 py-1 text-[12.5px]" onClick={() => setOpen((v) => !v)}>{open ? 'Tutup' : acc.hasPin ? 'Tukar PIN' : 'Tetapkan'}</button>
      </div>
      {open && (
        <form onSubmit={save} className="mt-3 grid gap-2 sm:grid-cols-3">
          {acc.hasPin && <input className="field tracking-[0.3em]" type="password" inputMode="numeric" placeholder="PIN lama" value={oldPin} onChange={digits(setOldPin)} />}
          <input className="field tracking-[0.3em]" type="password" inputMode="numeric" placeholder="PIN baru (4-6)" value={p1} onChange={digits(setP1)} />
          <input className="field tracking-[0.3em]" type="password" inputMode="numeric" placeholder="Ulang PIN" value={p2} onChange={digits(setP2)} />
          <button className="btn btn-red py-2.5 text-[13.5px] sm:col-span-3" disabled={busy || p1.length < 4 || (acc.hasPin && oldPin.length < 4)}>Simpan PIN</button>
        </form>
      )}
      {msg && <p className="mt-2 text-[12.5px] font-semibold text-muted">{msg}</p>}
    </section>
  )
}

export default function Wallet() {
  const acc = useAccount()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState('')
  useEffect(() => {
    if (!acc) return
    let stop = false
    const load = () => api('/api/wallet').then((x) => !stop && setD(x)).catch((e) => !stop && setErr(e.message))
    const stopSync = autoRefresh(load, 5000)
    return () => { stop = true; stopSync() }
  }, [acc])
  const activate = async (form) => {
    setBusy(true)
    setErr('')
    try {
      setD(await api('/api/wallet/activate', { method: 'POST', body: form }))
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const w = d?.wallet

  return (
    <div className="min-h-dvh pb-16">
      <Header />
      <div className="mx-auto max-w-xl px-4 pt-7">
        <h1 className="flex items-center gap-2 font-display text-4xl tracking-wide"><WalletIcon className="size-8 text-tomato" /> Dompet saya</h1>
        {acc === undefined || (acc && !d && !err) ? (
          <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
        ) : !acc ? (
          <div className="card mt-5 p-6 text-center">
            <p className="text-muted">Log masuk dulu untuk guna dompet.</p>
            <a href="#/akaun" className="btn btn-red mt-4 px-6 py-3">Log masuk / daftar</a>
          </div>
        ) : !w || w.status === 'rejected' ? (
          <section className="card mt-5 p-5">
            <h2 className="font-display text-2xl tracking-wide">Aktifkan dompet</h2>
            <p className="mt-1 text-[13.5px] text-muted">Simpan baki untuk order lebih cepat, terima bonus promo, dan minta refund ke bank anda. Isi maklumat bank anda (untuk refund).</p>
            {w?.status === 'rejected' && <p className="mt-3 rounded-xl bg-tomato/10 px-3 py-2 text-[13px] font-semibold text-tomato">Permohonan ditolak: {w.reason}. Sila semak dan hantar semula.</p>}
            <div className="mt-4"><BankForm initial={w || { name: acc.name }} busy={busy} onSubmit={activate} submitLabel="Hantar permohonan" /></div>
          </section>
        ) : w.status === 'pending' ? (
          <section className="card mt-5 p-6 text-center">
            <Clock className="mx-auto size-10 text-crust" />
            <h2 className="mt-2 font-display text-2xl tracking-wide">Permohonan sedang disemak</h2>
            <p className="mt-1 text-[13.5px] text-muted">{w.name} · {w.bankName} · {w.accountNumber}</p>
            <p className="mt-2 text-[13px] text-muted">Kedai akan aktifkan dompet anda tidak lama lagi. Halaman ini dikemas kini sendiri.</p>
          </section>
        ) : (
          <>
            <section className="mt-5 overflow-hidden rounded-[26px] bg-gradient-to-br from-tomato via-tomato-deep to-ink p-6 text-white shadow-pop">
              <div className="text-[12.5px] font-bold uppercase tracking-wider text-white/70">Baki boleh guna</div>
              <div className="mt-1 font-display text-5xl tracking-wide">{rm(w.available)}</div>
              {w.held > 0 && <div className="mt-1 text-[13px] text-white/80">{rm(w.held)} sedang diproses untuk refund</div>}
              {w.unspentWelcome > 0 && <div className="mt-1 text-[13px] text-white/90">🎁 termasuk hadiah {rm(w.unspentWelcome)} - guna untuk order seterusnya</div>}
              {w.status === 'frozen' && <div className="mt-2 rounded-xl bg-white/15 px-3 py-1.5 text-[13px]">Dompet dibekukan: {w.reason || 'hubungi kedai'}</div>}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className={`btn py-3 text-[14px] ${panel === 'topup' ? 'bg-white text-tomato' : 'bg-white/15 text-white'}`} onClick={() => setPanel(panel === 'topup' ? '' : 'topup')} disabled={w.status !== 'active'}>
                  <ArrowDownLeft className="size-4" /> Tambah nilai
                </button>
                <button className={`btn py-3 text-[14px] ${panel === 'out' ? 'bg-white text-tomato' : 'bg-white/15 text-white'}`} onClick={() => setPanel(panel === 'out' ? '' : 'out')} disabled={w.status !== 'active'}>
                  <Landmark className="size-4" /> Refund ke bank
                </button>
              </div>
            </section>
            {panel && (
              <section className="card mt-4 p-5">
                {panel === 'topup' ? <TopUp payTo={d.payTo} onDone={(x) => (setD(x), setPanel(''))} /> : <Withdraw w={w} onDone={(x) => (setD(x), setPanel(''))} />}
              </section>
            )}
            <TxPinCard acc={acc} />
            <p className="mt-3 text-center text-[12.5px] text-muted">Guna dompet di checkout: pilih <b>Bayar dengan dompet</b>.</p>
            <h2 className="mt-6 mb-2 font-display text-xl tracking-wide">Sejarah</h2>
            <TxList tx={w.tx} />
          </>
        )}
        {err && <p className="mt-3 text-center text-[13px] font-semibold text-tomato">{err}</p>}
      </div>
    </div>
  )
}
