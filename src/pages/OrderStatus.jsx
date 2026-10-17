import { useEffect, useState } from 'react'
import { Banknote, Check, Loader2, MapPin, MessageCircle, UserRound, XCircle } from 'lucide-react'
import { Header } from './Shop.jsx'
import OrderMap from '../components/OrderMap.jsx'
import PaymentPanel from '../components/PaymentPanel.jsx'
import { StatusChip } from './Account.jsx'
import { autoRefresh, api, rm, useAccount, waLink } from '../lib.js'
import { STEPS, stepIndex, stepOf } from '../status.js'

// transfer orders are paid up front: no "have cash ready" wording for them
const TRANSFER_SUB = { delivering: 'Rider sedang menuju ke lokasi anda', done: 'Diterima. Selamat menjamu selera!' }
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('ms-MY', { hour: 'numeric', minute: '2-digit' })

export default function OrderStatus({ id, token }) {
  const [o, setO] = useState(null)
  const [err, setErr] = useState('')
  const acc = useAccount()
  useEffect(() => {
    let stop = false
    const load = () =>
      api(`/api/orders/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`)
        .then((r) => !stop && (setO(r), setErr('')))
        .catch((e) => !stop && setErr(e.message))
    const stopSync = autoRefresh(load, 5000)
    return () => { stop = true; stopSync() }
  }, [id, token])

  if (err && !o)
    return (
      <div className="min-h-dvh">
        <Header />
        <p className="mx-auto mt-16 max-w-md rounded-2xl bg-tomato/10 p-5 text-center font-semibold text-tomato">{err}</p>
      </div>
    )
  if (!o)
    return (
      <div className="min-h-dvh">
        <Header />
        <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-tomato" /></div>
      </div>
    )

  const cancelled = o.status === 'cancelled'
  const at = stepIndex(o.status)
  const cur = stepOf(o.status)
  const when = (sid) => [...o.history].reverse().find((h) => h.status === sid)?.at
  const msg = `Salam ${o.shopName}, saya ${o.customer.name}. Pesanan ${o.id} (${rm(o.total)} COD).`
  const pct = cancelled ? 0 : Math.round((at / (STEPS.length - 1)) * 100)

  return (
    <div className="min-h-dvh pb-16">
      <Header />
      <div className="mx-auto max-w-2xl px-4 pt-7">
        {/* headline */}
        <div className="rise card overflow-hidden">
          <div className={`flex items-center gap-4 p-5 ${cancelled ? 'bg-tomato/5' : 'bg-gradient-to-br from-cheese/40 to-cream'}`}>
            <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${cancelled ? 'bg-tomato/15 text-tomato' : 'bg-white text-tomato shadow'}`}>
              {cancelled ? <XCircle className="size-7" /> : <cur.Icon className="size-7" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold uppercase tracking-wider text-muted">Pesanan {o.id}</div>
              <h1 className="font-display text-[28px] leading-tight tracking-wide">{cancelled ? 'Pesanan dibatalkan' : cur.ms}</h1>
              <p className="text-[13.5px] text-muted">{cancelled ? o.cancelReason || 'Sila hubungi kedai untuk maklumat lanjut.' : cur.msSub}</p>
            </div>
          </div>
          {!cancelled && (
            <div className="h-2 bg-line">
              <div className="h-full bg-gradient-to-r from-tomato to-crust transition-all duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
          )}
        </div>

        {o.proof && (
          <section className="card mt-5 overflow-hidden">
            <img src={`/api/orders/${encodeURIComponent(o.id)}/proof?t=${encodeURIComponent(token)}`} alt="Gambar pizza semasa diterima" className="max-h-96 w-full object-cover" />
            <p className="px-5 py-3 text-[13px] text-muted">
              Gambar oleh rider semasa penghantaran · {new Date(o.proof.at).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </section>
        )}
        {o.paymentMethod === 'transfer' && <PaymentPanel order={o} token={token} onUpdated={setO} />}

        {/* who + where */}
        <section className="card mt-5 p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
            <span className="flex items-center gap-2"><UserRound className="size-4 text-tomato" /> <b>{o.customer.name}</b></span>
            <span className="text-muted">{new Date(o.createdAt).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="ml-auto"><StatusChip status={o.status} /></span>
          </div>
          <div className="mt-4">
            <OrderMap shop={o.shop} points={[{ lat: o.location.lat, lng: o.location.lng, label: o.customer.name, sub: 'Lokasi penghantaran' }]} height={200} />
          </div>
          <p className="mt-3 flex items-start gap-2 text-[13.5px]"><MapPin className="mt-0.5 size-4 shrink-0 text-tomato" /> {o.location.address}</p>
          {o.location.notes && <p className="mt-1 pl-6 text-[12.5px] text-muted">Panduan rider: {o.location.notes}</p>}
        </section>

        {/* timeline */}
        {!cancelled && (
          <section className="card mt-5 p-5 sm:p-6">
            <h2 className="mb-4 font-display text-xl tracking-wide">Status pesanan</h2>
            <ol className="relative space-y-4">
              {STEPS.map((s, i) => {
                const done = i <= at
                const now = i === at
                return (
                  <li key={s.id} className="relative flex gap-4">
                    {i < STEPS.length - 1 && <span className={`absolute left-[19px] top-10 h-[calc(100%-14px)] w-0.5 ${i < at ? 'bg-basil' : 'bg-line'}`} />}
                    <span className={`relative grid size-10 shrink-0 place-items-center rounded-xl ${done ? 'bg-basil text-white' : 'bg-cream text-muted'} ${now ? 'ring-4 ring-basil/20' : ''}`}>
                      {done && !now ? <Check className="size-5" strokeWidth={3} /> : <s.Icon className="size-5" />}
                    </span>
                    <div className="pt-0.5">
                      <div className={`text-[14.5px] font-bold ${done ? '' : 'text-muted'}`}>
                        {s.ms} {now && o.status !== 'done' && <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-basil align-middle" />}
                      </div>
                      <div className="text-[12.5px] text-muted">{done && when(s.id) ? `${fmtTime(when(s.id))} · ` : ''}{o.paymentMethod === 'transfer' ? (TRANSFER_SUB[s.id] ?? s.msSub) : s.msSub}</div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {/* money */}
        <section className="card mt-5 p-5 sm:p-6">
          <div className="flex items-center gap-4 rounded-2xl bg-cheese/30 p-4">
            <Banknote className="size-7 shrink-0 text-crust" />
            <div>
              <div className="text-[13px] font-semibold text-muted">
                {o.refunded
                  ? `Dikembalikan ke dompet anda (${rm(o.refunded.amount)})`
                  : o.paymentMethod === 'wallet'
                  ? 'Sudah dibayar dengan dompet'
                  : o.paymentMethod === 'transfer'
                  ? o.payment.status === 'paid' ? 'Sudah dibayar (pindahan bank)' : 'Jumlah perlu dipindahkan'
                  : o.payment.status === 'paid' ? 'Sudah dibayar (COD)' : 'Sediakan wang tunai (COD)'}
              </div>
              <div className="font-display text-3xl tracking-wide">{rm(o.total)}</div>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-line text-[14px]">
            {o.items.map((it) => (
              <li key={it.id} className="flex justify-between py-2">
                <span>{it.qty} × {it.name}</span>
                <span className="font-semibold">{rm(it.line)}</span>
              </li>
            ))}
            {o.discount > 0 && (
              <li className="flex justify-between py-2 text-basil"><span>Promo {o.promo?.code}</span><span className="font-semibold">-{rm(o.discount)}</span></li>
            )}
            {o.cashback && (
              <li className="flex justify-between py-2 text-basil">
                <span>Cashback {o.cashback.status === 'credited' ? '(sudah masuk dompet)' : o.cashback.status === 'waiting_wallet' ? '(aktifkan dompet untuk terima)' : '(selepas pizza sampai)'}</span>
                <span className="font-semibold">+{rm(o.cashback.amount)}</span>
              </li>
            )}
            <li className="flex justify-between py-2 text-muted">
              <span>Penghantaran ({o.delivery.km} km)</span>
              <span className="font-semibold">{o.delivery.free ? 'PERCUMA' : rm(o.delivery.fee)}</span>
            </li>
          </ul>
          {o.whatsapp && (
            <a href={waLink(o.whatsapp, msg)} target="_blank" rel="noreferrer" className="btn mt-5 w-full bg-[#25d366] py-3.5 text-[15px] text-white hover:brightness-95">
              <MessageCircle className="size-5" /> WhatsApp kedai
            </a>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a href="#/" className="btn btn-ghost py-3 text-[14px]">Kembali ke menu</a>
            <a href="#/akaun" className="btn btn-ghost py-3 text-[14px]">{acc ? 'Semua pesanan saya' : 'Log masuk / daftar'}</a>
          </div>
        </section>
        <p className="mt-4 text-center text-[12.5px] text-muted">Halaman ini dikemas kini sendiri setiap 10 saat.</p>
      </div>
    </div>
  )
}
