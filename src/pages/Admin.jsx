import { useCallback, useEffect, useRef, useState } from 'react'
import { Ban, Bot, Headset, PiggyBank, Send, Banknote, Bell, Bike, Camera, ChefHat, CircleCheck, Gift, KeyRound, Landmark, Mail, Pencil, Plus, RotateCcw, Search, Tag, Unlink, Users, Wallet, CircleX, Copy, ExternalLink, FileUp, Map as MapIcon, QrCode, ReceiptText, Share2, Trash2, ClipboardList, Loader2, Lock, LogOut, MapPin, MessageCircle, Navigation, Phone, Save, Settings, UtensilsCrossed } from 'lucide-react'
import Logo from '../components/Logo.jsx'
import MapPicker from '../components/MapPicker.jsx'
import OrderMap from '../components/OrderMap.jsx'
import { STEPS, nextStep, stepIndex, stepOf } from '../status.js'
import { PAY_STATUS, shrink } from '../components/PaymentPanel.jsx'
import { TX } from './Wallet.jsx'
import { autoRefresh, adminHeaders, api, ownerSession, rm, useAutoSubmit, useShop, waLink } from '../lib.js'
import GoogleButton from '../components/GoogleButton.jsx'
import { AI_MODELS, DEFAULT_AI_MODEL } from '../../workers-ai.js'
import { DEFAULT_OPS_MODEL, OPS_MODELS } from '../../ops-assistant.js'
import { withTxPin } from '../components/PinPrompt.jsx'
import WhatsAppLogin from '../components/WhatsAppLogin.jsx'
import { TelegramChip, TelegramSettings, useTelegramStatus } from '../components/TelegramConnect.jsx'

const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min ago` : new Date(iso).toLocaleString()
}
const pinKey = 'pz.adminPin'
const getPin = () => {
  let pin = ''
  try {
    pin = sessionStorage.getItem(pinKey) || ''
  } catch {
    /* no session storage */
  }
  const g = ownerSession.get()
  return pin || (g ? 'g:' + g : '')
}

function chime() {
  try {
    const ctx = new AudioContext()
    ;[880, 1175, 1568].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.16 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.3)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.16)
      o.stop(ctx.currentTime + i * 0.16 + 0.32)
    })
  } catch {
    /* sound is optional */
  }
}

function Login({ onOk }) {
  const { shop } = useShop()
  const [gErr, setGErr] = useState('')
  const onGoogle = async (credential) => {
    setGErr('')
    try {
      const r = await api('/api/admin/google', { method: 'POST', body: { credential } })
      ownerSession.set(r.session)
      onOk('g:' + r.session)
    } catch (e) {
      setGErr(e.message)
    }
  }
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await api('/api/admin/settings', { pin })
      try {
        sessionStorage.setItem(pinKey, pin)
      } catch {
        /* stays logged in only until refresh */
      }
      onOk(pin)
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }
  useAutoSubmit(pin, !shop?.cloudHosted && pin.length >= 4, submit)
  return (
    <div className="dots grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7 text-center">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-5 font-display text-2xl tracking-wide">Seller login</h1>
        {shop?.googleClientId && (
          <div className="mt-4">
            <GoogleButton clientId={shop.googleClientId} onCredential={onGoogle} text="signin_with" />
            {gErr && <p className="mt-2 text-[13px] font-semibold text-tomato">{gErr}</p>}
            {!shop?.cloudHosted && <div className="my-4 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" /> or PIN (this PC / Tailscale only) <span className="h-px flex-1 bg-line" /></div>}
          </div>
        )}
        {shop?.cloudHosted ? <p className="mt-4 text-[13px] text-muted">Sign in with the shop owner’s Google account. Your transaction PIN is required when moving money.</p> : <>
        <p className="mt-1 text-[13px] text-muted">The PIN is in <code>data\ADMIN-PIN.txt</code> in the Pizzadonia folder.</p>
        <input
          className="field mt-5 text-center text-2xl tracking-[0.4em]"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          autoFocus
          maxLength={8}
          placeholder="••••••"
          aria-label="Admin PIN"
        />
        {err && <p className="mt-2 text-[13px] font-semibold text-tomato">{err}</p>}
        <button className="btn btn-red mt-4 w-full py-3" disabled={pin.length < 4 || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Open orders
        </button>
        </>}
      </form>
    </div>
  )
}

/** Any private admin file (photo / receipt / PDF) fetched with the PIN header and shown as a thumbnail. */
function AdminFile({ src, type, pin, caption, size = 'size-24', fit = 'object-cover' }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let u = ''
    fetch(src, { headers: adminHeaders(pin) })
      .then((x) => (x.ok ? x.blob() : null))
      .then((b) => b && setUrl((u = URL.createObjectURL(b))))
      .catch(() => {})
    return () => u && URL.revokeObjectURL(u)
  }, [src, pin])
  if (!url) return <div className={`grid ${size} place-items-center rounded-xl bg-cream text-[11px] text-muted`}>Loading…</div>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group block text-center" title="Open full size">
      {type === 'pdf' ? (
        <span className={`grid ${size} place-items-center rounded-xl bg-white ring-1 ring-line`}><ReceiptText className="size-8 text-tomato" /></span>
      ) : (
        <img src={url} alt={caption || 'Photo'} className={`${size} rounded-xl ${fit} ring-1 ring-line group-hover:ring-tomato`} />
      )}
      {caption && <span className="mt-0.5 block text-[10.5px] text-muted">{caption} <ExternalLink className="inline size-3" /></span>}
    </a>
  )
}

/** Receipt image/PDF from the private admin API (needs the PIN header, so it is fetched as a blob). */
function Receipt({ r, pin }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let u = ''
    fetch(`/api/admin/receipts/${r.file}`, { headers: adminHeaders(pin) })
      .then((x) => (x.ok ? x.blob() : null))
      .then((b) => b && setUrl((u = URL.createObjectURL(b))))
      .catch(() => {})
    return () => u && URL.revokeObjectURL(u)
  }, [r.file, pin])
  const when = new Date(r.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
  if (!url) return <div className="grid size-24 place-items-center rounded-xl bg-cream text-[11px] text-muted">Loading…</div>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group block w-24 text-center" title={`Open receipt (${when})`}>
      {r.type === 'pdf' ? (
        <span className="grid size-24 place-items-center rounded-xl bg-white ring-1 ring-line"><ReceiptText className="size-8 text-tomato" /></span>
      ) : (
        <img src={url} alt="Payment receipt" className="size-24 rounded-xl object-cover ring-1 ring-line group-hover:ring-tomato" />
      )}
      <span className="mt-0.5 block text-[10.5px] text-muted">{when} <ExternalLink className="inline size-3" /></span>
    </a>
  )
}

function PaymentBlock({ o, pin, onChanged }) {
  const [busy, setBusy] = useState('')
  const method = o.paymentMethod || 'cod'
  const st = o.payment?.status || 'unpaid'
  const meta = PAY_STATUS[st]
  const act = async (action) => {
    let reason
    if (action === 'reject') {
      reason = prompt('Why is the receipt rejected? (the customer sees this)', 'Jumlah tidak sama / resit tidak jelas')
      if (reason === null) return
    }
    setBusy(action)
    try {
      const label = action === 'paid' ? `Payment received ${rm(o.total)}` : action === 'reject' ? 'Reject receipt' : 'Undo paid'
      const r = await withTxPin(label, (tx) => api(`/api/admin/orders/${o.id}/payment`, { method: 'POST', body: { action, reason }, pin, txPin: tx }), `${o.id} · ${o.customer.name}`)
      if (r) onChanged(r)
    } catch (e) {
      alert(e.message)
    }
    setBusy('')
  }
  return (
    <div className={`mt-3 rounded-2xl border px-3 py-2.5 text-[13px] ${st === 'pending' ? 'border-cheese bg-cheese/15' : 'border-line bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        {method === 'cod' ? <Banknote className="size-4 text-crust" /> : <QrCode className="size-4 text-tomato" />}
        <span className="font-bold">{method === 'cod' ? 'Cash on delivery' : 'Bank transfer / QR'}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-bold ${meta.cls}`}>{method === 'cod' && st === 'unpaid' ? 'Collect at door' : meta.en}</span>
      </div>
      {method === 'transfer' && (
        <>
          {(o.payment?.receipts || []).length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {o.payment.receipts.map((r) => <Receipt key={r.file} r={r} pin={pin} />)}
            </div>
          ) : (
            <p className="mt-1.5 text-muted">No receipt yet - the customer uploads it on their order page.</p>
          )}
          {st === 'rejected' && o.payment.reason && <p className="mt-1.5 text-tomato">Rejected: {o.payment.reason}</p>}
          {st === 'pending' && <p className="mt-1.5 font-semibold">Check your bank / DuitNow app: {rm(o.total)} with reference {o.id}, then confirm.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {st !== 'paid' && (
              <button className="btn bg-basil px-3.5 py-1.5 text-[12.5px] text-white" onClick={() => act('paid')} disabled={Boolean(busy)}>
                {busy === 'paid' ? <Loader2 className="size-3.5 animate-spin" /> : <CircleCheck className="size-3.5" />} Payment received
              </button>
            )}
            {st === 'pending' && (
              <button className="btn btn-ghost px-3.5 py-1.5 text-[12.5px] text-tomato" onClick={() => act('reject')} disabled={Boolean(busy)}>
                <CircleX className="size-3.5" /> Reject receipt
              </button>
            )}
            {st === 'paid' && (
              <button className="btn btn-ghost px-3 py-1 text-[12px] text-muted" onClick={() => confirm('Mark this order as NOT paid again?') && act('unpaid')} disabled={Boolean(busy)}>
                Undo paid
              </button>
            )}
          </div>
        </>
      )}
      {method === 'cod' && st === 'paid' && (
        <p className="mt-1 text-muted">
          {o.cash === 'received' ? '✓ Rider banked in the cash - received' : o.cash === 'pending' ? 'Rider sent a bank-in - check it in Money' : 'Cash collected - still with the rider (not banked in yet)'}
        </p>
      )}
    </div>
  )
}

// ready-made WhatsApp messages for the supplier and the rider about one order
function kitchenMsg(o, base) {
  const lines = [`🍕 Pizzadonia - pesanan ${o.id}`, ...o.items.map((i) => `${i.qty}× ${i.name}`)]
  if (o.note) lines.push(`Nota: ${o.note}`)
  lines.push(stepIndex(o.status) >= stepIndex('supplier_paid') ? `Bayaran RM${(o.supplierCost ?? 0).toFixed(2)} sudah dibuat ✅` : `Bayaran RM${(o.supplierCost ?? 0).toFixed(2)} akan dibuat sebentar lagi`)
  lines.push(`Halaman dapur: ${base}/#/dapur`)
  return lines.join('\n')
}
function riderMsg(o, base) {
  const cod = (o.paymentMethod || 'cod') === 'cod' && o.payment?.status !== 'paid'
  return [
    `🛵 Pizzadonia - hantar ${o.id}`,
    `Pelanggan: ${o.customer.name} (+${o.customer.phone})`,
    `Alamat: ${o.location.address}`,
    o.location.notes ? `Panduan: ${o.location.notes}` : '',
    `Peta: https://www.google.com/maps/search/?api=1&query=${o.location.lat},${o.location.lng}`,
    `Pizza: ${o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}`,
    cod ? `💵 KUTIP TUNAI: RM${o.total.toFixed(2)}` : '✅ Sudah dibayar - JANGAN kutip wang',
    `Halaman rider: ${base}/#/rider`,
  ].filter(Boolean).join('\n')
}

function PayKitchen({ o, pin, staff, base, onClose, onPaid }) {
  const [copied, setCopied] = useState('')
  const amount = (o.supplierCost ?? 0).toFixed(2)
  const copy = async (k, v) => {
    try {
      await navigator.clipboard.writeText(v)
      setCopied(k)
    } catch {
      /* long-press instead */
    }
  }
  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label="Pay kitchen">
      <div className="max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-paper p-5 sm:rounded-[28px]">
        <div className="flex items-center gap-2">
          <ChefHat className="size-5 text-tomato" />
          <h2 className="flex-1 font-display text-xl tracking-wide">Pay {staff.kitchenName || 'kitchen'} for {o.id}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-cream" aria-label="Close"><CircleX className="size-5" /></button>
        </div>
        <div className="mt-3 rounded-2xl bg-cheese/30 p-3 text-center">
          <div className="text-[12px] font-bold text-muted">AMOUNT TO PAY</div>
          <div className="font-display text-4xl tracking-wide">RM{amount}</div>
          <div className="text-[12px] text-muted">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>
        </div>
        {staff.kitchenQr ? (
          <div className="mt-3 flex justify-center"><AdminFile src="/api/admin/kitchen-qr" type="jpg" pin={pin} size="w-64 bg-white" fit="h-auto object-contain" /></div>
        ) : (
          <p className="mt-3 rounded-xl bg-tomato/10 px-3 py-2 text-[13px] text-tomato">No kitchen QR yet - add it in Shop & fees → Staff pages.</p>
        )}
        <div className="mt-3 space-y-2 text-[13.5px]">
          {staff.kitchenAccountName && <div><span className="text-muted">To:</span> <b>{staff.kitchenAccountName}</b>{staff.kitchenBank ? ` · ${staff.kitchenBank}` : ''}</div>}
          {staff.kitchenAccountNumber && (
            <div className="flex items-center gap-2"><span className="text-muted">Account:</span> <b className="select-all tabular-nums">{staff.kitchenAccountNumber}</b>
              <button className="btn btn-ghost px-2.5 py-1 text-[11.5px]" onClick={() => copy('acc', staff.kitchenAccountNumber.replace(/\D/g, ''))}><Copy className="size-3" /> {copied === 'acc' ? 'Copied' : 'Copy'}</button></div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => copy('amt', amount)}><Copy className="size-3.5" /> {copied === 'amt' ? 'Copied' : `Copy RM${amount}`}</button>
            <button className="btn btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => copy('ref', o.id)}><Copy className="size-3.5" /> {copied === 'ref' ? 'Copied' : `Copy reference ${o.id}`}</button>
          </div>
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12.5px] text-muted">
          <li>Scan the QR in your bank app (or screenshot it), pay exactly RM{amount}, reference {o.id}.</li>
          <li>Then tap the button below - the order goes to the kitchen page and the customer sees "Dibayar kepada dapur".</li>
        </ol>
        <button className="btn btn-red mt-4 w-full py-3.5 text-[15px]" onClick={onPaid}><CircleCheck className="size-4" /> I've paid - mark Supplier paid</button>
        {staff.kitchenPhone && (
          <a className="btn mt-2 w-full bg-[#25d366] py-3 text-[14px] text-white" target="_blank" rel="noreferrer" href={waLink(staff.kitchenPhone, kitchenMsg({ ...o, status: 'supplier_paid' }, base || location.origin))}>
            <MessageCircle className="size-4" /> WhatsApp {staff.kitchenName || 'kitchen'} the order
          </a>
        )}
      </div>
    </div>
  )
}

