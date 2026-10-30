import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Banknote, Bike, ChevronLeft, Home, Loader2, MapPin, QrCode, Tag, UserRound, Wallet as WalletIcon, X } from 'lucide-react'
import MapPicker from '../components/MapPicker.jsx'
import { withTxPin } from '../components/PinPrompt.jsx'
import { Header, Stepper } from './Shop.jsx'
import { accountApi, api, cartApi, cartLines, cashbackFromCart, go, prettyPhone, rm, store, useAccount, useCart, useShop } from '../lib.js'

function Section({ n, title, children }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 font-display text-2xl tracking-wide">
        <span className="grid size-9 place-items-center rounded-xl bg-cheese text-xl">{n}</span> {title}
      </h2>
      {children}
    </section>
  )
}

export default function Checkout() {
  const { shop, error: shopErr } = useShop()
  const cart = useCart()
  const saved = store.get('pz.customer', {})
  const [point, setPoint] = useState(saved.point || null)
  const [address, setAddress] = useState(saved.address || '')
  const [addrTouched, setAddrTouched] = useState(Boolean(saved.address))
  const [notes, setNotes] = useState(saved.notes || '')
  const [name, setName] = useState(saved.name || '')
  const [phone, setPhone] = useState(saved.phone || '')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState('cod')
  const [promoIn, setPromoIn] = useState('')
  const [promo, setPromo] = useState(null) // { code, discount, label }
  const [promoErr, setPromoErr] = useState('')
  const [wallet, setWallet] = useState(null)
  const [q, setQ] = useState(null) // delivery quote
  const [quoting, setQuoting] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const reqId = useRef(0)
  const acc = useAccount()
  const [mapKey, setMapKey] = useState(0) // bump to re-centre the map on a saved address
  const [makeAccount, setMakeAccount] = useState(false)
  const [newPin, setNewPin] = useState('')
  // logged in: name + phone come from the account
  useEffect(() => {
    if (!acc) return
    setName((n) => n || acc.name)
    setPhone(prettyPhone(acc.phone))
  }, [acc])
  const pickSaved = (a) => {
    setPoint({ lat: a.lat, lng: a.lng })
    setAddress(a.address)
    setAddrTouched(true)
    setNotes(a.notes || '')
    setMapKey((k) => k + 1)
  }

  const menu = shop?.menu ?? []
  const payOpts = shop?.payment ?? { cod: true, transfer: false }
  // the logged-in customer's wallet (for "pay with wallet")
  useEffect(() => {
    if (!acc) return setWallet(null)
    api('/api/wallet').then((x) => setWallet(x.wallet)).catch(() => setWallet(null))
  }, [acc])
  useEffect(() => {
    if (method === 'transfer' && !payOpts.transfer) setMethod('cod')
    if (method === 'cod' && !payOpts.cod && payOpts.transfer) setMethod('transfer')
  }, [payOpts.cod, payOpts.transfer]) // eslint-disable-line react-hooks/exhaustive-deps
  const lines = cartLines(cart, menu)
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const soldOut = lines.some((l) => !l.item.available)

  // fee from the server every time the pin (or the subtotal, for free-delivery) changes
  useEffect(() => {
    if (!point || !shop) return
    const id = ++reqId.current
    setQuoting(true)
    const t = setTimeout(async () => {
      try {
        const r = await api('/api/quote', { method: 'POST', body: { ...point, subtotal } })
        if (id === reqId.current) setQ(r)
      } catch (e) {
        if (id === reqId.current) setQ({ ok: false, reason: e.message })
      }
      if (id === reqId.current) setQuoting(false)
    }, 350)
    return () => clearTimeout(t)
  }, [point, subtotal, shop])

  const phoneOk = /^(\+?6?0)\d{8,10}$/.test(phone.replace(/[\s-]/g, ''))
  const minOk = !shop?.minOrder || subtotal >= shop.minOrder
  const discount = promo ? Math.min(promo.discount, subtotal) : 0
  const total = subtotal - discount + (q?.ok ? q.fee : 0)
  const applyPromo = async (code = promoIn) => {
    setPromoErr('')
    if (!code.trim()) return setPromo(null)
    try {
      const r = await api('/api/promo/check', { method: 'POST', body: { code, subtotal, phone } })
      if (r.ok) setPromo(r)
      else (setPromo(null), setPromoErr(r.reason))
    } catch (e) {
      setPromoErr(e.message)
    }
  }
  // re-check the code when the basket changes (minimum order / % amount)
  useEffect(() => {
    if (promo) applyPromo(promo.code)
  }, [subtotal]) // eslint-disable-line react-hooks/exhaustive-deps
  // a welcome gift only counts on orders of at least shop.welcome.minOrder (pizza money)
  const walletUsable = wallet ? wallet.available - (shop?.welcome && subtotal - discount < (shop.welcome.minOrder || 0) ? wallet.unspentWelcome || 0 : 0) : 0
  const walletOk = wallet?.status === 'active' && q?.ok && walletUsable >= total
  const pinOk = !makeAccount || /^\d{4,6}$/.test(newPin)
  const methodOk = method !== 'wallet' || walletOk
  const ready = shop?.open && lines.length > 0 && !soldOut && point && q?.ok && !quoting && name.trim().length >= 2 && phoneOk && address.trim().length >= 5 && minOk && pinOk && methodOk
  const missing = !shop?.open
    ? 'Kedai sedang tutup'
    : !point
      ? 'Pin lokasi anda pada peta'
      : q && !q.ok
        ? q.reason
        : name.trim().length < 2
          ? 'Isi nama anda'
          : !phoneOk
            ? 'Isi nombor telefon yang betul'
            : address.trim().length < 5
              ? 'Isi alamat penuh'
              : !minOk
                ? `Minimum pesanan ${rm(shop.minOrder)}`
                : !pinOk
                  ? 'Pilih PIN 4-6 nombor untuk akaun'
                  : !methodOk
                    ? 'Baki dompet tidak cukup'
                    : ''

  const submit = async () => {
    setErr('')
    setSending(true)
    store.set('pz.customer', { name, phone, address, notes, point })
    try {
      if (!acc && makeAccount) await accountApi.register(name, phone, newPin)
      if (method === 'wallet' && !acc?.hasPin) throw new Error('Tetapkan PIN transaksi di halaman Dompet dulu, kemudian bayar dengan dompet.')
      const send = (txPin) => api('/api/orders', {
        method: 'POST',
        body: {
          txPin,
          items: lines.map((l) => ({ id: l.item.id, size: l.size?.id, qty: l.qty })),
          customer: { name, phone },
          location: { ...point, address, notes },
          note,
          paymentMethod: method,
          promoCode: promo?.code || undefined,
        },
      })
      const r = method === 'wallet' ? await withTxPin(`Bayar ${rm(total)} dari dompet`, send, 'Masukkan PIN transaksi anda') : await send()
      if (!r) return setSending(false)
      store.set('pz.orders', [{ id: r.id, token: r.token }, ...store.get('pz.orders', [])].slice(0, 10))
      cartApi.clear()
      accountApi.refresh()
      go(`/order/${r.id}?t=${r.token}`)
    } catch (e) {
      setErr(e.message)
      setSending(false)
    }
  }

  if (shop && lines.length === 0)
    return (
      <div className="min-h-dvh">
        <Header />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <img src="/logo.svg" alt="" className="mx-auto size-16" />
          <h1 className="mt-4 font-display text-3xl">Troli kosong</h1>
          <p className="mt-2 text-muted">Pilih pizza dulu, kemudian datang ke sini.</p>
          <a href="#/" className="btn btn-red mt-6 px-6 py-3">Lihat menu</a>
        </div>
      </div>
    )

  return (
    <div className="min-h-dvh pb-32 lg:pb-12">
      <Header />
      <div className="mx-auto max-w-6xl px-4 pt-5">
        <a href="#/" className="inline-flex items-center gap-1 text-[14px] font-bold text-muted hover:text-ink">
          <ChevronLeft className="size-4" /> Kembali ke menu
        </a>
        <h1 className="mt-2 font-display text-4xl tracking-wide">Checkout</h1>
        {shopErr && <p className="mt-4 rounded-2xl bg-tomato/10 p-4 text-tomato">{shopErr}</p>}
        {shop && !shop.open && <p className="mt-4 rounded-2xl bg-tomato/10 p-4 font-semibold text-tomato">Maaf, kedai sedang tutup. Sila cuba lagi nanti.</p>}

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <Section n="1" title="Di mana nak hantar?">
              {acc?.addresses?.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {acc.addresses.map((a) => {
                    const on = point && Math.abs(point.lat - a.lat) < 0.0003 && Math.abs(point.lng - a.lng) < 0.0003
                    return (
                      <button key={a.id} type="button" onClick={() => pickSaved(a)}
                        className={`flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-[13px] ${on ? 'border-tomato bg-tomato/5' : 'border-line bg-white hover:bg-cream'}`}>
                        <Home className={`size-4 shrink-0 ${on ? 'text-tomato' : 'text-muted'}`} />
                        <span className="truncate">{a.address}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {shop && (
                <MapPicker
                  key={mapKey}
                  value={point}
                  shop={shop.shop}
                  onChange={setPoint}
                  onAddress={(a) => !addrTouched && setAddress(a)}
                />
              )}
              <div className="mt-3 min-h-11">
                {!point ? (
                  <p className="flex items-center gap-2 text-[13.5px] text-muted"><MapPin className="size-4 text-tomato" /> Belum pin lokasi.</p>
                ) : quoting ? (
                  <p className="flex items-center gap-2 text-[13.5px] text-muted"><Loader2 className="size-4 animate-spin" /> Mengira jarak dan caj…</p>
                ) : q?.ok ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-basil/10 px-4 py-2.5 text-[14px] font-semibold text-basil">
                    <Bike className="size-[18px]" /> {q.km} km dari kedai · caj hantar {q.free ? <b>PERCUMA</b> : <b>{rm(q.fee)}</b>}
                    {q.method === 'estimate' && <span className="font-normal text-basil/80">(anggaran)</span>}
                  </div>
                ) : q ? (
                  <p className="flex items-start gap-2 rounded-2xl bg-tomato/10 px-4 py-2.5 text-[14px] font-semibold text-tomato"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {q.reason}</p>
                ) : null}
              </div>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[13px] font-bold">Alamat penuh</span>
                <textarea
                  className="field min-h-20 resize-y"
                  value={address}
                  onChange={(e) => (setAddress(e.target.value), setAddrTouched(true))}
                  placeholder="No. rumah, jalan, taman, poskod"
                  maxLength={300}
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[13px] font-bold">Panduan untuk rider <span className="font-normal text-muted">(pilihan)</span></span>
                <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cth: rumah pagar hitam, sebelah kedai runcit" maxLength={200} />
              </label>
            </Section>

            <Section n="2" title="Butiran anda">
              {acc ? (
                <p className="mb-3 flex items-center gap-2 rounded-2xl bg-basil/10 px-4 py-2.5 text-[13.5px] font-semibold text-basil">
                  <UserRound className="size-4" /> Log masuk sebagai {acc.name} · pesanan ini masuk ke "Pesanan saya"
                </p>
              ) : (
                <p className="mb-3 text-[13px] text-muted">
                  Sudah ada akaun? <a href="#/akaun" className="font-bold text-tomato underline">Log masuk</a> - troli anda kekal.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-bold">Nama</span>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama anda" autoComplete="name" maxLength={60} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-bold">No. telefon (WhatsApp)</span>
                  <input className="field disabled:bg-cream disabled:text-muted" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="012-345 6789" inputMode="tel" autoComplete="tel" maxLength={16} disabled={Boolean(acc)} />
                  {phone && !phoneOk && <span className="mt-1 block text-[12px] text-tomato">Contoh: 012-3456789</span>}
                </label>
              </div>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[13px] font-bold">Nota pesanan <span className="font-normal text-muted">(pilihan)</span></span>
                <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cth: tak nak capsicum, extra sos" maxLength={300} />
              </label>
              {!acc && (
                <div className="mt-4 rounded-2xl border border-line bg-cream/60 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" className="mt-0.5 size-5 accent-[#e23d2d]" checked={makeAccount} onChange={(e) => setMakeAccount(e.target.checked)} />
                    <span>
                      <span className="block text-[14px] font-bold">Cipta akaun (percuma)</span>
                      <span className="block text-[12.5px] text-muted">Jejak status pesanan bila-bila masa dan simpan alamat untuk order seterusnya.</span>
                    </span>
                  </label>
                  {makeAccount && (
                    <label className="mt-3 block">
                      <span className="mb-1.5 block text-[13px] font-bold">Pilih PIN (4-6 nombor)</span>
                      <input className="field w-44 tracking-[0.35em]" type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                        inputMode="numeric" maxLength={6} autoComplete="new-password" placeholder="••••" />
                      <span className="mt-1 block text-[12px] text-muted">Log masuk nanti dengan no. telefon + PIN ini.</span>
                    </label>
                  )}
                </div>
              )}
            </Section>

            <Section n="3" title="Cara bayaran">
              <div className="grid gap-3">
                {[
                  payOpts.cod && { id: 'cod', Icon: Banknote, t: 'Tunai semasa penghantaran (COD)', d: `Bayar kepada rider bila pizza sampai. Sediakan wang tunai${q?.ok ? ` ${rm(total)}` : ''}.` },
                  payOpts.transfer && { id: 'transfer', Icon: QrCode, t: 'Pindahan bank / DuitNow QR', d: 'Bayar sekarang dengan imbas QR atau pindahan bank, kemudian muat naik resit di halaman pesanan.' },
                  wallet?.status === 'active' && { id: 'wallet', Icon: WalletIcon, t: `Bayar dengan dompet (baki ${rm(wallet.available)})`, d: walletOk || !q?.ok ? 'Dibayar terus dari dompet anda. Tiada tunai, tiada resit.' : wallet.available >= total && wallet.unspentWelcome > 0 ? `Hadiah ${rm(wallet.unspentWelcome)} hanya untuk pesanan pizza ${rm(shop.welcome.minOrder)} ke atas.` : `Baki tidak cukup untuk ${rm(total)}. Tambah nilai di halaman Dompet.` },
                ].filter(Boolean).map((m) => {
                  const on = method === m.id
                  return (
                    <button key={m.id} type="button" onClick={() => setMethod(m.id)} aria-pressed={on}
                      className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition ${on ? 'border-tomato bg-tomato/5' : 'border-line bg-white hover:bg-cream'}`}>
                      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${on ? 'bg-tomato text-white' : 'bg-cream text-muted'}`}><m.Icon className="size-6" /></span>
                      <span className="flex-1">
                        <span className="block font-bold">{m.t}</span>
                        <span className="block text-[13px] text-muted">{m.d}</span>
                      </span>
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full ${on ? 'bg-tomato' : 'border-2 border-line'}`}>{on && <span className="size-2.5 rounded-full bg-white" />}</span>
                    </button>
                  )
                })}
              </div>
            </Section>
          </div>

          {/* summary */}
          <aside className="card p-5 lg:sticky lg:top-20">
            <h2 className="font-display text-2xl tracking-wide">Ringkasan</h2>
            <ul className="mt-3 divide-y divide-line">
              {lines.map(({ key, item, qty, price, label }) => (
                <li key={key} className="flex items-center gap-3 py-2.5">
                  <img src={item.img} alt="" className="size-12 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold">{label}</div>
                    <div className="text-[12.5px] text-muted">{rm(price * qty)}</div>
                    {!item.available && <div className="text-[12px] font-bold text-tomato">Habis - sila buang</div>}
                  </div>
                  <Stepper size="sm" qty={qty} onChange={(n) => cartApi.set(key, n)} />
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3 text-[14px]">
              <div className="flex justify-between"><dt className="text-muted">Pizza</dt><dd className="font-semibold">{rm(subtotal)}</dd></div>
              {discount > 0 && (
                <div className="flex justify-between text-basil"><dt className="flex items-center gap-1"><Tag className="size-3.5" /> Promo {promo.code}</dt><dd className="font-semibold">-{rm(discount)}</dd></div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Penghantaran{q?.ok ? ` (${q.km} km)` : ''}</dt>
                <dd className="font-semibold">{q?.ok ? (q.free ? 'PERCUMA' : rm(q.fee)) : '-'}</dd>
              </div>
              {shop?.welcome && (!acc || (acc.orders || []).filter((o) => o.status === 'done').length === 0) && (
                <div className="rounded-xl bg-tomato/10 px-3 py-2 text-[12.5px] text-tomato-deep">
                  🎁 <b>Pelanggan baru:</b> dapat <b>{rm(shop.welcome.amount)}</b> dalam dompet selepas pesanan pertama sampai (guna untuk order {rm(shop.welcome.minOrder)} ke atas).
                  {!acc && <> <a href="#/akaun" className="font-bold underline">Log masuk / daftar</a> untuk dapat.</>}
                </div>
              )}
              {shop?.cashback && cashbackFromCart(shop.cashback, lines, discount) > 0 && (
                <div className="rounded-xl bg-basil/10 px-3 py-2 text-[12.5px] text-basil">
                  <b>Cashback {shop.cashback.percent}%: +{rm(cashbackFromCart(shop.cashback, lines, discount))}</b> masuk dompet selepas pizza sampai.
                  {lines.some((l) => (shop.cashback.exclude || []).includes(l.item.id)) && <> (tidak termasuk {[...new Set(lines.filter((l) => shop.cashback.exclude.includes(l.item.id)).map((l) => l.item.name))].join(', ')})</>}
                  {!acc ? <> <a href="#/akaun" className="font-bold underline">Log masuk</a> untuk dapat.</> : wallet?.status !== 'active' ? <> Aktifkan <a href="#/dompet" className="font-bold underline">dompet</a> untuk terima.</> : null}
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-[17px]">
                <dt className="font-bold">Jumlah bayar ({method === 'transfer' ? 'pindahan' : method === 'wallet' ? 'dompet' : 'COD'})</dt>
                <dd className="font-extrabold text-tomato">{q?.ok ? rm(total) : '-'}</dd>
              </div>
            </dl>
            <div className="mt-3">
              {promo ? (
                <div className="flex items-center gap-2 rounded-xl bg-basil/10 px-3 py-2 text-[13px] font-semibold text-basil">
                  <Tag className="size-4" /> {promo.code} · {promo.label} <button className="ml-auto" onClick={() => (setPromo(null), setPromoIn(''))} aria-label="Buang kod"><X className="size-4" /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input className="field py-2 uppercase" value={promoIn} onChange={(e) => setPromoIn(e.target.value.toUpperCase())} placeholder="Kod promo" maxLength={16} aria-label="Kod promo" />
                  <button className="btn btn-ghost shrink-0 px-4 text-[13px]" onClick={() => applyPromo()} disabled={!promoIn.trim()}>Guna</button>
                </div>
              )}
              {promoErr && <p className="mt-1 text-[12.5px] text-tomato">{promoErr}</p>}
            </div>
            {err && <p className="mt-3 rounded-xl bg-tomato/10 px-3 py-2 text-[13px] font-semibold text-tomato">{err}</p>}
            <button className="btn btn-red mt-4 hidden w-full py-3.5 text-[15px] lg:flex" disabled={!ready || sending} onClick={submit}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />} Sahkan pesanan {q?.ok ? `· ${rm(total)}` : ''}
            </button>
            {missing && <p className="mt-2 hidden text-center text-[12.5px] text-muted lg:block">{missing}</p>}
          </aside>
        </div>
      </div>

      {/* phone: fixed confirm bar */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 pt-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex items-baseline justify-between text-[14px]">
          <span className="text-muted">{missing || `Jumlah bayar (${method === 'transfer' ? 'pindahan' : method === 'wallet' ? 'dompet' : 'COD'})`}</span>
          <span className="text-[18px] font-extrabold text-tomato">{q?.ok ? rm(total) : rm(subtotal)}</span>
        </div>
        <button className="btn btn-red w-full py-3.5 text-[15px]" disabled={!ready || sending} onClick={submit}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />} Sahkan pesanan
        </button>
      </div>
    </div>
  )
}