function OrderCard({ o, pin, onChanged, staffInfo = { staff: {}, base: '' } }) {
  const [payKitchen, setPayKitchen] = useState(false)
  const [busy, setBusy] = useState('')
  const [showMap, setShowMap] = useState(false)
  const set = async (status) => {
    let reason
    if (status === 'supplier_paid' && o.paymentMethod === 'transfer' && o.payment?.status !== 'paid' &&
      !confirm(`${o.id}: the customer's transfer is NOT confirmed yet. Pay the supplier anyway?`)) return
    if (status === 'cancelled') {
      reason = prompt(`Cancel order ${o.id}? Reason shown to the customer (optional):`, '')
      if (reason === null) return
    }
    setBusy(status)
    try {
      onChanged(await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { status, reason }, pin }))
    } catch (e) {
      alert(e.message)
    }
    setBusy('')
  }
  const { lat, lng } = o.location
  const st = stepOf(o.status)
  const nx = nextStep(o.status)
  const active = !['done', 'cancelled'].includes(o.status)
  const cost = o.supplierCost ?? 0
  const supplierPaid = stepIndex(o.status) >= stepIndex('supplier_paid')
  return (
    <article className={`card overflow-hidden ${o.status === 'new' ? 'ring-2 ring-tomato' : ''}`}>
      {payKitchen && (
        <PayKitchen o={o} pin={pin} staff={staffInfo.staff} base={staffInfo.base} onClose={() => setPayKitchen(false)}
          onPaid={async () => { setPayKitchen(false); await set('supplier_paid') }} />
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-cream/60 px-4 py-3">
        <span className="font-display text-xl tracking-wide">{o.id}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${st.cls}`}><st.Icon className="size-3.5" /> {st.en}</span>
        {o.accountPhone && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-muted ring-1 ring-line">member</span>}
        {['kitchen', 'rider'].includes(o.history.at(-1)?.by) && (
          <span className="text-[11.5px] text-muted">updated by {o.history.at(-1).by === 'kitchen' ? 'kitchen' : 'rider'}</span>
        )}
        <span className="ml-auto text-[12.5px] text-muted">{ago(o.createdAt)}</span>
      </div>

      {/* customer + pinned location: who to hand the pizza to and collect cash from */}
      <div className="grid gap-4 p-4 md:grid-cols-[1.1fr_1fr]">
        <div className="text-[14px]">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-tomato font-display text-lg text-white">{o.customer.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <div className="text-[16px] font-extrabold leading-tight">{o.customer.name}</div>
              <div className="text-[12.5px] text-muted">+{o.customer.phone}</div>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-2 leading-snug"><MapPin className="mt-0.5 size-4 shrink-0 text-tomato" /> {o.location.address}</p>
          {o.location.notes && <p className="mt-1 pl-6 text-[13px] text-muted">Rider tip: {o.location.notes}</p>}
          <p className="mt-1 pl-6 text-[12.5px] text-muted">Pin: {lat.toFixed(5)}, {lng.toFixed(5)} · {o.delivery.km} km{o.delivery.method === 'estimate' ? ' (est.)' : ''}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn btn-ghost px-3 py-1.5 text-[12.5px]" href={`tel:+${o.customer.phone}`}><Phone className="size-3.5" /> Call</a>
            <a className="btn btn-ghost px-3 py-1.5 text-[12.5px]" target="_blank" rel="noreferrer"
              href={waLink(o.customer.phone, `Salam ${o.customer.name}, pesanan Pizzadonia ${o.id} (${rm(o.total)} COD) `)}>
              <MessageCircle className="size-3.5 text-[#25d366]" /> WhatsApp
            </a>
            <a className="btn btn-ghost px-3 py-1.5 text-[12.5px]" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}>
              <MapPin className="size-3.5 text-tomato" /> Google Maps
            </a>
            <a className="btn btn-ghost px-3 py-1.5 text-[12.5px]" target="_blank" rel="noreferrer" href={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`}>
              <Navigation className="size-3.5 text-[#33ccff]" /> Waze
            </a>
            {o.status !== 'cancelled' && (
              <>
                <a className={`btn px-3 py-1.5 text-[12.5px] ${staffInfo.staff.kitchenPhone ? 'bg-[#25d366] text-white' : 'btn-ghost opacity-60'}`} target="_blank" rel="noreferrer"
                  title={staffInfo.staff.kitchenPhone ? `WhatsApp ${staffInfo.staff.kitchenName || 'kitchen'}` : 'Add the kitchen WhatsApp in Shop & fees -> Staff pages'}
                  href={staffInfo.staff.kitchenPhone ? waLink(staffInfo.staff.kitchenPhone, kitchenMsg(o, staffInfo.base)) : '#/admin'}
                  onClick={(e) => !staffInfo.staff.kitchenPhone && (e.preventDefault(), alert('Add your supplier\'s WhatsApp number first: Shop & fees -> Staff pages.'))}>
                  <ChefHat className="size-3.5" /> WhatsApp {staffInfo.staff.kitchenName || 'kitchen'}
                </a>
                <a className={`btn px-3 py-1.5 text-[12.5px] ${staffInfo.staff.riderPhone ? 'bg-[#25d366] text-white' : 'btn-ghost opacity-60'}`} target="_blank" rel="noreferrer"
                  title={staffInfo.staff.riderPhone ? `WhatsApp ${staffInfo.staff.riderName || 'rider'}` : 'Add the rider WhatsApp in Shop & fees -> Staff pages'}
                  href={staffInfo.staff.riderPhone ? waLink(staffInfo.staff.riderPhone, riderMsg(o, staffInfo.base)) : '#/admin'}
                  onClick={(e) => !staffInfo.staff.riderPhone && (e.preventDefault(), alert('Add your rider\'s WhatsApp number first: Shop & fees -> Staff pages.'))}>
                  <Bike className="size-3.5" /> WhatsApp {staffInfo.staff.riderName || 'rider'}
                </a>
              </>
            )}
            <button className="btn btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => setShowMap((v) => !v)}>
              <MapIcon className="size-3.5" /> {showMap ? 'Hide map' : 'Show pin'}
            </button>
          </div>
          {showMap && (
            <div className="mt-3">
              <OrderMap points={[{ lat, lng, label: o.customer.name, sub: o.id }]} height={220} />
            </div>
          )}
        </div>

        <div>
          <ul className="space-y-1 text-[14px]">
            {o.items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3">
                <span><b>{it.qty}×</b> {it.name}</span>
                <span className="text-muted">{rm(it.line)}</span>
              </li>
            ))}
            {o.discount > 0 && (
              <li className="flex justify-between gap-3 text-basil"><span className="flex items-center gap-1"><Tag className="size-3.5" /> Promo {o.promo?.code}</span><span>-{rm(o.discount)}</span></li>
            )}
            <li className="flex justify-between gap-3 text-muted">
              <span>Delivery</span>
              <span>{o.delivery.free ? 'FREE' : rm(o.delivery.fee)}</span>
            </li>
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-line pt-2">
            <span className="text-[13px] font-bold">{(o.paymentMethod || 'cod') === 'cod' ? 'Collect cash (COD)' : 'Customer pays by transfer'}</span>
            <span className="text-xl font-extrabold text-tomato">{rm(o.total)}</span>
          </div>
          <div className="mt-3 space-y-1.5 rounded-2xl bg-cream px-3 py-2.5 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="font-bold">Pay supplier</span>
              <span className={`flex items-center gap-1.5 font-bold ${supplierPaid ? 'text-basil' : 'text-tomato'}`}>
                {rm(cost)} · {supplierPaid ? 'PAID' : 'NOT PAID'}
              </span>
            </div>
            {o.cashback?.amount > 0 && (
              <div className="flex justify-between text-muted"><span>Cashback to customer ({o.cashback.status === 'credited' ? 'paid' : o.cashback.status === 'waiting_wallet' ? 'waits for wallet' : 'on delivery'})</span><span>-{rm(o.cashback.amount)}</span></div>
            )}
            {!supplierPaid && o.status !== 'cancelled' && (
              <button className="btn btn-red mt-1 w-full py-2 text-[13px]" onClick={() => setPayKitchen(true)}><QrCode className="size-4" /> Pay {staffInfo.staff.kitchenName || 'kitchen'} {rm(cost)}</button>
            )}
            <div className="flex justify-between text-muted"><span>Your profit (pizza only)</span><b className="text-ink">{rm(o.subtotal - (o.discount || 0) - (o.cashback?.amount || 0) - cost)}</b></div>
          </div>
          <PaymentBlock o={o} pin={pin} onChanged={onChanged} />
          {o.proof && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-white p-2.5 text-[12.5px]">
              <AdminFile src={`/api/admin/proofs/${o.proof.file}`} type={o.proof.type} pin={pin} size="size-20" />
              <div><div className="flex items-center gap-1.5 font-bold"><Camera className="size-3.5 text-basil" /> Delivery photo</div>
                <div className="text-muted">{new Date(o.proof.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} by rider</div></div>
            </div>
          )}
          {o.note && <p className="mt-2 rounded-xl bg-cheese/25 px-3 py-2 text-[13px]"><b>Note:</b> {o.note}</p>}
          {o.status === 'cancelled' && o.cancelReason && <p className="mt-2 text-[12.5px] text-muted">Cancelled: {o.cancelReason}</p>}
          {o.refunded && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-basil"><RotateCcw className="size-3.5" /> Refunded {rm(o.refunded.amount)} to the customer's wallet</p>}
          {o.status === 'cancelled' && !o.refunded && o.payment?.status === 'paid' && o.accountPhone && (
            <button className="btn btn-ghost mt-2 px-3 py-1.5 text-[12.5px]" onClick={async () => {
              if (!confirm(`Refund ${rm(o.total)} to ${o.customer.name}'s wallet?`)) return
              try {
                const r = await withTxPin(`Refund ${rm(o.total)} to wallet`, (tx) => api(`/api/admin/orders/${o.id}/refund-wallet`, { method: 'POST', body: {}, pin, txPin: tx }), `${o.id} · ${o.customer.name}`)
                if (r) onChanged(r)
              } catch (e) { alert(e.message) }
            }}><RotateCcw className="size-3.5" /> Refund to wallet</button>
          )}
        </div>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          {nx && (
            <button className="btn btn-red px-5 py-2 text-[13.5px]" onClick={() => set(nx.id)} disabled={Boolean(busy)}>
              {busy === nx.id ? <Loader2 className="size-4 animate-spin" /> : <nx.Icon className="size-4" />} {st.enNext}
            </button>
          )}
          <select className="field w-auto py-1.5 text-[13px]" value={o.status} onChange={(e) => set(e.target.value)} disabled={Boolean(busy)} aria-label="Set status">
            {STEPS.map((s) => <option key={s.id} value={s.id}>{s.en}</option>)}
          </select>
          <button className="btn btn-ghost ml-auto px-4 py-2 text-[13px] text-tomato" onClick={() => set('cancelled')} disabled={Boolean(busy)}>
            Cancel order
          </button>
        </div>
      )}
    </article>
  )
}

function Orders({ pin, onAuthFail }) {
  const shop = useShop().shop?.shop
  const [orders, setOrders] = useState(null)
  const [staffInfo, setStaffInfo] = useState({ staff: {}, base: '' })
  const [locs, setLocs] = useState({})
  const [showBase, setShowBase] = useState(true)
  const [tab, setTab] = useState('active')
  const [err, setErr] = useState('')
  const known = useRef(null)
  const load = useCallback(async () => {
    try {
      const r = await api('/api/admin/orders', { pin })
      // chime on a new order or a newly uploaded receipt
      const ids = new Set(r.orders.flatMap((o) => [o.id, ...(o.payment?.receipts || []).map((x) => x.file), ...(o.cod?.bankin ? ['bi:' + o.cod.bankin] : [])]))
      if (known.current && [...ids].some((k) => !known.current.has(k))) chime()
      known.current = ids
      setOrders(r.orders)
      setStaffInfo({ staff: r.staff || {}, base: r.base || location.origin })
      setLocs(r.locations || {})
      setErr('')
      const fresh = r.orders.filter((o) => o.status === 'new' || o.payment?.status === 'pending').length
      document.title = fresh ? `(${fresh}) Needs you - Pizzadonia` : 'Pizzadonia admin'
    } catch (e) {
      if (e.status === 401) onAuthFail()
      setErr(e.message)
    }
  }, [pin, onAuthFail])
  useEffect(() => {
    return autoRefresh(load, 5000)
  }, [load])
  if (!orders) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const today = new Date().toDateString()
  const todays = orders.filter((o) => new Date(o.createdAt).toDateString() === today && o.status !== 'cancelled')
  const activeOrders = orders.filter((o) => !['done', 'cancelled'].includes(o.status))
  const shown = tab === 'active' ? activeOrders : tab === 'done' ? orders.filter((o) => ['done', 'cancelled'].includes(o.status)) : orders
  const unpaid = activeOrders.filter((o) => stepIndex(o.status) < stepIndex('supplier_paid'))
  const onChanged = (n) => setOrders((list) => list.map((x) => (x.id === n.id ? n : x)))
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Orders today', todays.length],
          ['Sales today', rm(todays.reduce((s, o) => s + o.subtotal, 0))],
          ['Profit today', rm(todays.reduce((s, o) => s + o.subtotal - (o.discount || 0) - (o.supplierCost ?? 0), 0))],
          ['Supplier to pay', `${rm(unpaid.reduce((s, o) => s + (o.supplierCost ?? 0), 0))} · ${unpaid.length}`],
          ['Receipts to check', orders.filter((o) => o.payment?.status === 'pending' && o.status !== 'cancelled').length],
        ].map(([k, v]) => (
          <div key={k} className="card px-4 py-3">
            <div className="text-[12px] font-semibold text-muted">{k}</div>
            <div className="mt-0.5 text-lg font-extrabold">{v}</div>
          </div>
        ))}
      </div>
      {(locs.kitchen || locs.rider) && (
        <section className="card mt-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="size-5 text-tomato" />
            <h2 className="flex-1 font-display text-lg tracking-wide">Kitchen & rider base</h2>
            {locs.kitchen && (
              <>
                <a className="btn btn-ghost px-3 py-1 text-[12px]" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${locs.kitchen.lat},${locs.kitchen.lng}`}><MapPin className="size-3.5 text-tomato" /> Google Maps</a>
                <a className="btn btn-ghost px-3 py-1 text-[12px]" target="_blank" rel="noreferrer" href={`https://waze.com/ul?ll=${locs.kitchen.lat},${locs.kitchen.lng}&navigate=yes`}><Navigation className="size-3.5 text-[#33ccff]" /> Waze</a>
              </>
            )}
            <button className="btn btn-ghost px-3 py-1 text-[12px]" onClick={() => setShowBase((v) => !v)}>{showBase ? 'Hide map' : 'Show map'}</button>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            🍕 Kitchen ({staffInfo.staff.kitchenName || 'dapur'}): {locs.kitchen?.label || '-'}
            {locs.rider && (Math.abs(locs.rider.lat - (locs.kitchen?.lat ?? 0)) < 1e-4 && Math.abs(locs.rider.lng - (locs.kitchen?.lng ?? 0)) < 1e-4
              ? ' · 🛵 Rider starts from the kitchen'
              : ` · 🛵 Rider base: ${locs.rider.label}`)}
          </p>
          {showBase && (
            <div className="mt-3">
              <OrderMap shop={locs.kitchen} height={220}
                points={locs.rider && !(Math.abs(locs.rider.lat - (locs.kitchen?.lat ?? 0)) < 1e-4 && Math.abs(locs.rider.lng - (locs.kitchen?.lng ?? 0)) < 1e-4)
                  ? [{ lat: locs.rider.lat, lng: locs.rider.lng, label: `Rider ${staffInfo.staff.riderName || ''}`.trim(), sub: 'base', color: '#3b6fd8' }]
                  : locs.kitchen ? [{ lat: locs.kitchen.lat, lng: locs.kitchen.lng, label: `Dapur ${staffInfo.staff.kitchenName || ''} & rider`.trim(), sub: locs.kitchen.label, color: '#c9732a' }] : []} />
            </div>
          )}
        </section>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[['active', `Active (${activeOrders.length})`], ['map', 'Delivery map'], ['done', 'Finished'], ['all', 'All']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${tab === id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>
            {l}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted"><Bell className="size-3.5" /> Checks every 8 s, sound on a new order</span>
      </div>
      {err && <p className="mt-3 text-[13px] text-tomato">{err}</p>}
      {tab === 'map' ? (
        <div className="mt-4">
          <OrderMap
            shop={shop}
            height={480}
            points={activeOrders.map((o) => ({ lat: o.location.lat, lng: o.location.lng, label: `${o.customer.name}`, sub: `${o.id} · ${stepOf(o.status).en} · ${rm(o.total)}`, color: o.status === 'delivering' ? '#3b6fd8' : '#e23d2d' }))}
          />
          <ul className="mt-3 space-y-2">
            {activeOrders.map((o) => (
              <li key={o.id} className="card flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13.5px]">
                <b>{o.id}</b> <span className="font-bold">{o.customer.name}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{o.location.address}</span>
                <span className="font-extrabold text-tomato">{rm(o.total)}</span>
                <a className="btn btn-ghost px-3 py-1 text-[12px]" target="_blank" rel="noreferrer" href={`https://waze.com/ul?ll=${o.location.lat},${o.location.lng}&navigate=yes`}><Navigation className="size-3.5" /> Waze</a>
              </li>
            ))}
            {activeOrders.length === 0 && <p className="card p-6 text-center text-muted">No active deliveries.</p>}
          </ul>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {shown.length === 0 && <p className="card p-8 text-center text-muted">No orders here yet.</p>}
          {shown.map((o) => <OrderCard key={o.id} o={o} pin={pin} onChanged={onChanged} staffInfo={staffInfo} />)}
        </div>
      )}
    </div>
  )
}

const gmailTo = (to, subject = '', body = '') =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
const gmailBcc = (list, subject = '') => `https://mail.google.com/mail/?view=cm&fs=1&bcc=${encodeURIComponent(list.join(','))}&su=${encodeURIComponent(subject)}`

function Customers({ pin }) {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState('')
  const load = useCallback(() => api('/api/admin/customers', { pin }).then((r) => setList(r.customers)).catch(() => {}), [pin])
  useEffect(() => {
    return autoRefresh(load, 5000)
  }, [load])
  const act = async (c, action, extra = {}) => {
    setBusy(c.phone + action)
    try {
      await api(`/api/admin/customers/${c.phone}`, { method: 'POST', body: { action, ...extra }, pin })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setBusy('')
  }
  const credit = async (c) => {
    const a = prompt(`Wallet credit for ${c.name} (RM). Minus to take back:`, '5')
    if (a === null || !+a) return
    const note = prompt('Note shown to the customer:', +a > 0 ? 'Bonus dari Pizzadonia' : 'Pelarasan')
    if (note === null) return
    setBusy(c.phone + 'credit')
    try {
      await withTxPin(`Wallet credit ${rm(+a)}`, (tx) => api(`/api/admin/wallets/${encodeURIComponent('c:' + c.phone)}/credit`, { method: 'POST', body: { amount: +a, note }, pin, txPin: tx }), c.name)
      await load()
    } catch (e) {
      alert(e.message)
    }
    setBusy('')
  }
  if (!list) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const ql = q.trim().toLowerCase()
  const shown = list.filter((c) =>
    (filter === 'all' || (filter === 'google' && c.google) || (filter === 'pin' && !c.google && !c.guest) || (filter === 'guest' && c.guest) || (filter === 'blocked' && c.blocked)) &&
    (!ql || [c.name, c.phone, c.email].some((v) => String(v || '').toLowerCase().includes(ql))))
  const emails = list.filter((c) => c.email && !c.blocked).map((c) => c.email)
  const stat = (k, v) => <div key={k} className="card px-4 py-3"><div className="text-[12px] font-semibold text-muted">{k}</div><div className="mt-0.5 text-lg font-extrabold">{v}</div></div>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat('Customers', list.length)}
        {stat('Google sign-in', list.filter((c) => c.google).length)}
        {stat('Guests (no account)', list.filter((c) => c.guest).length)}
        {stat('Total spent (delivered)', rm(list.reduce((s, c) => s + c.spent, 0)))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-60 flex-1 items-center gap-2 rounded-full border border-line bg-white px-4 py-2">
          <Search className="size-4 text-muted" />
          <input className="w-full bg-transparent text-[14px] outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or Gmail" aria-label="Search customers" />
        </div>
        {[['all', 'All'], ['google', 'Google'], ['pin', 'Phone + PIN'], ['guest', 'Guests'], ['blocked', 'Blocked']].map(([id, l]) => (
          <button key={id} onClick={() => setFilter(id)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${filter === id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{l}</button>
        ))}
        {emails.length > 0 && (
          <a className="btn btn-red px-4 py-2 text-[13px]" target="_blank" rel="noreferrer" href={gmailBcc(emails, 'Promo Pizzadonia')} title="Opens Gmail with every customer in BCC (they can't see each other)">
            <Mail className="size-4" /> Email all ({emails.length})
          </a>
        )}
      </div>
      {shown.length === 0 && <p className="card p-8 text-center text-muted">{list.length ? 'No customer matches.' : 'No customers yet.'}</p>}
      <ul className="space-y-3">
        {shown.map((c) => (
          <li key={c.phone} className={`card p-4 ${c.blocked ? 'opacity-70 ring-2 ring-tomato/40' : ''}`}>
            <div className="flex flex-wrap items-center gap-3">
              {c.picture ? <img src={c.picture} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full object-cover" /> : (
                <span className="grid size-11 place-items-center rounded-full bg-cream font-display text-lg">{(c.name || '?').slice(0, 1).toUpperCase()}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[15px]">{c.name}</b>
                  {c.google && <span className="rounded-full bg-[#4285f4]/10 px-2 py-0.5 text-[11px] font-bold text-[#1a5fd6]">Google</span>}
                  {c.hasPin && <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold">PIN</span>}
                  {c.guest && <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-muted">guest</span>}
                  {c.blocked && <span className="rounded-full bg-tomato px-2 py-0.5 text-[11px] font-bold text-white">blocked</span>}
                </div>
                <div className="truncate text-[12.5px] text-muted">+{c.phone}{c.email ? ` · ${c.email}` : ''}</div>
              </div>
              <div className="text-right text-[12.5px]">
                <div><b>{c.delivered}</b> delivered · <b>{rm(c.spent)}</b></div>
                <div className="text-muted">{c.lastOrder ? `last order ${new Date(c.lastOrder).toLocaleDateString()}` : 'no orders yet'}{c.wallet ? ` · wallet ${c.wallet.status} ${rm(c.wallet.balance)}` : ''}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.email && <a className="btn btn-ghost px-3 py-1.5 text-[12.5px]" target="_blank" rel="noreferrer" href={gmailTo(c.email, 'Pizzadonia', `Salam ${c.name},\n\n`)}><Mail className="size-3.5 text-tomato" /> Gmail</a>}
              <a className="btn btn-ghost px-3 py-1.5 text-[12.5px]" target="_blank" rel="noreferrer" href={waLink(c.phone, `Salam ${c.name}, `)}><MessageCircle className="size-3.5 text-[#25d366]" /> WhatsApp</a>
              <a className="btn btn-ghost px-3 py-1.5 text-[12.5px]" href={`tel:+${c.phone}`}><Phone className="size-3.5" /> Call</a>
              {c.wallet?.status === 'active' && <button className="btn btn-ghost px-3 py-1.5 text-[12.5px]" disabled={!!busy} onClick={() => credit(c)}><Gift className="size-3.5" /> Credit</button>}
              {!c.guest && (
                <>
                  <button className="btn btn-ghost px-3 py-1.5 text-[12.5px]" disabled={!!busy} onClick={() => { const n = prompt('New name:', c.name); if (n) act(c, 'rename', { name: n }) }}><Pencil className="size-3.5" /> Rename</button>
                  <button className="btn btn-ghost px-3 py-1.5 text-[12.5px]" disabled={!!busy} onClick={() => { const p = prompt(`New PIN for ${c.name} (4-6 digits). Tell them by WhatsApp:`, ''); if (p) act(c, 'resetPin', { pin: p }) }}><KeyRound className="size-3.5" /> Reset PIN</button>
                  {c.google && <button className="btn btn-ghost px-3 py-1.5 text-[12.5px]" disabled={!!busy} onClick={() => confirm(`Unlink Google from ${c.name}? They will log in with phone + PIN.`) && act(c, 'unlinkGoogle')}><Unlink className="size-3.5" /> Unlink Google</button>}
                </>
              )}
              <button className={`btn btn-ghost px-3 py-1.5 text-[12.5px] ${c.blocked ? 'text-basil' : 'text-tomato'}`} disabled={!!busy}
                onClick={() => confirm(c.blocked ? `Unblock ${c.name}?` : `Block ${c.name}? They can't log in or order until you unblock.`) && act(c, c.blocked ? 'unblock' : 'block')}>
                <Ban className="size-3.5" /> {c.blocked ? 'Unblock' : 'Block'}
              </button>
              {!c.guest && (
                <button className="btn btn-ghost ml-auto px-3 py-1.5 text-[12.5px] text-tomato" disabled={!!busy}
                  onClick={() => confirm(`Delete ${c.name}'s account? Their orders stay in your records.`) && act(c, 'delete')}>
                  <Trash2 className="size-3.5" /> Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// chats waiting for the seller (badge on the tab + chime), polled on every admin tab
function useSupportBadge(pin) {
  const [n, setN] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (!pin) return
    let stop = false
    const tick = () =>
      api('/api/admin/support', { pin }).then((r) => {
        if (stop) return
        const count = r.chats.filter((c) => c.status === 'waiting' || (c.unreadSeller > 0 && c.status !== 'closed' && c.status !== 'bot')).length
        if (count > prev.current) chime()
        prev.current = count
        setN(count)
      }).catch(() => {})
    tick()
    const t = setInterval(tick, 10000)
    return () => ((stop = true), clearInterval(t))
  }, [pin])
  return n
}

const CHAT_STATUS = { bot: ['Assistant', 'bg-cream text-muted'], waiting: ['Needs you', 'bg-tomato text-white'], open: ['You replied', 'bg-basil text-white'], closed: ['Closed', 'bg-ink/10 text-muted'] }

function Support({ pin }) {
  const [chats, setChats] = useState(null)
  const [sel, setSel] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('active')
  const box = useRef(null)
  const load = useCallback(() => api('/api/admin/support', { pin }).then((r) => setChats(r.chats)).catch(() => {}), [pin])
  useEffect(() => {
    return autoRefresh(load, 5000)
  }, [load])
  const c = chats?.find((x) => x.id === sel)
  useEffect(() => {
    if (c?.unreadSeller) api(`/api/admin/support/${c.id}`, { method: 'POST', body: { action: 'read' }, pin }).then(load).catch(() => {})
    setTimeout(() => box.current?.scrollTo({ top: 1e6 }), 30)
  }, [sel, c?.messages?.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (action, body = {}) => {
    setBusy(true)
    try {
      await api(`/api/admin/support/${sel}`, { method: 'POST', body: { action, ...body }, pin })
      if (action === 'reply') setText('')
      await load()
    } catch (e) {
      alert(e.message)
    }
    setBusy(false)
  }
  if (!chats) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const shown = chats.filter((x) => (filter === 'active' ? x.status !== 'closed' : filter === 'needs' ? x.status === 'waiting' || x.unreadSeller > 0 : true))
  const QUICK_REPLIES = ['Salam! Saya penjual Pizzadonia, boleh saya bantu?', 'Maaf atas kesulitan. Saya semak sekarang.', 'Pesanan anda sedang dalam perjalanan.', 'Kami akan refund ke dompet anda.', 'Terima kasih! 🍕']
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className={`${sel ? 'hidden lg:block' : ''}`}>
        <div className="mb-3 flex gap-2">
          {[['active', 'Active'], ['needs', 'Needs you'], ['all', 'All']].map(([id, l]) => (
            <button key={id} onClick={() => setFilter(id)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${filter === id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{l}</button>
          ))}
        </div>
        {shown.length === 0 && <p className="card p-6 text-center text-[13px] text-muted">No chats. Customers start one from the chat bubble on the shop.</p>}
        <ul className="space-y-2">
          {shown.map((x) => {
            const last = x.messages[x.messages.length - 1]
            const st = CHAT_STATUS[x.status]
            return (
              <li key={x.id}>
                <button onClick={() => setSel(x.id)} className={`card w-full p-3 text-left ${sel === x.id ? 'ring-2 ring-tomato' : ''} ${x.status === 'waiting' ? 'bg-tomato/5' : ''}`}>
                  <div className="flex items-center gap-2">
                    <b className="min-w-0 flex-1 truncate text-[14px]">{x.name}</b>
                    {x.unreadSeller > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-tomato px-1 text-[11px] font-extrabold text-white">{x.unreadSeller}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${st[1]}`}>{st[0]}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-muted">{last ? `${last.from === 'customer' ? '' : last.from === 'seller' ? 'You: ' : last.from === 'bot' ? 'Bot: ' : ''}${last.text}` : ''}</div>
                  <div className="text-[11px] text-muted">{new Date(x.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {c ? (
        <section className="card flex h-[70vh] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-cream/60 px-4 py-3">
            <button className="btn btn-ghost px-2.5 py-1 text-[12px] lg:hidden" onClick={() => setSel('')}>←</button>
            <div className="min-w-0 flex-1">
              <b>{c.name}</b> <span className="text-[12px] text-muted">{c.phone ? `+${c.phone}` : 'no phone'}{c.accountPhone ? ' · member' : ''}</span>
              {c.orders.length > 0 && <div className="truncate text-[11.5px] text-muted">Orders: {c.orders.map((o) => `${o.id} (${o.status})`).join(', ')}</div>}
            </div>
            {c.phone && <a className="btn btn-ghost px-3 py-1 text-[12px]" target="_blank" rel="noreferrer" href={waLink(c.phone, `Salam ${c.name}, `)}><MessageCircle className="size-3.5 text-[#25d366]" /> WhatsApp</a>}
            {c.status !== 'bot' && c.status !== 'closed' && <button className="btn btn-ghost px-3 py-1 text-[12px]" disabled={busy} onClick={() => act('bot')}><Bot className="size-3.5" /> Back to assistant</button>}
            {c.status !== 'closed' && <button className="btn btn-ghost px-3 py-1 text-[12px]" disabled={busy} onClick={() => act('close')}>Close</button>}
          </div>
          <div ref={box} className="flex-1 space-y-2 overflow-y-auto bg-cream/40 p-4">
            {c.messages.map((m, i) =>
              m.from === 'system' ? (
                <div key={i} className="text-center text-[11.5px] text-muted">— {m.text} —</div>
              ) : (
                <div key={i} className={`flex ${m.from === 'customer' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] ${m.from === 'customer' ? 'bg-white ring-1 ring-line' : m.from === 'seller' ? 'bg-basil text-white' : 'bg-ink/80 text-white'}`}>
                    <div className="mb-0.5 text-[10.5px] font-bold opacity-75">{m.from === 'customer' ? c.name : m.from === 'seller' ? 'You' : 'Assistant'}</div>
                    <div className="whitespace-pre-line break-words">{m.text}</div>
                    <div className="mt-0.5 text-right text-[10px] opacity-60">{new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto border-t border-line bg-white px-3 pt-2">
            {QUICK_REPLIES.map((q) => <button key={q} onClick={() => setText(q)} className="shrink-0 rounded-full bg-cream px-3 py-1 text-[12px]">{q}</button>)}
          </div>
          <form onSubmit={(e) => (e.preventDefault(), text.trim() && act('reply', { text }))} className="flex gap-2 bg-white p-3">
            <input className="field py-2.5" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${c.name}… (they see it in their chat)`} maxLength={1000} />
            <button className="btn btn-red shrink-0 px-4" disabled={busy || !text.trim()}><Send className="size-4" /></button>
          </form>
        </section>
      ) : (
        <div className="card hidden place-items-center p-10 text-center text-muted lg:grid">
          <div><Headset className="mx-auto size-10 text-line" /><p className="mt-2">Pick a chat. Red "Needs you" = the assistant handed it to you.</p></div>
        </div>
      )}
    </div>
  )
}

function AiChatSettings({ s, setS, pin }) {
  const a = s.aiChat || {}
  const set = (k, v) => setS({ ...s, aiChat: { ...a, [k]: v } })
  const [question, setQuestion] = useState('Ada pizza apa? Berapa caj hantar?')
  const [trial, setTrial] = useState(null)
  const [busy, setBusy] = useState(false)
  const tryIt = async (e) => {
    e.preventDefault()
    setBusy(true)
    setTrial(null)
    try {
      setTrial(await api('/api/admin/ai-test', { method: 'POST', body: { question, model: a.model }, pin }))
    } catch (err) {
      setTrial({ error: err.message })
    }
    setBusy(false)
  }
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide"><Bot className="size-5 text-tomato" /> Support chat AI</h2>
        <span className="rounded-full bg-crust/15 px-2.5 py-0.5 text-[11.5px] font-bold text-[#8a4a14]">Cloudflare Workers AI</span>
        <button role="switch" aria-checked={a.enabled !== false} onClick={() => set('enabled', a.enabled === false)} className={`relative ml-auto h-7 w-12 rounded-full transition ${a.enabled !== false ? 'bg-basil' : 'bg-ink/25'}`} aria-label="Support chat AI on">
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${a.enabled !== false ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <p className="text-[13px] text-muted">
        The built-in assistant always answers menu, prices, delivery fees, payment, promo and order status from your real shop data.
        With AI on, a Workers AI model also answers free-form questions. It only gets text and has <b>no tools</b>. Complaints and refunds still go to you.
      </p>
      <fieldset disabled={a.enabled === false} className="grid gap-2 disabled:opacity-50 sm:grid-cols-2">
        <legend className="mb-2 text-[13px] font-bold">Model</legend>
        {AI_MODELS.map((m) => (
          <label key={m.id} className={`flex cursor-pointer gap-3 rounded-2xl border-[1.5px] p-3 transition ${a.model === m.id ? 'border-crust bg-cheese/15' : 'border-line bg-white hover:border-crust/50'}`}>
            <input type="radio" name="ai-model" className="mt-1 size-4 accent-[#c9732a]" checked={a.model === m.id} onChange={() => set('model', m.id)} />
            <span className="min-w-0">
              <span className="block text-[14px] font-bold">{m.label}{m.id === DEFAULT_AI_MODEL && <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-basil">Recommended</span>}</span>
              <span className="block text-[12.5px] text-muted">{m.note}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <form onSubmit={tryIt} className="space-y-2 rounded-2xl bg-cream p-3">
        <div className="text-[13px] font-bold">Try it as a customer</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="field" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} aria-label="Sample customer question" />
          <button className="btn btn-ghost shrink-0 px-4 py-2.5 text-[13.5px]" disabled={busy || !question.trim() || a.enabled === false}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Ask
          </button>
        </div>
        {trial?.text && (
          <div className="rise rounded-2xl rounded-tl-md bg-white px-4 py-3 text-[14px] shadow-card">
            {trial.text}
            <div className="mt-1.5 text-[11.5px] text-muted">{AI_MODELS.find((m) => m.id === trial.model)?.label} · {(trial.ms / 1000).toFixed(1)} s</div>
          </div>
        )}
        {trial?.error && <p role="alert" className="text-[13px] font-semibold text-tomato">{trial.error}</p>}
        <p className="text-[12px] text-muted">Tries the selected model before you save. The on/off switch and model save with <b>Save settings</b>.</p>
      </form>
    </section>
  )
}

// the owner's AI helper inside the shop's Telegram bot (ops-assistant.js)
function OpsAiSettings({ s, setS }) {
  const a = s.opsAi || {}
  const set = (k, v) => setS({ ...s, opsAi: { ...a, [k]: v } })
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide"><Send className="size-5 text-tomato" /> Telegram AI helper</h2>
        <span className="rounded-full bg-crust/15 px-2.5 py-0.5 text-[11.5px] font-bold text-[#8a4a14]">Cloudflare Workers AI</span>
        <button role="switch" aria-checked={a.enabled !== false} onClick={() => set('enabled', a.enabled === false)} className={`relative ml-auto h-7 w-12 rounded-full transition ${a.enabled !== false ? 'bg-basil' : 'bg-ink/25'}`} aria-label="Telegram AI helper on">
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${a.enabled !== false ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <p className="text-[13px] text-muted">
        Message your connected bot in plain words, like <i>"why are alerts not coming?"</i> or <i>"Ayam sold out, close the shop at 10"</i>.
        It reads orders, menu, sales, customers, promos and support chats, and <b>/check</b> runs a health check of the shop and the bot.
        Changes to the menu, orders, promos, opening, delivery fees, customers and support replies arrive as a plan with <b>Confirm</b> / <b>Cancel</b> buttons. Nothing changes until you tap Confirm.
        Money actions never run from Telegram: payments, wallets, refunds, bank details, PINs and admin emails stay here behind your transaction PIN. <b>/reset</b> clears its memory.
      </p>
      <fieldset disabled={a.enabled === false} className="grid gap-2 disabled:opacity-50 sm:grid-cols-2">
        <legend className="mb-2 text-[13px] font-bold">Model (needs tool use)</legend>
        {OPS_MODELS.map((m) => (
          <label key={m.id} className={`flex cursor-pointer gap-3 rounded-2xl border-[1.5px] p-3 transition ${a.model === m.id ? 'border-crust bg-cheese/15' : 'border-line bg-white hover:border-crust/50'}`}>
            <input type="radio" name="ops-model" className="mt-1 size-4 accent-[#c9732a]" checked={a.model === m.id} onChange={() => set('model', m.id)} />
            <span className="min-w-0">
              <span className="block text-[14px] font-bold">{m.label}{m.id === DEFAULT_OPS_MODEL && <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-basil">Recommended</span>}</span>
              <span className="block text-[12.5px] text-muted">{m.note}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-[12px] text-muted">The switch and model save with <b>Save settings</b>. If answers look wrong, try another model.</p>
    </section>
  )
}

// ---- owner's business account book (Ryt Bank). Seller only.
const LEDGER_CAT = {
  sale_transfer: ['Sale (transfer)', 'bg-basil/15 text-basil'], sale_cod: ['Sale (COD bank-in)', 'bg-basil/15 text-basil'],
  wallet_topup: ['Wallet top-up', 'bg-[#3b6fd8]/10 text-[#3b6fd8]'], income: ['Other income', 'bg-basil/15 text-basil'],
  supplier: ['Kitchen / supplier', 'bg-crust/15 text-crust'], wallet_refund: ['Customer refund', 'bg-tomato/10 text-tomato'],
  rider_payout: ['Rider payout', 'bg-tomato/10 text-tomato'], salary: ['Salary', 'bg-ink text-white'], expense: ['Expense', 'bg-tomato/10 text-tomato'],
  adjust_in: ['Correction +', 'bg-cream text-muted'], adjust_out: ['Correction -', 'bg-cream text-muted'],
}
const myDate = (iso) => new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().slice(0, 10)

function LedgerForm({ kind, onClose, onSaved, pin, current }) {
  const today = myDate(new Date().toISOString())
  const [amount, setAmount] = useState(kind === 'opening' ? String(current?.amount || '') : '')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(kind === 'opening' ? current?.date || today : today)
  const [cat, setCat] = useState(kind === 'correction' ? 'adjust_in' : kind)
  const [err, setErr] = useState('')
  const title = { opening: 'Set opening balance', salary: 'Take salary', expense: 'Add business expense', income: 'Add other income', correction: 'Correction' }[kind]
  const save = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      const r = await withTxPin(kind === 'opening' ? `Opening balance ${rm(+amount)}` : `${title} ${rm(+amount)}`, (tx) =>
        kind === 'opening'
          ? api('/api/admin/ledger/opening', { method: 'POST', body: { amount: +amount, date }, pin, txPin: tx })
          : api('/api/admin/ledger', { method: 'POST', body: { cat, amount: +amount, note, date }, pin, txPin: tx }))
      if (r) onSaved()
    } catch (e2) {
      setErr(e2.message)
    }
  }
  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center bg-ink/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label={title}>
      <form onSubmit={save} className="w-full max-w-md space-y-3 rounded-t-[28px] bg-paper p-5 sm:rounded-[28px]">
        <div className="flex items-center"><h2 className="flex-1 font-display text-xl tracking-wide">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-cream" aria-label="Close"><CircleX className="size-5" /></button></div>
        {kind === 'opening' && <p className="text-[12.5px] text-muted">Open your Ryt Bank app and type the balance it shows today. Everything before this date is ignored; everything after is added automatically.</p>}
        {kind === 'salary' && <p className="text-[12.5px] text-muted">Record money you moved from the business account to yourself. Keep it under "Safe to take as salary".</p>}
        {kind === 'correction' && (
          <div className="flex gap-2">
            {[['adjust_in', '+ Money in'], ['adjust_out', '- Money out']].map(([id, l]) => (
              <button key={id} type="button" onClick={() => setCat(id)} className={`flex-1 rounded-full py-2 text-[13px] font-bold ${cat === id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{l}</button>
            ))}
          </div>
        )}
        <Field label="Amount (RM)"><input className="field text-xl font-bold" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label={kind === 'opening' ? 'Balance on this date' : 'Date'}><input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {kind !== 'opening' && (
          <Field label="Note"><input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120}
            placeholder={{ salary: 'e.g. Gaji Oktober', expense: 'e.g. Kotak pizza 100 pcs', income: 'e.g. Tempahan katering', correction: 'Why?' }[kind]} /></Field>
        )}
        {err && <p className="text-[13px] font-semibold text-tomato">{err}</p>}
        <button className="btn btn-red w-full py-3.5 text-[15px]" disabled={!(+amount > 0 || (kind === 'opening' && amount !== ''))}><Save className="size-4" /> Save</button>
      </form>
    </div>
  )
}

function BusinessAccount({ pin }) {
  const [d, setD] = useState(null)
  const [form, setForm] = useState('')
  const [period, setPeriod] = useState('month')
  const load = useCallback(() => api('/api/admin/ledger', { pin }).then(setD).catch(() => {}), [pin])
  useEffect(() => {
    return autoRefresh(load, 5000)
  }, [load])
  if (!d) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const today = myDate(new Date().toISOString())
  const since = { today, week: myDate(new Date(Date.now() - 6 * 864e5).toISOString()), month: today.slice(0, 8) + '01', all: '' }[period]
  const rows = d.entries.filter((e) => !since || myDate(e.at) >= since)
  const sum = (f) => rows.filter(f).reduce((s, e) => s + e.amount, 0)
  const sales = sum((e) => e.cat === 'sale_transfer' || e.cat === 'sale_cod')
  const supplier = sum((e) => e.cat === 'supplier')
  const salary = sum((e) => e.cat === 'salary')
  const expenses = sum((e) => e.cat === 'expense')
  const moneyIn = sum((e) => e.dir === 'in')
  const moneyOut = sum((e) => e.dir === 'out')
  const del = async (e) => {
    if (!confirm(`Delete "${e.label}" ${rm(e.amount)}?`)) return
    try {
      const r = await withTxPin('Delete entry', (tx) => api(`/api/admin/ledger/${e.id}`, { method: 'DELETE', pin, txPin: tx }))
      if (r) load()
    } catch (x) {
      alert(x.message)
    }
  }
  const csv = () => {
    const head = ['Date', 'Description', 'Type', 'Money in (RM)', 'Money out (RM)', 'Balance (RM)']
    const lines = [head, ['', 'Opening balance', '', '', '', (d.opening.amount || 0).toFixed(2)],
      ...d.entries.map((e) => [new Date(e.at).toLocaleString('en-GB'), e.label, (LEDGER_CAT[e.cat] || [e.cat])[0], e.dir === 'in' ? e.amount.toFixed(2) : '', e.dir === 'out' ? e.amount.toFixed(2) : '', e.balance.toFixed(2)])]
    const text = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }))
    a.download = `pizzadonia-account-${today}.csv`
    a.click()
  }
  return (
    <div className="space-y-5">
      {form && <LedgerForm kind={form} pin={pin} current={d.opening} onClose={() => setForm('')} onSaved={() => (setForm(''), load())} />}
      {!d.opening.date && (
        <p className="flex flex-wrap items-center gap-3 rounded-2xl bg-cheese/40 px-4 py-3 text-[13.5px]">
          <b>Start here:</b> set the opening balance - the amount in your {d.bank} account today.
          <button className="btn btn-red px-4 py-1.5 text-[13px]" onClick={() => setForm('opening')}>Set opening balance</button>
        </p>
      )}
      <section className="overflow-hidden rounded-[26px] bg-gradient-to-br from-ink via-[#3a2418] to-tomato-deep p-6 text-white shadow-pop">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold uppercase tracking-wider text-white/70">
          <Landmark className="size-4" /> {d.bank} · Pizzadonia business account
        </div>
        <div className="mt-2 font-display text-5xl tracking-wide">{rm(d.balance)}</div>
        <div className="text-[12.5px] text-white/70">Balance (opening {rm(d.opening.amount || 0)}{d.opening.date ? ` on ${d.opening.date}` : ''} + everything since)</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <div className="text-[12px] text-white/70">Customer & rider wallet money (not yours yet)</div>
            <div className="text-xl font-extrabold">{rm(d.held)}</div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 text-ink">
            <div className="text-[12px] font-bold text-muted">Safe to take as salary</div>
            <div className="text-xl font-extrabold text-basil">{rm(d.safeToWithdraw)}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn bg-white px-4 py-2 text-[13px] text-ink" onClick={() => setForm('salary')}><Wallet className="size-4" /> Take salary</button>
          <button className="btn bg-white/15 px-4 py-2 text-[13px] text-white" onClick={() => setForm('expense')}><ReceiptText className="size-4" /> Add expense</button>
          <button className="btn bg-white/15 px-4 py-2 text-[13px] text-white" onClick={() => setForm('income')}><Plus className="size-4" /> Other income</button>
          <button className="btn bg-white/15 px-4 py-2 text-[13px] text-white" onClick={() => setForm('correction')}>± Correction</button>
          <button className="btn bg-white/15 px-4 py-2 text-[13px] text-white" onClick={() => setForm('opening')}>Opening balance</button>
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {[['today', 'Today'], ['week', '7 days'], ['month', 'This month'], ['all', 'All']].map(([id, l]) => (
            <button key={id} onClick={() => setPeriod(id)} className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${period === id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{l}</button>
          ))}
          <button className="btn btn-ghost ml-auto px-4 py-1.5 text-[13px]" onClick={csv}><FileUp className="size-4 rotate-180" /> Download (Excel CSV)</button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[['Sales received', sales, 'text-basil'], ['Paid to kitchen', supplier, ''], ['Salary taken', salary, ''], ['Expenses', expenses, '']].map(([k, v, c]) => (
            <div key={k} className="card px-4 py-3"><div className="text-[12px] font-semibold text-muted">{k}</div><div className={`mt-0.5 text-lg font-extrabold ${c}`}>{rm(v)}</div></div>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-muted">Money in {rm(moneyIn)} · money out {rm(moneyOut)} · <b className="text-ink">net {moneyIn - moneyOut >= 0 ? '+' : '-'}{rm(Math.abs(moneyIn - moneyOut))}</b> (wallet top-ups count as money in, but they belong to customers until spent)</p>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl tracking-wide">Statement</h2>
        {rows.length === 0 ? <p className="card p-6 text-center text-muted">No transactions in this period.</p> : (
          <ul className="card divide-y divide-line">
            {[...rows].reverse().map((e) => {
              const [cl, cc] = LEDGER_CAT[e.cat] || [e.cat, 'bg-cream']
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]">
                  <div className="w-24 shrink-0 text-[12px] text-muted">{new Date(e.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{e.label}</div>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${cc}`}>{cl}</span>
                    {!e.auto && <span className="ml-1 text-[10.5px] text-muted">manual</span>}
                  </div>
                  <div className="text-right">
                    <div className={`font-extrabold tabular-nums ${e.dir === 'in' ? 'text-basil' : ''}`}>{e.dir === 'in' ? '+' : '-'}{rm(e.amount)}</div>
                    <div className="text-[11px] text-muted">bal {rm(e.balance)}</div>
                  </div>
                  {!e.auto && <button className="grid size-8 place-items-center rounded-full text-muted hover:bg-tomato/10 hover:text-tomato" onClick={() => del(e)} aria-label="Delete entry"><Trash2 className="size-4" /></button>}
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2 text-[12px] text-muted">Automatic lines come from your orders (confirmed transfers, rider bank-ins, kitchen payments, wallet top-ups and refunds) - fix them on the order itself. COD cash only counts once the rider's bank-in is confirmed.</p>
      </section>
    </div>
  )
}

function GoogleSettings({ s, setS }) {
  const origin = (s.publicUrl || location.origin).replace(/\/$/, '')
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-display text-2xl tracking-wide">Sign in with Google</h2>
      <p className="text-[13px] text-muted">Paste your Google <b>OAuth Web client ID</b> to show the "Continue with Google" button to customers and on this seller login. Empty = button hidden.</p>
      <Field label="Owner Google accounts (admin + seller)" hint={s.me ? `You are signed in with Google as ${s.me}.` : 'These Gmails open the seller page from any device - comma separated.'}>
        <input className="field" value={Array.isArray(s.adminEmails) ? s.adminEmails.join(', ') : s.adminEmails || ''} onChange={(e) => setS({ ...s, adminEmails: e.target.value })} placeholder="you@gmail.com" />
      </Field>
      <Field label="Client ID">
        <input className="field font-mono text-[12.5px]" value={s.googleClientId || ''} onChange={(e) => setS({ ...s, googleClientId: e.target.value.trim() })} placeholder="1234567890-abc123.apps.googleusercontent.com" />
      </Field>
      <details className="rounded-2xl bg-cream px-4 py-3 text-[13px]">
        <summary className="cursor-pointer font-bold">How to get the Client ID (5 minutes, free)</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Open <a className="font-bold text-tomato underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">console.cloud.google.com/apis/credentials</a> and sign in with your Gmail. Create a project if asked (name: Pizzadonia).</li>
          <li><b>OAuth consent screen</b> (Google Auth Platform → Branding): app name <b>Pizzadonia</b>, your email, audience <b>External</b>, then <b>Publish app</b> so every customer can use it.</li>
          <li><b>Credentials → Create credentials → OAuth client ID</b> → type <b>Web application</b>.</li>
          <li>Under <b>Authorised JavaScript origins</b> add exactly: <code className="select-all rounded bg-white px-1.5 py-0.5">{origin}</code> and <code className="select-all rounded bg-white px-1.5 py-0.5">http://localhost:5400</code></li>
          <li>Create → copy the <b>Client ID</b> (ends with .apps.googleusercontent.com) → paste above → <b>Save settings</b>.</li>
        </ol>
        <p className="mt-2 text-muted">Only the Client ID is needed - never paste the "client secret" anywhere. If the shop link ever changes, add the new link as an origin too.</p>
      </details>
    </section>
  )
}

function PromoForm({ pin, onDone }) {
  const [f, setF] = useState({ code: '', kind: 'percent', value: '', minOrder: '', maxUses: '', oncePerCustomer: true, expires: '' })
  const [err, setErr] = useState('')
  const set = (k, v) => setF({ ...f, [k]: v })
  const save = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api('/api/admin/promos', { method: 'POST', body: f, pin })
      setF({ code: '', kind: 'percent', value: '', minOrder: '', maxUses: '', oncePerCustomer: true, expires: '' })
      onDone()
    } catch (e2) {
      setErr(e2.message)
    }
  }
  return (
    <form onSubmit={save} className="grid gap-3 rounded-2xl bg-cream p-4 sm:grid-cols-3">
      <Field label="Code"><input className="field uppercase" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="RAYA20" maxLength={16} /></Field>
      <Field label="Discount">
        <div className="flex gap-2">
          <select className="field w-24" value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="percent">%</option><option value="fixed">RM</option></select>
          <input className="field" type="number" min="0" step="0.5" value={f.value} onChange={(e) => set('value', e.target.value)} placeholder={f.kind === 'percent' ? '10' : '5'} />
        </div>
      </Field>
      <Field label="Min. order (RM)" hint="0 = any"><input className="field" type="number" min="0" value={f.minOrder} onChange={(e) => set('minOrder', e.target.value)} /></Field>
      <Field label="Max uses" hint="0 = unlimited"><input className="field" type="number" min="0" value={f.maxUses} onChange={(e) => set('maxUses', e.target.value)} /></Field>
      <Field label="Expires" hint="empty = never"><input className="field" type="date" value={f.expires} onChange={(e) => set('expires', e.target.value)} /></Field>
      <label className="flex items-center gap-2 self-center text-[13px] font-bold">
        <input type="checkbox" className="size-5 accent-[#e23d2d]" checked={f.oncePerCustomer} onChange={(e) => set('oncePerCustomer', e.target.checked)} /> Once per customer
      </label>
      <div className="sm:col-span-3 flex items-center gap-3">
        <button className="btn btn-red px-5 py-2.5 text-[13.5px]" disabled={f.code.length < 3 || !(+f.value > 0)}><Plus className="size-4" /> Create promo code</button>
        {err && <span className="text-[13px] font-semibold text-tomato">{err}</span>}
      </div>
    </form>
  )
}

function CashbackCard({ pin }) {
  const [c, setC] = useState(null)
  const [menuList, setMenuList] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api('/api/admin/settings', { pin }).then((s) => (setC({ exclude: [], ...s.cashback }), setMenuList(s.menu || []))).catch(() => {})
  }, [pin])
  if (!c) return null
  const set = (k, v) => setC({ ...c, [k]: v })
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
  const live = c.active && c.percent > 0 && (!c.start || today >= c.start) && (!c.end || today <= c.end)
  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await withTxPin('Save cashback campaign', (tx) => api('/api/admin/settings', { method: 'PUT', body: { cashback: c }, pin, txPin: tx }), `${c.percent}% · ${c.start || 'now'} → ${c.end || 'no end'}`)
      if (r) (setC(r.cashback), setMsg('Saved'))
    } catch (e) {
      if (e.status === 200) setMsg('Saved')
      else setMsg(e.message)
    }
    setBusy(false)
  }
  const ex = Math.floor(21.9 * c.percent) / 100
  return (
    <section className={`card space-y-3 p-5 ${live ? 'ring-2 ring-basil/50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl tracking-wide"><Gift className="size-5 text-basil" /> Cashback campaign</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${live ? 'bg-basil text-white' : 'bg-cream text-muted'}`}>{live ? 'LIVE now' : c.active ? 'scheduled / ended' : 'off'}</span>
        <button role="switch" aria-checked={c.active} onClick={() => set('active', !c.active)} className={`relative ml-auto h-7 w-12 rounded-full transition ${c.active ? 'bg-basil' : 'bg-ink/25'}`} aria-label="Cashback on">
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${c.active ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <p className="text-[12.5px] text-muted">Logged-in customers get this % of the pizza price (after promo, without delivery) into their wallet when the order is delivered.</p>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Cashback %"><input className="field" type="number" min="0" max="50" value={c.percent} onChange={(e) => set('percent', e.target.value)} /></Field>
        <Field label="Start"><input className="field" type="date" value={c.start} onChange={(e) => set('start', e.target.value)} /></Field>
        <Field label="End (last day)"><input className="field" type="date" value={c.end} onChange={(e) => set('end', e.target.value)} /></Field>
        <Field label="Min. order (RM)" hint="0 = any"><input className="field" type="number" min="0" value={c.minOrder} onChange={(e) => set('minOrder', e.target.value)} /></Field>
        <Field label="Max per order (RM)" hint="0 = no cap"><input className="field" type="number" min="0" value={c.maxPerOrder} onChange={(e) => set('maxPerOrder', e.target.value)} /></Field>
      </div>
      <div>
        <div className="mb-1.5 text-[13px] font-bold">Pizzas that get cashback</div>
        <div className="flex flex-wrap gap-2">
          {menuList.map((m) => {
            const on = !(c.exclude || []).includes(m.id)
            return (
              <button key={m.id} type="button" onClick={() => set('exclude', on ? [...(c.exclude || []), m.id] : (c.exclude || []).filter((x) => x !== m.id))}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${on ? 'bg-basil/15 text-basil' : 'bg-ink/10 text-muted line-through'}`}>
                {on ? '✓' : '✕'} {m.name}
              </button>
            )
          })}
        </div>
      </div>
      <p className="rounded-xl bg-cream px-3 py-2 text-[12.5px]">Example: a RM21.90 pizza gives <b>{rm(ex)}</b> cashback - your profit on it drops from about RM5.90 to <b>{rm(5.9 - ex)}</b>.</p>
      <div className="flex items-center gap-3">
        <button className="btn btn-red px-5 py-2.5 text-[13.5px]" onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save campaign</button>
        {msg && <span className={`text-[13px] font-semibold ${msg === 'Saved' ? 'text-basil' : 'text-tomato'}`}>{msg}</span>}
      </div>
    </section>
  )
}

function WelcomeCard({ pin }) {
  const [w, setW] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    api('/api/admin/settings', { pin }).then((s) => setW(s.welcome)).catch(() => {})
  }, [pin])
  if (!w) return null
  const set = (k, v) => setW({ ...w, [k]: v })
  const save = async () => {
    setMsg('')
    try {
      const r = await withTxPin('Save welcome gift', (tx) => api('/api/admin/settings', { method: 'PUT', body: { welcome: w }, pin, txPin: tx }), `${w.active ? 'ON' : 'OFF'} · ${rm(+w.amount)} · min order ${rm(+w.minOrder)}`)
      if (r) (setW(r.welcome), setMsg('Saved'))
    } catch (e) {
      setMsg(e.message)
    }
  }
  return (
    <section className={`card space-y-3 p-5 ${w.active ? 'ring-2 ring-tomato/40' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl tracking-wide"><Gift className="size-5 text-tomato" /> Welcome gift (new customers)</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${w.active ? 'bg-tomato text-white' : 'bg-cream text-muted'}`}>{w.active ? 'ON' : 'off'}</span>
        <button role="switch" aria-checked={w.active} onClick={() => set('active', !w.active)} className={`relative ml-auto h-7 w-12 rounded-full transition ${w.active ? 'bg-basil' : 'bg-ink/25'}`} aria-label="Welcome gift on">
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${w.active ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <p className="text-[12.5px] text-muted">When a signed-up customer's <b>first order is delivered</b>, this amount goes into their wallet - once per phone number, ever. They can spend it on an order of at least the minimum below, but never withdraw it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gift (RM)"><input className="field" type="number" min="0" max="100" step="0.5" value={w.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Use on orders from (RM pizza)"><input className="field" type="number" min="0" value={w.minOrder} onChange={(e) => set('minOrder', e.target.value)} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-red px-5 py-2.5 text-[13.5px]" onClick={save}><Save className="size-4" /> Save welcome gift</button>
        {msg && <span className={`text-[13px] font-semibold ${msg === 'Saved' ? 'text-basil' : 'text-tomato'}`}>{msg}</span>}
      </div>
    </section>
  )
}

function Wallets({ pin }) {
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState('')
  const load = useCallback(() => api('/api/admin/wallets', { pin }).then(setD).catch(() => {}), [pin])
  useEffect(() => {
    return autoRefresh(load, 5000)
  }, [load])
  const run = async (id, fn) => {
    setBusy(id)
    try {
      await fn()
      await load()
    } catch (e) {
      alert(e.message)
    }
    setBusy('')
  }
  if (!d) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const byKey = Object.fromEntries(d.wallets.map((w) => [w.key, w]))
  const activations = d.wallets.filter((w) => w.status === 'pending')
  const topups = d.tx.filter((t) => t.status === 'pending' && t.type === 'topup')
  const withdraws = d.tx.filter((t) => t.status === 'pending' && t.type === 'withdraw')
  const who = (key) => (key === 'rider' ? 'Rider' : `${byKey[key]?.customerName || ''} (+${key.slice(2)})`)
  const txAct = (t, action) => run(t.id, async () => {
    let body = { action }
    if (action === 'reject') {
      const reason = prompt('Reason (the customer / rider sees it):', t.type === 'topup' ? 'Duit belum masuk / jumlah tidak sama' : '')
      if (reason === null) return
      body.reason = reason
    } else if (t.type === 'topup') {
      if (!confirm(`Confirm ${rm(t.amount)} really arrived in your bank? The wallet is credited right away.`)) return
    } else {
      const note = prompt(`After you transferred ${rm(-t.amount)} to ${byKey[t.wallet]?.bankName} ${byKey[t.wallet]?.accountNumber}, type the transfer reference (optional):`, '')
      if (note === null) return
      body.note = note ? `Dihantar · ruj ${note}` : 'Dihantar ke bank'
    }
    const label = action === 'reject' ? `Reject ${t.type === 'topup' ? 'top-up' : 'payout'} ${rm(Math.abs(t.amount))}` : t.type === 'topup' ? `Confirm top-up ${rm(t.amount)}` : `Confirm payout sent ${rm(-t.amount)}`
    await withTxPin(label, (tx) => api(`/api/admin/wallet-tx/${t.id}`, { method: 'POST', body, pin, txPin: tx }), who(t.wallet))
  })
  const credit = (key, name) => run(key, async () => {
    const a = prompt(`Credit for ${name} (RM). Use a minus sign to take money back:`, '5')
    if (a === null || !+a) return
    const note = prompt('Note shown to the customer:', +a > 0 ? 'Bonus promo dari Pizzadonia' : 'Pelarasan')
    if (note === null) return
    await withTxPin(`Wallet credit ${rm(+a)}`, (tx) => api(`/api/admin/wallets/${encodeURIComponent(key)}/credit`, { method: 'POST', body: { amount: +a, note }, pin, txPin: tx }), name)
  })
  const nothing = !activations.length && !topups.length && !withdraws.length
  const totalHeld = d.wallets.reduce((s, w) => s + w.balance, 0)
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-display text-xl tracking-wide">Needs you</h2>
        {nothing && <p className="card p-5 text-center text-muted">Nothing to approve right now.</p>}
        <div className="space-y-3">
          {activations.map((w) => (
            <div key={w.key} className="card flex flex-wrap items-center gap-3 p-4 ring-2 ring-cheese">
              <span className="rounded-full bg-cheese px-2.5 py-0.5 text-[11.5px] font-bold">Wallet request</span>
              <div className="min-w-0 flex-1 text-[13.5px]">
                <b>{w.name}</b> <span className="text-muted">· +{w.key.slice(2)} · account name: {w.customerName}</span>
                <div className="tabular-nums">{w.bankName} · {w.accountNumber}</div>
              </div>
              <button className="btn bg-basil px-4 py-2 text-[13px] text-white" disabled={!!busy} onClick={() => run(w.key, () => api(`/api/admin/wallets/${encodeURIComponent(w.key)}/status`, { method: 'POST', body: { action: 'approve' }, pin }))}>
                <CircleCheck className="size-4" /> Approve
              </button>
              <button className="btn btn-ghost px-4 py-2 text-[13px] text-tomato" disabled={!!busy} onClick={() => {
                const reason = prompt('Why reject? (customer sees it)', 'Nama tidak sama dengan akaun bank')
                if (reason !== null) run(w.key, () => api(`/api/admin/wallets/${encodeURIComponent(w.key)}/status`, { method: 'POST', body: { action: 'reject', reason }, pin }))
              }}><CircleX className="size-4" /> Reject</button>
            </div>
          ))}
          {topups.map((t) => (
            <div key={t.id} className="card flex flex-wrap items-center gap-4 p-4 ring-2 ring-cheese">
              <AdminFile src={`/api/admin/wallet-files/${t.file}`} type={t.ftype} pin={pin} size="size-20" />
              <div className="min-w-0 flex-1 text-[13.5px]">
                <span className="rounded-full bg-basil/15 px-2.5 py-0.5 text-[11.5px] font-bold text-basil">Top-up</span>
                <div className="mt-1 text-xl font-extrabold">{rm(t.amount)}</div>
                <div className="text-muted">{who(t.wallet)} · {new Date(t.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
              </div>
              <button className="btn bg-basil px-4 py-2 text-[13px] text-white" disabled={!!busy} onClick={() => txAct(t, 'confirm')}><CircleCheck className="size-4" /> Money received</button>
              <button className="btn btn-ghost px-4 py-2 text-[13px] text-tomato" disabled={!!busy} onClick={() => txAct(t, 'reject')}><CircleX className="size-4" /> Reject</button>
            </div>
          ))}
          {withdraws.map((t) => {
            const w = byKey[t.wallet] || {}
            return (
              <div key={t.id} className="card flex flex-wrap items-center gap-4 p-4 ring-2 ring-tomato/40">
                <div className="min-w-0 flex-1 text-[13.5px]">
                  <span className="rounded-full bg-tomato/10 px-2.5 py-0.5 text-[11.5px] font-bold text-tomato">Refund / payout request</span>
                  <div className="mt-1 text-xl font-extrabold">{rm(-t.amount)}</div>
                  <div className="text-muted">{who(t.wallet)} · {new Date(t.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                  <div className="mt-1 rounded-xl bg-cream px-3 py-2"><b>Send to:</b> {w.name} · {w.bankName} · <span className="select-all font-bold tabular-nums">{w.accountNumber}</span></div>
                </div>
                <button className="btn bg-basil px-4 py-2 text-[13px] text-white" disabled={!!busy} onClick={() => txAct(t, 'confirm')}><Landmark className="size-4" /> I've sent it</button>
                <button className="btn btn-ghost px-4 py-2 text-[13px] text-tomato" disabled={!!busy} onClick={() => txAct(t, 'reject')}><CircleX className="size-4" /> Reject</button>
              </div>
            )
          })}
        </div>
      </section>

      <WelcomeCard pin={pin} />
      <CashbackCard pin={pin} />

      <section>
        <h2 className="mb-2 flex items-center gap-2 font-display text-xl tracking-wide"><Tag className="size-5 text-tomato" /> Promo codes</h2>
        <PromoForm pin={pin} onDone={load} />
        {d.promos.length > 0 && (
          <ul className="mt-3 space-y-2">
            {d.promos.map((p) => (
              <li key={p.code} className={`card flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px] ${p.active ? '' : 'opacity-60'}`}>
                <b className="font-display text-lg tracking-wide">{p.code}</b>
                <span className="rounded-full bg-basil/10 px-2.5 py-0.5 font-bold text-basil">{p.kind === 'percent' ? `${p.value}% off` : `${rm(p.value)} off`}</span>
                <span className="text-muted">
                  {p.minOrder ? `min ${rm(p.minOrder)} · ` : ''}used {p.used}{p.maxUses ? `/${p.maxUses}` : ''}{p.oncePerCustomer ? ' · once per customer' : ''}{p.expires ? ` · until ${p.expires}` : ''}
                </span>
                <span className="ml-auto flex gap-2">
                  <button className="btn btn-ghost px-3 py-1 text-[12px]" onClick={() => run(p.code, () => api(`/api/admin/promos/${p.code}`, { method: 'PATCH', body: { active: !p.active }, pin }))}>{p.active ? 'Pause' : 'Turn on'}</button>
                  <button className="btn btn-ghost px-3 py-1 text-[12px] text-tomato" onClick={() => confirm(`Delete ${p.code}?`) && run(p.code, () => api(`/api/admin/promos/${p.code}`, { method: 'PATCH', body: { delete: true }, pin }))}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 flex items-center gap-2 font-display text-xl tracking-wide"><Wallet className="size-5 text-tomato" /> Wallets</h2>
        <p className="mb-2 text-[12.5px] text-muted">Money you hold for customers and the rider: <b className="text-ink">{rm(totalHeld)}</b>. Give a bonus with <b>Credit</b>.</p>
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-cream text-left text-muted">
              <tr>{['Who', 'Bank', 'Status', 'Balance', ''].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.wallets.length === 0 && <tr><td colSpan={5} className="px-4 py-5 text-center text-muted">No wallets yet. Customers apply from their Account → Dompet saya.</td></tr>}
              {d.wallets.map((w) => (
                <tr key={w.key}>
                  <td className="px-4 py-2"><b>{w.key === 'rider' ? 'Rider' : w.customerName || w.name}</b><div className="text-muted">{w.key === 'rider' ? '' : `+${w.key.slice(2)}`}</div></td>
                  <td className="px-4 py-2">{w.bankName ? `${w.bankName} · ${w.accountNumber}` : '-'}</td>
                  <td className="px-4 py-2">{w.status}</td>
                  <td className="px-4 py-2 font-bold">{rm(w.balance)}{w.held > 0 && <div className="text-[11.5px] font-normal text-muted">{rm(w.held)} on hold</div>}</td>
                  <td className="px-4 py-2 text-right">
                    {w.status === 'active' && (
                      <button className="btn btn-ghost px-3 py-1 text-[12px]" disabled={!!busy} onClick={() => credit(w.key, w.customerName || 'rider')}><Gift className="size-3.5" /> Credit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl tracking-wide">Recent wallet activity</h2>
        <ul className="card divide-y divide-line text-[13px]">
          {d.tx.length === 0 && <li className="px-4 py-4 text-center text-muted">No activity yet.</li>}
          {d.tx.slice(0, 40).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className="font-mono text-[11.5px] text-muted">{t.id}</span>
              <b>{(TX[t.type] || [t.type])[0]}</b>
              <span className="text-muted">{who(t.wallet)}{t.ref ? ` · ${t.ref}` : ''}{t.note ? ` · ${t.note}` : ''}</span>
              <span className={`ml-auto font-bold tabular-nums ${t.amount >= 0 ? 'text-basil' : ''}`}>{t.amount >= 0 ? '+' : '-'}{rm(Math.abs(t.amount))}</span>
              {t.status !== 'done' && <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold">{t.status}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const BI = { pending: ['To check', 'bg-cheese text-ink'], confirmed: ['Received', 'bg-basil text-white'], rejected: ['Rejected', 'bg-tomato text-white'] }

function Money({ pin }) {
  const [days, setDays] = useState(1)
  const [r, setR] = useState(null)
  const [bi, setBi] = useState(null)
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api(`/api/admin/report?days=${days}`, { pin }), api('/api/admin/bankins', { pin })])
    setR(a)
    setBi(b.bankins)
  }, [days, pin])
  useEffect(() => {
    return autoRefresh(load, 5000)
  }, [load])
  const act = async (id, action) => {
    let reason
    if (action === 'reject') {
      reason = prompt('Why reject this bank-in? (the rider sees it and banks in again)', 'Jumlah tidak sama / duit belum masuk')
      if (reason === null) return
    } else if (!confirm(`Confirm ${id}: the money is really in your bank account?`)) return
    setBusy(id)
    try {
      const r = await withTxPin(action === 'confirm' ? `Confirm bank-in ${id}` : `Reject bank-in ${id}`, (tx) => api(`/api/admin/bankins/${id}`, { method: 'POST', body: { action, reason }, pin, txPin: tx }))
      if (r) setBi(r.bankins)
      load()
    } catch (e) {
      alert(e.message)
    }
    setBusy('')
  }
  if (!r || !bi) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const card = (k, v, sub, cls = '') => (
    <div key={k} className={`card px-4 py-3 ${cls}`}>
      <div className="text-[12px] font-semibold text-muted">{k}</div>
      <div className="mt-0.5 text-xl font-extrabold">{v}</div>
      {sub && <div className="text-[11.5px] text-muted">{sub}</div>}
    </div>
  )
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[[1, 'Today'], [7, '7 days'], [30, '30 days'], [0, 'All time']].map(([d, l]) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${days === d ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{l}</button>
        ))}
      </div>
      <section>
        <h2 className="mb-2 font-display text-xl tracking-wide">Profit (delivered orders)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {card('Orders delivered', r.orders)}
          {card('Pizza sales', rm(r.sales))}
          {card('Paid to supplier', rm(r.cost))}
          {card('Your profit', rm(r.profit - (r.gifts || 0)), r.discounts > 0 || r.cashback > 0 ? `after promo ${rm(r.discounts)} + cashback ${rm(r.cashback || 0)}` : 'sales - supplier cost', 'ring-2 ring-basil/40')}
        </div>
        <p className="mt-2 text-[12px] text-muted">{r.gifts > 0 ? `Welcome gifts & bonuses given: ${rm(r.gifts)} (already taken off profit). ` : ''}Delivery fees {rm(r.fees)} are not in profit{r.riderKeepsFee ? ` (rider keeps COD delivery fees: ${rm(r.riderFees)})` : ''}.</p>
      </section>
      <section>
        <h2 className="mb-2 font-display text-xl tracking-wide">Where the money is</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {card('Transfers received', rm(r.transferIn), `QR / bank${r.walletIn ? ` · + ${rm(r.walletIn)} paid from wallets` : ''}`)}
          {card('COD banked in', rm(r.codReceived), 'rider bank-in confirmed')}
          {card('Bank-in to check', rm(r.codPending), 'rider sent receipt', r.codPending > 0 ? 'ring-2 ring-cheese' : '')}
          {card('Cash with rider', rm(r.codWithRider), 'not banked in yet', r.codWithRider > 0 ? 'ring-2 ring-tomato/40' : '')}
        </div>
      </section>
      <section>
        <h2 className="mb-2 flex items-center gap-2 font-display text-xl tracking-wide"><Landmark className="size-5 text-tomato" /> Rider bank-ins</h2>
        {bi.length === 0 ? (
          <p className="card p-6 text-center text-muted">No bank-ins yet. The rider uploads one from the rider page after delivering COD orders.</p>
        ) : (
          <ul className="space-y-3">
            {bi.map((b) => (
              <li key={b.id} className={`card flex flex-wrap items-center gap-4 p-4 ${b.status === 'pending' ? 'ring-2 ring-cheese' : ''}`}>
                <AdminFile src={`/api/admin/bankin-files/${b.file}`} type={b.type} pin={pin} size="size-20" />
                <div className="min-w-0 flex-1 text-[13.5px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="font-display text-lg tracking-wide">{b.id}</b>
                    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${BI[b.status][1]}`}>{BI[b.status][0]}</span>
                  </div>
                  <div className="text-xl font-extrabold">{rm(b.amount)}</div>
                  <div className="text-muted">{new Date(b.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · orders {b.orders.join(', ')}</div>
                  {b.status === 'rejected' && <div className="text-tomato">Rejected: {b.reason}</div>}
                </div>
                {b.status === 'pending' && (
                  <div className="flex gap-2">
                    <button className="btn bg-basil px-4 py-2 text-[13px] text-white" onClick={() => act(b.id, 'confirm')} disabled={Boolean(busy)}>
                      {busy === b.id ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />} Received
                    </button>
                    <button className="btn btn-ghost px-4 py-2 text-[13px] text-tomato" onClick={() => act(b.id, 'reject')} disabled={Boolean(busy)}><CircleX className="size-4" /> Reject</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {r.byDay.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-xl tracking-wide">By day</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-cream text-left text-muted">
                <tr>{['Day', 'Orders', 'Sales', 'Supplier', 'Profit', 'Delivery fees'].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.byDay.map((d) => (
                  <tr key={d.day}>
                    <td className="px-4 py-2 font-bold">{d.day}</td><td className="px-4 py-2">{d.orders}</td><td className="px-4 py-2">{rm(d.sales)}</td>
                    <td className="px-4 py-2">{rm(d.cost)}</td><td className="px-4 py-2 font-bold text-basil">{rm(d.profit)}</td><td className="px-4 py-2">{rm(d.fees)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-bold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  )
}

function ShopSettings({ pin }) {
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api('/api/admin/settings', { pin }).then(setS).catch((e) => setMsg(e.message))
  }, [pin])
  if (!s) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const d = s.delivery
  const setD = (k, v) => setS({ ...s, delivery: { ...d, [k]: v } })
  const example = (km) => (km > d.maxKm ? 'too far' : rm(Math.ceil((+d.baseFee + Math.max(0, Math.ceil(km - d.baseKm)) * d.perKm) * 2) / 2))
  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      const { menu: _m, adminPin: _p, me: _me, ...body } = s
      let r
      try {
        r = await api('/api/admin/settings', { method: 'PUT', body, pin })
      } catch (e) {
        if (e.status !== 428) throw e
        r = await withTxPin('Save bank / access settings', (tx) => api('/api/admin/settings', { method: 'PUT', body, pin, txPin: tx }), 'Bank details, admin emails, staff PINs or Google ID changed')
        if (!r) return setBusy(false)
      }
      setS({ ...r, me: s.me })
      setMsg('Saved')
    } catch (e) {
      setMsg(e.message)
    }
    setBusy(false)
  }
  return (
    <div className="space-y-5">
      {s.publicUrl && <ShareCard url={s.publicUrl} name={s.shopName} />}
      {!s.shop && <p className="rounded-2xl bg-tomato/10 p-4 font-semibold text-tomato">Set your shop location below first - customers can't order until it's set (the delivery fee needs it).</p>}
      <section className="card space-y-4 p-5">
        <h2 className="font-display text-2xl tracking-wide">Shop</h2>
        <div className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3">
          <div>
            <div className="font-bold">{s.open ? 'Open - taking orders' : 'Closed - no orders'}</div>
            <div className="text-[12.5px] text-muted">Customers can still see the menu when closed.</div>
          </div>
          <button role="switch" aria-checked={s.open} onClick={() => setS({ ...s, open: !s.open })}
            className={`relative h-8 w-14 rounded-full transition ${s.open ? 'bg-basil' : 'bg-ink/25'}`} aria-label="Shop open">
            <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${s.open ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shop name"><input className="field" value={s.shopName} onChange={(e) => setS({ ...s, shopName: e.target.value })} /></Field>
          <Field label="Shop WhatsApp number" hint="Customers get a 'WhatsApp kedai' button. Example 012-3456789">
            <input className="field" value={s.whatsapp} onChange={(e) => setS({ ...s, whatsapp: e.target.value })} inputMode="tel" placeholder="012-3456789" />
          </Field>
        </div>
        <Field label="Shop location (where the rider starts)" hint="Search or tap the map, then drag the pin to your kitchen. Delivery distance is measured from here.">
          <MapPicker value={s.shop} color="#c9732a" height={300} hint="Pin = your kitchen"
            onChange={(p) => setS((x) => ({ ...x, shop: { ...p, label: x.shop?.label || '' } }))} />
        </Field>
      </section>
      <PaymentSettings s={s} setS={setS} pin={pin} />
      <GoogleSettings s={s} setS={setS} />
      <TelegramSettings s={s} setS={setS} pin={pin} />
      <WhatsAppLogin pin={pin} />
      <AiChatSettings s={s} setS={setS} pin={pin} />
      <OpsAiSettings s={s} setS={setS} />
      <section className="card space-y-4 p-5">
        <h2 className="font-display text-2xl tracking-wide">Delivery fee</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Base fee (RM)"><input className="field" type="number" min="0" step="0.5" value={d.baseFee} onChange={(e) => setD('baseFee', e.target.value)} /></Field>
          <Field label="Base fee covers (km)"><input className="field" type="number" min="0" step="0.5" value={d.baseKm} onChange={(e) => setD('baseKm', e.target.value)} /></Field>
          <Field label="Each extra km (RM)"><input className="field" type="number" min="0" step="0.5" value={d.perKm} onChange={(e) => setD('perKm', e.target.value)} /></Field>
          <Field label="Max distance (km)"><input className="field" type="number" min="1" value={d.maxKm} onChange={(e) => setD('maxKm', e.target.value)} /></Field>
          <Field label="Free delivery from (RM)" hint="0 = never free"><input className="field" type="number" min="0" value={d.freeAbove} onChange={(e) => setD('freeAbove', e.target.value)} /></Field>
          <Field label="Minimum order (RM)" hint="0 = no minimum"><input className="field" type="number" min="0" value={s.minOrder} onChange={(e) => setS({ ...s, minOrder: e.target.value })} /></Field>
        </div>
        <p className="rounded-2xl bg-cream px-4 py-3 text-[13px]">
          Examples (road distance): 2 km → <b>{example(2)}</b> · 5 km → <b>{example(5)}</b> · 8 km → <b>{example(8)}</b> · 12 km → <b>{example(12)}</b>
        </p>
      </section>
      <StaffAccess s={s} setS={setS} pin={pin} />
      <div className="sticky bottom-3 flex items-center gap-3">
        <button className="btn btn-red px-6 py-3" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save settings
        </button>
        {msg && <span className={`text-[13px] font-semibold ${msg === 'Saved' ? 'text-basil' : 'text-tomato'}`}>{msg}</span>}
      </div>
      <ChangePin pin={pin} />
    </div>
  )
}

function ShareCard({ url, name }) {
  const [copied, setCopied] = useState(false)
  const text = `Order ${name} 🍕 pizza panas terus ke rumah, bayar tunai bila sampai (COD): ${url}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      prompt('Copy this link', url)
    }
  }
  return (
    <section className="card p-5">
      <h2 className="font-display text-2xl tracking-wide">Customer link (public)</h2>
      <p className="mt-1 text-[13px] text-muted">Anyone with this link can see the menu and order. This seller page is NOT reachable through it.</p>
      {url.includes('ngrok') && (
        <p className="mt-2 rounded-xl bg-cheese/25 px-3 py-2 text-[12.5px]">
          Free ngrok link: customers first see an ngrok page saying "You are about to visit…". Tell them to tap <b>Visit Site</b> - after that the shop opens.
        </p>
      )}
      <div className="mt-3 break-all rounded-2xl bg-cream px-4 py-3 font-mono text-[13px]">{url}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-ghost px-4 py-2 text-[13px]" onClick={copy}><Copy className="size-4" /> {copied ? 'Copied' : 'Copy link'}</button>
        <a className="btn bg-[#25d366] px-4 py-2 text-[13px] text-white" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          <MessageCircle className="size-4" /> Share on WhatsApp
        </a>
        <a className="btn btn-ghost px-4 py-2 text-[13px]" href={url} target="_blank" rel="noreferrer"><Share2 className="size-4" /> Open</a>
      </div>
    </section>
  )
}

function PaymentSettings({ s, setS, pin }) {
  const p = s.payment || {}
  const setP = (k, v) => setS({ ...s, payment: { ...p, [k]: v } })
  const file = useRef(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const uploadQr = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    setMsg('')
    try {
      const j = await withTxPin('Change payment QR', async (tx) => {
        const r = await fetch('/api/admin/payment-qr', { method: 'POST', headers: { ...adminHeaders(pin), 'x-admin-txpin': tx, 'Content-Type': f.type || 'application/octet-stream' }, body: f })
        const out = await r.json().catch(() => ({}))
        if (!r.ok) throw Object.assign(new Error(out.error || 'Upload failed'), { status: r.status })
        return out
      })
      if (!j) return setBusy(false)
      setS((x) => ({ ...x, payment: { ...x.payment, qr: j.payment.qr, qrAt: j.payment.qrAt } }))
      setMsg('QR saved')
    } catch (e2) {
      setMsg(e2.message)
    }
    setBusy(false)
  }
  const removeQr = async () => {
    if (!confirm('Remove the payment QR?')) return
    const j = await withTxPin('Remove payment QR', (tx) => api('/api/admin/payment-qr', { method: 'DELETE', pin, txPin: tx }))
    if (!j) return
    setS((x) => ({ ...x, payment: { ...x.payment, qr: j.payment.qr } }))
  }
  const Toggle = ({ on, onClick, label }) => (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} aria-label={label}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-basil' : 'bg-ink/25'}`}>
      <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
  const transferReady = Boolean(p.qr || p.accountNumber)
  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-display text-2xl tracking-wide">Payment</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3">
          <Banknote className="size-5 text-crust" />
          <div className="flex-1"><div className="font-bold">Cash on delivery (COD)</div><div className="text-[12px] text-muted">Rider collects cash at the door</div></div>
          <Toggle on={p.cod} onClick={() => setP('cod', !p.cod)} label="Cash on delivery" />
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3">
          <QrCode className="size-5 text-tomato" />
          <div className="flex-1"><div className="font-bold">Bank transfer / DuitNow QR</div><div className="text-[12px] text-muted">Customer pays first, uploads the receipt</div></div>
          <Toggle on={p.transfer} onClick={() => setP('transfer', !p.transfer)} label="Bank transfer" />
        </div>
      </div>
      {p.transfer && !transferReady && <p className="rounded-xl bg-tomato/10 px-3 py-2 text-[13px] font-semibold text-tomato">Add your QR or bank account below - customers only see transfer once one of them is set.</p>}
      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="grid size-44 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-white">
            {p.qr ? <img src={`/api/payment-qr?v=${encodeURIComponent(p.qrAt || '')}`} alt="Payment QR" className="size-full object-contain" /> : <QrCode className="size-12 text-line" />}
          </div>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={uploadQr} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => file.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />} {p.qr ? 'Change QR' : 'Upload QR'}
            </button>
            {p.qr && <button type="button" className="btn btn-ghost px-3 py-1.5 text-[12.5px] text-tomato" onClick={removeQr} aria-label="Remove QR"><Trash2 className="size-3.5" /></button>}
          </div>
          {msg && <span className="text-[12px] text-muted">{msg}</span>}
          <span className="max-w-44 text-center text-[11.5px] text-muted">Screenshot of your DuitNow / bank QR (saves straight away)</span>
        </div>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <Field label="Bank"><input className="field" value={p.bankName || ''} onChange={(e) => setP('bankName', e.target.value)} placeholder="Maybank / CIMB / Bank Islam…" /></Field>
          <Field label="Account holder name"><input className="field" value={p.accountName || ''} onChange={(e) => setP('accountName', e.target.value)} placeholder="Name on the account" /></Field>
          <Field label="Account number"><input className="field" value={p.accountNumber || ''} onChange={(e) => setP('accountNumber', e.target.value)} inputMode="numeric" placeholder="1234 5678 9012" /></Field>
          <Field label="Note for customers (optional)"><input className="field" value={p.note || ''} onChange={(e) => setP('note', e.target.value)} placeholder="e.g. Transfer before 9pm" /></Field>
        </div>
      </div>
      <p className="text-[12px] text-muted">Bank details and the on/off switches save with the <b>Save settings</b> button below.</p>
    </section>
  )
}

function KitchenPayee({ s, setS, pin }) {
  const st = s.staff || {}
  const file = useRef(null)
  const [msg, setMsg] = useState('')
  const [v, setV] = useState(0)
  const setRaw = (k, val) => setS({ ...s, staff: { ...st, [k]: val } })
  const upload = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setMsg('')
    try {
      const j = await withTxPin('Change kitchen payment QR', async (tx) => {
        const r = await fetch('/api/admin/kitchen-qr', { method: 'POST', headers: { ...adminHeaders(pin), 'x-admin-txpin': tx, 'Content-Type': f.type || 'application/octet-stream' }, body: f })
        const out = await r.json().catch(() => ({}))
        if (!r.ok) throw Object.assign(new Error(out.error || 'Upload failed'), { status: r.status })
        return out
      })
      if (j) (setS((x) => ({ ...x, staff: { ...x.staff, kitchenQr: j.staff.kitchenQr } })), setV((n) => n + 1), setMsg('QR saved'))
    } catch (e2) {
      setMsg(e2.message)
    }
  }
  return (
    <div className="mt-3 rounded-2xl bg-cream p-4">
      <div className="text-[13px] font-bold">How you pay the kitchen (private - only you see this)</div>
      <div className="mt-3 grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          {st.kitchenQr ? <AdminFile key={v} src={`/api/admin/kitchen-qr?v=${v}`} type="jpg" pin={pin} size="size-32" /> : <div className="grid size-32 place-items-center rounded-xl border-2 border-dashed border-line bg-white"><QrCode className="size-10 text-line" /></div>}
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={upload} />
          <button type="button" className="btn btn-ghost px-3 py-1.5 text-[12px]" onClick={() => file.current?.click()}><FileUp className="size-3.5" /> {st.kitchenQr ? 'Change QR' : 'Upload QR'}</button>
          {msg && <span className="text-[11.5px] text-muted">{msg}</span>}
        </div>
        <div className="grid content-start gap-3 sm:grid-cols-3">
          <Field label="Bank"><input className="field" value={st.kitchenBank || ''} onChange={(e) => setRaw('kitchenBank', e.target.value)} placeholder="CIMB" /></Field>
          <Field label="Account holder"><input className="field" value={st.kitchenAccountName || ''} onChange={(e) => setRaw('kitchenAccountName', e.target.value)} /></Field>
          <Field label="Account no. (optional)"><input className="field" value={st.kitchenAccountNumber || ''} onChange={(e) => setRaw('kitchenAccountNumber', e.target.value)} inputMode="numeric" /></Field>
        </div>
      </div>
    </div>
  )
}

function StaffAccess({ s, setS, pin }) {
  const st = s.staff || { kitchenPin: '', riderPin: '' }
  const base = s.publicUrl || location.origin
  const set = (k, v) => setS({ ...s, staff: { ...st, [k]: v.replace(/\D/g, '').slice(0, 8) } })
  const setRaw = (k, v) => setS({ ...s, staff: { ...st, [k]: v } })
  const rows = [
    { k: 'kitchenPin', role: 'kitchen', title: 'Kitchen (supplier)', path: 'dapur', Icon: ChefHat, what: 'Sees orders after you mark "Supplier paid", taps Baking -> Ready.' },
    { k: 'riderPin', role: 'rider', title: 'Rider', path: 'rider', Icon: Bike, what: 'Sees Ready orders with name, phone, map pin and cash to collect, taps On the way -> Delivered.' },
  ]
  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-display text-2xl tracking-wide">Staff pages</h2>
      <p className="text-[13px] text-muted">Give each person their link + PIN. They work on any phone (public link) but only show what that job needs - no sales, no admin. Empty PIN = page switched off.</p>
      {rows.map((r) => {
        const url = `${base}/#/${r.path}`
        const pinV = st[r.k] || ''
        const msg = `Pizzadonia - halaman ${r.path === 'dapur' ? 'Dapur' : 'Rider'}: ${url}\nPIN: ${pinV}`
        const phone = String(st[r.role + 'Phone'] || '').replace(/\D/g, '').replace(/^0/, '60')
        return (
          <div key={r.k} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center gap-2 font-bold"><r.Icon className="size-4 text-tomato" /> {r.title}</div>
            <p className="mt-0.5 text-[12.5px] text-muted">{r.what}</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Name">
                <input className="field w-44" value={st[r.role + 'Name'] || ''} onChange={(e) => setRaw(r.role + 'Name', e.target.value)} placeholder={r.role === 'kitchen' ? 'Supplier name' : 'Rider name'} maxLength={40} />
              </Field>
              <Field label="WhatsApp">
                <input className="field w-44" value={st[r.role + 'Phone'] || ''} onChange={(e) => setRaw(r.role + 'Phone', e.target.value)} placeholder="012-345 6789" inputMode="tel" maxLength={16} />
              </Field>
              <Field label="PIN (4-8 digits)">
                <input className="field w-32 tracking-[0.3em]" value={pinV} onChange={(e) => set(r.k, e.target.value)} inputMode="numeric" placeholder="off" />
              </Field>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[13px] font-bold">Link</div>
                <div className="truncate rounded-xl bg-cream px-3 py-2.5 font-mono text-[12.5px]">{url}</div>
              </div>
              {pinV.length >= 4 && (
                <a className="btn bg-[#25d366] px-4 py-2.5 text-[13px] text-white" target="_blank" rel="noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`}>
                  <MessageCircle className="size-4" /> Send
                </a>
              )}
            </div>
            {r.role === 'kitchen' && <KitchenPayee s={s} setS={setS} pin={pin} />}
          </div>
        )
      })}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-cream px-4 py-3">
        <input type="checkbox" className="mt-0.5 size-5 accent-[#e23d2d]" checked={s.riderKeepsFee !== false} onChange={(e) => setS({ ...s, riderKeepsFee: e.target.checked })} />
        <span><span className="block text-[14px] font-bold">Rider keeps the delivery fee (COD)</span>
          <span className="block text-[12.5px] text-muted">On: rider banks in only the pizza money. Off: rider banks in the full amount collected.</span></span>
      </label>
      <p className="text-[12px] text-muted">PINs save with the <b>Save settings</b> button below. Use different PINs from your own admin PIN.</p>
    </section>
  )
}

function ChangePin({ pin }) {
  const [p, setP] = useState('')
  const [msg, setMsg] = useState('')
  const save = async () => {
    try {
      const r = await withTxPin('Change your PIN', (tx) => api('/api/admin/settings', { method: 'PUT', body: { adminPin: p }, pin: pin.startsWith('g:') ? pin : tx, txPin: tx }), 'Enter your CURRENT PIN')
      if (!r) return
      try {
        sessionStorage.setItem(pinKey, p)
      } catch {
        /* ignore */
      }
      setMsg('PIN changed - reloading')
      setTimeout(() => location.reload(), 800)
    } catch (e) {
      setMsg(e.message)
    }
  }
  return (
    <section className="card flex flex-wrap items-end gap-3 p-5">
      <Field label="New admin PIN (4-8 digits)">
        <input className="field w-48" value={p} onChange={(e) => setP(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={8} />
      </Field>
      <button className="btn btn-ghost px-5 py-2.5" disabled={p.length < 4} onClick={save}>Change PIN</button>
      {msg && <span className="text-[13px] text-muted">{msg}</span>}
    </section>
  )
}

// photo upload for one product (shrunk on the phone first)
async function uploadPhoto(pin, id, file) {
  const body = await shrink(file)
  const r = await fetch(`/api/admin/menu/${id}/photo`, { method: 'POST', headers: { ...adminHeaders(pin), 'Content-Type': body.type || 'application/octet-stream' }, body })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Photo upload failed')
  return j
}

const EMPTY = { name: '', desc: '', price: '', cost: '', tag: '', sizes: [] }

function ProductForm({ initial = EMPTY, photoUrl, onSave, onCancel, saveLabel, busy }) {
  const [f, setF] = useState({ ...EMPTY, ...initial })
  const [photo, setPhoto] = useState(null) // { file, url } picked but not uploaded yet
  const pick = useRef(null)
  const set = (k, v) => setF({ ...f, [k]: v })
  const profit = +f.price - (+f.cost || 0)
  const sizes = f.sizes || []
  const setSize = (i, k, v) => set('sizes', sizes.map((z, j) => (j === i ? { ...z, [k]: v } : z)))
  const sizesOk = sizes.every((z) => String(z.label).trim() && +z.price > 0)
  const ok = f.name.trim().length >= 2 && (sizes.length ? sizesOk : +f.price > 0)
  return (
    <form className="grid gap-4 md:grid-cols-[auto_1fr]" onSubmit={(e) => (e.preventDefault(), ok && onSave(f, photo?.file))}>
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => pick.current?.click()} className="group relative size-36 overflow-hidden rounded-2xl border-2 border-dashed border-line bg-white" aria-label="Choose photo">
          {photo || photoUrl ? <img src={photo?.url || photoUrl} alt="" className="size-full object-cover" /> : <Camera className="mx-auto size-10 text-line" />}
          <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-1 text-[11.5px] font-bold text-white opacity-90">{photo || photoUrl ? 'Change photo' : 'Add photo'}</span>
        </button>
        <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) setPhoto({ file: x, url: URL.createObjectURL(x) }) }} />
      </div>
      <div className="grid content-start gap-3 sm:grid-cols-2">
        <Field label="Product name"><input className="field" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={40} placeholder="e.g. Pepperoni" /></Field>
        <Field label="Label (optional)" hint="e.g. Baru! / Paling laris / Premium"><input className="field" value={f.tag} onChange={(e) => set('tag', e.target.value)} maxLength={30} /></Field>
        <div className="sm:col-span-2">
          <Field label="Description (customers see this)"><textarea className="field min-h-16" value={f.desc} onChange={(e) => set('desc', e.target.value)} maxLength={200} placeholder="Toppings, size…" /></Field>
        </div>
        {sizes.length === 0 ? (
          <>
            <Field label="Sell price (RM)"><input className="field" type="number" min="0" step="0.1" value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
            <Field label="Supplier cost (RM)" hint={+f.price > 0 ? `Your profit per item: ${rm(profit)}` : 'What you pay the supplier'}>
              <input className="field" type="number" min="0" step="0.1" value={f.cost} onChange={(e) => set('cost', e.target.value)} />
            </Field>
          </>
        ) : (
          <div className="space-y-2 sm:col-span-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[12px] font-bold text-muted"><span>Size</span><span>Sell (RM)</span><span>Supplier cost (RM)</span><span /></div>
            {sizes.map((z, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                <input className="field py-2" value={z.label} onChange={(e) => setSize(i, 'label', e.target.value)} placeholder="8 inci" maxLength={20} />
                <input className="field py-2" type="number" min="0" step="0.1" value={z.price} onChange={(e) => setSize(i, 'price', e.target.value)} />
                <input className="field py-2" type="number" min="0" step="0.1" value={z.cost} onChange={(e) => setSize(i, 'cost', e.target.value)} />
                <button type="button" className="grid size-9 place-items-center rounded-full text-tomato hover:bg-tomato/10" onClick={() => set('sizes', sizes.filter((_, j) => j !== i))} aria-label="Remove size"><Trash2 className="size-4" /></button>
                {+z.price > 0 && <span className="col-span-4 -mt-1 text-[11.5px] text-basil">profit {rm(+z.price - (+z.cost || 0))}</span>}
              </div>
            ))}
          </div>
        )}
        <div className="sm:col-span-2">
          <button type="button" className="btn btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => set('sizes', [...(sizes.length ? sizes : [{ label: '8 inci', price: f.price, cost: f.cost }]), { label: '', price: '', cost: '' }])}>
            <Plus className="size-3.5" /> {sizes.length ? 'Add another size' : 'Add sizes (e.g. 8 inci / 10 inci)'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button className="btn btn-red px-5 py-2.5 text-[13.5px]" disabled={!ok || busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {saveLabel}</button>
          {onCancel && <button type="button" className="btn btn-ghost px-5 py-2.5 text-[13.5px]" onClick={onCancel}>Cancel</button>}
        </div>
      </div>
    </form>
  )
}

function MenuAdmin({ pin }) {
  const [menu, setMenu] = useState(null)
  const [editing, setEditing] = useState('') // product id or 'new'
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    api('/api/admin/settings', { pin }).then((s) => setMenu(s.menu)).catch((e) => setMsg(e.message))
  }, [pin])
  const run = async (key, fn, done) => {
    setBusy(key)
    setMsg('')
    try {
      const r = await fn()
      if (r?.menu) setMenu(r.menu)
      if (done) setMsg(done)
    } catch (e) {
      setMsg(e.message)
    }
    setBusy('')
  }
  const update = (id, body, done) => run(id, () => api(`/api/admin/menu/${id}`, { method: 'PUT', body, pin }), done)
  const add = (f, file) => run('new', async () => {
    let r = await api('/api/admin/menu', { method: 'POST', body: f, pin })
    if (file) r = await uploadPhoto(pin, r.item.id, file)
    setEditing('')
    return r
  }, `${f.name} added to the menu`)
  const saveEdit = (m, f, file) => run(m.id, async () => {
    const sizes = (f.sizes || []).map((z) => ({ label: String(z.label).trim(), price: +z.price, cost: +z.cost || 0 }))
    let r = await api(`/api/admin/menu/${m.id}`, { method: 'PUT', body: { name: f.name, desc: f.desc, tag: f.tag, sizes, ...(sizes.length ? {} : { price: +f.price, cost: +f.cost || 0 }) }, pin })
    if (file) r = await uploadPhoto(pin, m.id, file)
    setEditing('')
    return r
  }, `${f.name} saved`)
  const remove = (m) => confirm(`Delete ${m.name} from the menu? Old orders keep it. (To hide it for today only, use "Sold out" instead.)`) &&
    run(m.id, () => api(`/api/admin/menu/${m.id}`, { method: 'DELETE', pin }), `${m.name} deleted`)

  if (!menu) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[13px] text-muted">{menu.length} products. Changes show on the shop straight away. Cost = what you pay the supplier.</p>
        {editing !== 'new' && <button className="btn btn-red px-5 py-2.5 text-[13.5px]" onClick={() => setEditing('new')}><Plus className="size-4" /> Add product</button>}
      </div>
      {msg && <p className="rounded-xl bg-cream px-3 py-2 text-[13px] font-semibold">{msg}</p>}
      {editing === 'new' && (
        <section className="card p-5 ring-2 ring-tomato/40">
          <h2 className="mb-3 font-display text-xl tracking-wide">New product</h2>
          <ProductForm saveLabel="Add to menu" busy={busy === 'new'} onSave={add} onCancel={() => setEditing('')} />
        </section>
      )}
      <ul className="space-y-3">
        {menu.map((m, i) => (
          <li key={m.id} className={`card p-4 ${m.available ? '' : 'opacity-75'}`}>
            {editing === m.id ? (
              <ProductForm initial={{ name: m.name, desc: m.desc, tag: m.tag || '', price: m.price, cost: m.cost ?? 0, sizes: (m.sizes || []).map((z) => ({ label: z.label, price: z.price, cost: z.cost })) }} photoUrl={m.img} saveLabel="Save changes"
                busy={busy === m.id} onSave={(f, file) => saveEdit(m, f, file)} onCancel={() => setEditing('')} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col">
                  <button className="grid size-7 place-items-center rounded-lg text-muted hover:bg-cream disabled:opacity-30" disabled={i === 0 || !!busy} onClick={() => update(m.id, { move: -1 })} aria-label={`Move ${m.name} up`}>▲</button>
                  <button className="grid size-7 place-items-center rounded-lg text-muted hover:bg-cream disabled:opacity-30" disabled={i === menu.length - 1 || !!busy} onClick={() => update(m.id, { move: 1 })} aria-label={`Move ${m.name} down`}>▼</button>
                </div>
                <img src={m.img} alt="" className={`size-16 rounded-xl object-cover ${m.available ? '' : 'grayscale'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[15px]">{m.name}</b>
                    {m.tag && <span className="rounded-full bg-cheese px-2 py-0.5 text-[11px] font-bold">{m.tag}</span>}
                    {m.pendingPrice && <span className="rounded-full bg-tomato px-2 py-0.5 text-[11px] font-bold text-white">⚠ Needs your selling price - hidden from customers</span>}
                    {m.addedBy === 'kitchen' && <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-muted">added by kitchen</span>}
                    {m.costChangedAt && Date.now() - new Date(m.costChangedAt) < 7 * 864e5 && <span className="rounded-full bg-crust/15 px-2 py-0.5 text-[11px] font-bold text-crust">modal changed by kitchen {new Date(m.costChangedAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="line-clamp-2 text-[12.5px] text-muted">{m.desc || 'No description'}</div>
                </div>
                <div className="text-right text-[12.5px]">
                  {m.sizes?.length ? m.sizes.map((z) => (
                    <div key={z.id}>{z.price > 0 ? <b className="text-tomato">{z.label} sell {rm(z.price)}</b> : <b className="text-tomato">{z.label}: set price!</b>} <span className="text-muted">modal {rm(z.cost)}{z.price > 0 && <> · <b className={z.price - z.cost > 0 ? 'text-basil' : 'text-tomato'}>{z.price - z.cost >= 0 ? '+' : ''}{rm(z.price - z.cost)}</b></>}</span></div>
                  )) : (
                    <>
                      <div className="text-[15px] font-extrabold text-tomato">{rm(m.price)}</div>
                      <div className="text-muted">cost {rm(m.cost ?? 0)} · <b className="text-basil">+{rm(m.price - (m.cost || 0))}</b></div>
                    </>
                  )}
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <button role="switch" aria-checked={m.available} disabled={!!busy} onClick={() => update(m.id, { available: !m.available })}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${m.available ? 'bg-basil/10 text-basil' : 'bg-tomato/10 text-tomato'}`}>
                    {m.available ? 'Available' : 'Sold out'}
                  </button>
                  <button className="btn btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => setEditing(m.id)} disabled={!!busy}><Pencil className="size-3.5" /> Edit</button>
                  <button className="btn btn-ghost px-3 py-1.5 text-[12.5px] text-tomato" onClick={() => remove(m)} disabled={!!busy} aria-label={`Delete ${m.name}`}><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Admin() {
  const [pin, setPin] = useState(getPin)
  const [tab, setTab] = useState('orders')
  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(pinKey)
    } catch {
      /* ignore */
    }
    if (ownerSession.get()) {
      api('/api/admin/logout', { method: 'POST', body: {}, pin: 'g:' + ownerSession.get() }).catch(() => {})
      ownerSession.set(null)
    }
    setPin('')
  }, [])
  const supportBadge = useSupportBadge(pin)
  const [tgStatus] = useTelegramStatus(pin)
  const openTelegram = () => {
    setTab('settings')
    // the settings tab loads first, then the card is there to scroll to
    const go = (n) => { const el = document.getElementById('telegram'); if (el) el.scrollIntoView({ behavior: 'smooth' }); else if (n) setTimeout(() => go(n - 1), 150) }
    go(20)
  }
  if (!pin) return <Login onOk={setPin} />
  const TABS = [['orders', 'Orders', ClipboardList], ['account', 'Business account', PiggyBank], ['support', supportBadge ? `Support (${supportBadge})` : 'Support', Headset], ['customers', 'Customers', Users], ['money', 'Money', Landmark], ['wallets', 'Wallets & promo', Wallet], ['menu', 'Menu', UtensilsCrossed], ['settings', 'Shop & fees', Settings]]
  return (
    <div className="min-h-dvh pb-16">
      <header className="safe-top sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Logo small />
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">Seller</span>
          <div className="ml-auto"><TelegramChip st={tgStatus} onOpen={openTelegram} /></div>
          <button onClick={logout} className="btn btn-ghost px-3 py-1.5 text-[12.5px]"><LogOut className="size-3.5" /> Log out</button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map(([id, l, I]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold ${tab === id ? 'bg-tomato text-white' : 'hover:bg-white'}`}>
              <I className="size-4" /> {l}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-5">
        {tab === 'orders' && <Orders pin={pin} onAuthFail={logout} />}
        {tab === 'money' && <Money pin={pin} />}
        {tab === 'wallets' && <Wallets pin={pin} />}
        {tab === 'customers' && <Customers pin={pin} />}
        {tab === 'support' && <Support pin={pin} />}
        {tab === 'account' && <BusinessAccount pin={pin} />}
        {tab === 'menu' && <MenuAdmin pin={pin} />}
        {tab === 'settings' && <ShopSettings pin={pin} />}
      </main>
    </div>
  )
}
