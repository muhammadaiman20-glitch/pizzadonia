import { useCallback, useEffect, useRef, useState } from 'react'
import { Banknote, Bike, Camera, Plus, ChefHat, CircleCheck, Clock, FileUp, Landmark, Loader2, Lock, LogOut, MapPin, MessageCircle, Navigation, PackageCheck, Phone, RefreshCw, X } from 'lucide-react'
import { shrink } from '../components/PaymentPanel.jsx'
import { BankForm, TxList } from './Wallet.jsx'
import { withTxPin } from '../components/PinPrompt.jsx'
import Logo from '../components/Logo.jsx'
import OrderMap from '../components/OrderMap.jsx'
import { rm, useAutoSubmit, waLink } from '../lib.js'

// One page, two jobs. role = 'kitchen' (the pizza supplier) or 'rider'. Each logs in with its own PIN.
const ROLE = {
  kitchen: {
    title: 'Dapur', Icon: ChefHat, path: 'dapur',
    intro: 'Pesanan muncul di sini selepas Pizzadonia buat bayaran kepada anda.',
    empty: 'Tiada pesanan untuk dibuat sekarang.',
    status: { supplier_paid: 'Sudah dibayar - belum mula', preparing: 'Sedang dibakar', ready: 'Siap - tunggu rider' },
    action: {
      supplier_paid: { to: 'preparing', label: 'Mula bakar', Icon: ChefHat },
      preparing: { to: 'ready', label: 'Pizza siap', Icon: PackageCheck },
    },
  },
  rider: {
    title: 'Rider', Icon: Bike, path: 'rider',
    intro: 'Pesanan yang siap di dapur muncul di sini. Kemas kini status supaya pelanggan tahu.',
    empty: 'Tiada penghantaran sekarang.',
    status: { ready: 'Siap - sedia diambil', delivering: 'Dalam perjalanan' },
    action: {
      ready: { to: 'delivering', label: 'Sudah ambil - mula hantar', Icon: Bike },
      delivering: { to: 'done', label: 'Sudah sampai - ambil gambar', Icon: Camera },
    },
  },
}
const keyOf = (role) => `pz.staff.${role}`
const readPin = (role) => {
  try {
    return localStorage.getItem(keyOf(role)) || ''
  } catch {
    return ''
  }
}
const writePin = (role, v) => {
  try {
    if (v) localStorage.setItem(keyOf(role), v)
    else localStorage.removeItem(keyOf(role))
  } catch {
    /* remembered only until refresh */
  }
}

async function call(role, pin, path = '', body, method) {
  const r = await fetch(`/api/staff/${role}${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'x-staff-pin': pin, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error || `Ralat ${r.status}`), { status: r.status })
  return j
}

async function upload(role, pin, path, file) {
  const body = await shrink(file)
  const r = await fetch(`/api/staff/${role}${path}`, {
    method: 'POST', headers: { 'x-staff-pin': pin, 'Content-Type': body.type || 'application/octet-stream' }, body,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error || `Ralat ${r.status}`), { status: r.status })
  return j
}

function beep() {
  try {
    const ctx = new AudioContext()
    ;[988, 1319].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.18)
      o.stop(ctx.currentTime + i * 0.18 + 0.32)
    })
  } catch {
    /* optional */
  }
}

function Login({ role, onOk }) {
  const R = ROLE[role]
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await call(role, pin)
      writePin(role, pin)
      onOk(pin)
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }
  useAutoSubmit(pin, pin.length >= 4, submit)
  return (
    <div className="dots grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7 text-center">
        <div className="flex justify-center"><Logo /></div>
        <span className="mx-auto mt-5 grid size-14 place-items-center rounded-2xl bg-cheese"><R.Icon className="size-7" /></span>
        <h1 className="mt-3 font-display text-3xl tracking-wide">Halaman {R.title}</h1>
        <p className="mt-1 text-[13px] text-muted">Masukkan PIN yang diberi oleh Pizzadonia.</p>
        <input className="field mt-5 text-center text-2xl tracking-[0.4em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric" type="password" autoFocus maxLength={8} placeholder="••••" aria-label="PIN" />
        {err && <p className="mt-2 text-[13px] font-semibold text-tomato">{err}</p>}
        <button className="btn btn-red mt-4 w-full py-3" disabled={pin.length < 4 || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Masuk
        </button>
      </form>
    </div>
  )
}

function OrderCard({ o, role, pin, onDone }) {
  const R = ROLE[role]
  const act = R.action[o.status]
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [map, setMap] = useState(false)
  const cam = useRef(null)
  const [photo, setPhoto] = useState(null) // { file, url } before sending
  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setPhoto({ file: f, url: URL.createObjectURL(f) })
  }
  const deliver = async () => {
    if (o.collect > 0 && !confirm(`Sudah terima tunai ${rm(o.collect)} daripada ${o.customerName}?`)) return
    setBusy(true)
    setErr('')
    try {
      await upload(role, pin, `/orders/${o.id}/deliver`, photo.file)
      URL.revokeObjectURL(photo.url)
      setPhoto(null)
      onDone()
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const go = async () => {
    if (role === 'rider' && act.to === 'done') return cam.current?.click()
    setBusy(true)
    setErr('')
    try {
      await call(role, pin, `/orders/${o.id}`, { status: act.to })
      onDone()
    } catch (e) {
      setErr(e.message)
      onDone()
    }
    setBusy(false)
  }
  const mins = Math.round((Date.now() - new Date(o.createdAt)) / 60000)
  return (
    <article className={`card overflow-hidden ${o.status === (role === 'kitchen' ? 'supplier_paid' : 'ready') ? 'ring-2 ring-tomato' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-cream/60 px-4 py-3">
        <span className="font-display text-2xl tracking-wide">{o.id}</span>
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-bold text-white">{R.status[o.status] || o.status}</span>
        <span className="ml-auto text-[12.5px] text-muted">{mins < 60 ? `${mins} min lalu` : `${Math.floor(mins / 60)} jam lalu`}</span>
      </div>
      <div className="space-y-3 p-4">
        <ul className="space-y-1">
          {o.items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 text-[16px]">
              <span className="grid min-w-9 place-items-center rounded-xl bg-tomato px-2 py-1 font-display text-lg text-white">{it.qty}×</span>
              <span className="font-bold">{it.name}</span>
            </li>
          ))}
        </ul>
        {o.note && <p className="rounded-xl bg-cheese/30 px-3 py-2 text-[14px]"><b>Nota pelanggan:</b> {o.note}</p>}

        {role === 'kitchen' && (
          <p className="flex items-center gap-2 rounded-xl bg-basil/10 px-3 py-2 text-[13.5px] font-semibold text-basil">
            <Banknote className="size-4" /> Pizzadonia sudah bayar {rm(o.supplierCost)} untuk pesanan ini
          </p>
        )}

        {role === 'rider' && (
          <>
            <div className="rounded-2xl border border-line bg-white p-3 text-[14px]">
              <div className="text-[17px] font-extrabold">{o.customerName}</div>
              <p className="mt-1 flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-tomato" /> {o.location.address}</p>
              {o.location.notes && <p className="mt-1 pl-6 text-[13px] text-muted">Panduan: {o.location.notes}</p>}
              <p className="mt-1 pl-6 text-[12.5px] text-muted">{o.km} km dari kedai</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <a className="btn btn-ghost py-2 text-[13px]" href={`tel:+${o.phone}`}><Phone className="size-4" /> Call</a>
                <a className="btn btn-ghost py-2 text-[13px]" target="_blank" rel="noreferrer" href={waLink(o.phone, `Salam ${o.customerName}, saya rider Pizzadonia untuk pesanan ${o.id}. `)}><MessageCircle className="size-4 text-[#25d366]" /> WhatsApp</a>
                <a className="btn btn-ghost py-2 text-[13px]" target="_blank" rel="noreferrer" href={`https://waze.com/ul?ll=${o.location.lat},${o.location.lng}&navigate=yes`}><Navigation className="size-4 text-[#33ccff]" /> Waze</a>
                <a className="btn btn-ghost py-2 text-[13px]" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${o.location.lat},${o.location.lng}`}><MapPin className="size-4 text-tomato" /> Maps</a>
              </div>
              <button className="mt-2 text-[12.5px] font-bold text-tomato underline" onClick={() => setMap((v) => !v)}>{map ? 'Tutup peta' : 'Lihat pin pada peta'}</button>
              {map && <div className="mt-2"><OrderMap points={[{ lat: o.location.lat, lng: o.location.lng, label: o.customerName, sub: o.id }]} height={220} /></div>}
            </div>
            {o.collect > 0 ? (
              <div className="flex items-center gap-3 rounded-2xl bg-cheese/40 p-3">
                <Banknote className="size-7 text-crust" />
                <div>
                  <div className="text-[12.5px] font-bold text-muted">KUTIP TUNAI (COD)</div>
                  <div className="font-display text-3xl tracking-wide">{rm(o.collect)}</div>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-2xl bg-basil/10 p-3 text-[14px] font-bold text-basil">
                <CircleCheck className="size-5" /> Sudah dibayar - JANGAN kutip wang
              </p>
            )}
          </>
        )}

        {err && <p className="text-[13px] font-semibold text-tomato">{err}</p>}
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        {photo && (
          <div className="rounded-2xl border-2 border-basil bg-basil/5 p-3">
            <div className="relative">
              <img src={photo.url} alt="Gambar pizza diterima" className="max-h-72 w-full rounded-xl object-cover" />
              <button onClick={() => (URL.revokeObjectURL(photo.url), setPhoto(null))} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-ink/70 text-white" aria-label="Buang gambar"><X className="size-4" /></button>
            </div>
            <p className="mt-2 text-[12.5px] text-muted">Pastikan pizza dan pelanggan / pintu rumah jelas dalam gambar.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="btn btn-ghost py-3 text-[14px]" onClick={() => cam.current?.click()} disabled={busy}><Camera className="size-4" /> Ambil semula</button>
              <button className="btn bg-basil py-3 text-[14px] text-white" onClick={deliver} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />} Hantar & selesai
              </button>
            </div>
          </div>
        )}
        {act && !photo ? (
          <button className="btn btn-red w-full py-4 text-[16px]" onClick={go} disabled={busy}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <act.Icon className="size-5" />} {act.label}
          </button>
        ) : !photo ? (
          <p className="text-center text-[13px] text-muted">{role === 'kitchen' ? 'Menunggu rider ambil.' : ''}</p>
        ) : null}
      </div>
    </article>
  )
}

/** Staff change their own PIN. While it is still 0000 a red reminder stays at the top. */
function ChangeOwnPin({ role, pin, isDefault, onChanged }) {
  const [open, setOpen] = useState(false)
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
      await call(role, pin, '/pin', { pin: p1 })
      onChanged(p1)
      setOpen(false)
      setP1('')
      setP2('')
      setMsg('PIN ditukar')
    } catch (e2) {
      setMsg(e2.message)
    }
    setBusy(false)
  }
  return (
    <div className={`mt-3 rounded-2xl px-4 py-3 text-[13.5px] ${isDefault ? 'bg-tomato/10' : 'bg-white ring-1 ring-line'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Lock className={`size-4 ${isDefault ? 'text-tomato' : 'text-muted'}`} />
        <span className={isDefault ? 'font-bold text-tomato' : 'text-muted'}>
          {isDefault ? 'Anda masih guna PIN 0000. Tukar PIN sekarang supaya orang lain tidak boleh masuk.' : msg || 'PIN anda'}
        </span>
        <button className="btn btn-ghost ml-auto px-3 py-1 text-[12.5px]" onClick={() => setOpen((v) => !v)}>{open ? 'Tutup' : 'Tukar PIN'}</button>
      </div>
      {open && (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
          <input className="field w-36 tracking-[0.3em]" type="password" inputMode="numeric" maxLength={8} placeholder="PIN baru" value={p1} onChange={(e) => setP1(e.target.value.replace(/\D/g, ''))} />
          <input className="field w-36 tracking-[0.3em]" type="password" inputMode="numeric" maxLength={8} placeholder="Ulang PIN" value={p2} onChange={(e) => setP2(e.target.value.replace(/\D/g, ''))} />
          <button className="btn btn-red px-4 py-2.5 text-[13px]" disabled={p1.length < 4 || busy}>{busy && <Loader2 className="size-4 animate-spin" />} Simpan</button>
          {msg && <span className="w-full text-[12.5px] text-tomato">{msg}</span>}
        </form>
      )}
    </div>
  )
}

function RiderWallet({ w, pin, onDone }) {
  const [open, setOpen] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const post = async (body) => {
    setBusy(true)
    setErr('')
    try {
      await call('rider', pin, '/wallet', body)
      setOpen('')
      setAmount('')
      onDone()
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex items-center gap-3 bg-gradient-to-br from-basil to-[#1f5a38] px-4 py-3 text-white">
        <Banknote className="size-5" />
        <div className="flex-1">
          <div className="text-[12px] font-bold uppercase tracking-wider text-white/70">Dompet rider (caj penghantaran)</div>
          <div className="font-display text-2xl tracking-wide">{rm(w.available)}</div>
          {w.held > 0 && <div className="text-[12px] text-white/80">{rm(w.held)} sedang diproses</div>}
        </div>
      </div>
      <div className="space-y-3 p-4 text-[13.5px]">
        <p className="text-muted">Caj penghantaran untuk pesanan tanpa tunai (pindahan / dompet) masuk ke sini.</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-ghost py-2.5 text-[13px]" onClick={() => setOpen(open === 'bank' ? '' : 'bank')}><Landmark className="size-4" /> {w.accountNumber ? 'Akaun bank' : 'Isi akaun bank'}</button>
          <button className="btn btn-red py-2.5 text-[13px]" onClick={() => setOpen(open === 'out' ? '' : 'out')} disabled={!w.accountNumber || w.available < 5}>Keluarkan</button>
        </div>
        {w.accountNumber && open !== 'bank' && <p className="text-[12.5px] text-muted">Ke: {w.name} · {w.bankName} · {w.accountNumber}</p>}
        {open === 'bank' && <BankForm initial={w} busy={busy} onSubmit={(bank) => post({ bank })} submitLabel="Simpan akaun bank" />}
        {open === 'out' && (
          <div className="flex gap-2">
            <input className="field" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={`Maks ${rm(w.available)}`} />
            <button className="btn btn-red shrink-0 px-4 text-[13px]" disabled={!(+amount >= 5 && +amount <= w.available) || busy} onClick={async () => {
              setErr('')
              try {
                const r = await withTxPin(`Keluarkan ${rm(+amount)}`, (txPin) => call('rider', pin, '/wallet', { withdraw: +amount, txPin }), 'Masukkan PIN rider anda')
                if (r) (setOpen(''), setAmount(''), onDone())
              } catch (e) {
                setErr(e.message)
              }
            }}>Mohon</button>
          </div>
        )}
        {err && <p className="font-semibold text-tomato">{err}</p>}
        {w.tx?.length > 0 && <TxList tx={w.tx.slice(0, 8)} />}
      </div>
    </section>
  )
}

/** Kitchen product form: name, description, sizes with MODAL price (what Pizzadonia pays the kitchen), photo. */
function KitchenProductForm({ initial, pin, onDone, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.desc || '')
  const [sizes, setSizes] = useState(initial?.sizes?.length ? initial.sizes.map((z) => ({ id: z.id, label: z.label, cost: String(z.cost) })) : [{ label: '8 inci', cost: '' }, { label: '10 inci', cost: '' }])
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pick = useRef(null)
  const setZ = (i, k, v) => setSizes(sizes.map((z, j) => (j === i ? { ...z, [k]: v } : z)))
  const ok = name.trim().length >= 2 && sizes.length > 0 && sizes.every((z) => z.label.trim() && +z.cost > 0)
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const body = { name, desc, sizes: sizes.map((z) => ({ id: z.id, label: z.label.trim(), cost: +z.cost })) }
      const r = initial ? await call('kitchen', pin, `/products/${initial.id}`, body, 'PUT') : await call('kitchen', pin, '/products', body)
      const id = initial?.id || r.id
      if (photo) await upload('kitchen', pin, `/products/${id}/photo`, photo.file)
      onDone(initial ? 'Disimpan' : 'Menu baru dihantar - Pizzadonia akan letak harga jualan')
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border-2 border-tomato/30 bg-white p-3">
      <div className="flex gap-3">
        <button type="button" onClick={() => pick.current?.click()} className="relative size-20 shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-line bg-cream" aria-label="Gambar">
          {photo || initial?.img ? <img src={photo?.url || initial.img} alt="" className="size-full object-cover" /> : <Camera className="mx-auto size-7 text-muted" />}
          <span className="absolute inset-x-0 bottom-0 bg-ink/60 text-[10px] font-bold text-white">Gambar</span>
        </button>
        <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }) }} />
        <div className="min-w-0 flex-1 space-y-2">
          <input className="field py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama menu (cth: Pizza Pepperoni)" maxLength={40} />
          <input className="field py-2 text-[13px]" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Penerangan / topping (pilihan)" maxLength={200} />
        </div>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[12px] font-bold text-muted"><span>Saiz</span><span>Harga modal (RM)</span><span /></div>
        {sizes.map((z, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <input className="field py-2" value={z.label} onChange={(e) => setZ(i, 'label', e.target.value)} placeholder="8 inci" maxLength={20} />
            <input className="field py-2" type="number" min="0" step="0.5" value={z.cost} onChange={(e) => setZ(i, 'cost', e.target.value)} placeholder="16" />
            <button type="button" className="grid size-9 place-items-center rounded-full text-tomato hover:bg-tomato/10 disabled:opacity-30" disabled={sizes.length === 1 || Boolean(z.id)}
              onClick={() => setSizes(sizes.filter((_, j) => j !== i))} aria-label="Buang saiz"><X className="size-4" /></button>
          </div>
        ))}
        <button type="button" className="text-[12.5px] font-bold text-tomato underline" onClick={() => setSizes([...sizes, { label: '', cost: '' }])}>+ Tambah saiz</button>
      </div>
      <p className="rounded-xl bg-cream px-3 py-2 text-[12px] text-muted">Harga modal = harga yang Pizzadonia bayar kepada anda. Harga jualan kepada pelanggan ditetapkan oleh Pizzadonia. Menu baru akan dipaparkan selepas harga jualan diletak.</p>
      {err && <p className="text-[13px] font-semibold text-tomato">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-red flex-1 py-2.5 text-[14px]" disabled={!ok || busy}>{busy && <Loader2 className="size-4 animate-spin" />} {initial ? 'Simpan' : 'Hantar menu baru'}</button>
        <button type="button" className="btn btn-ghost px-4 py-2.5 text-[14px]" onClick={onCancel}>Batal</button>
      </div>
    </form>
  )
}

/** Kitchen switches each pizza between "Ada" and "Habis", edits menus + modal prices, adds new menus. */
function KitchenMenu({ menu, pin, onDone }) {
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(true)
  const [edit, setEdit] = useState('') // product id or 'new'
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const toggle = async (m) => {
    setBusy(m.id)
    setErr('')
    try {
      await call('kitchen', pin, `/menu/${m.id}`, { available: !m.available })
      onDone()
    } catch (e) {
      setErr(e.message)
    }
    setBusy('')
  }
  const done = (text) => (setEdit(''), setMsg(text), onDone())
  const out = menu.filter((m) => !m.available).length
  return (
    <section className="card mt-4 p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-display text-xl tracking-wide">Menu & harga modal</h2>
        {out > 0 && <span className="rounded-full bg-tomato px-2.5 py-0.5 text-[11.5px] font-bold text-white">{out} habis</span>}
        <button className="btn btn-ghost px-3 py-1 text-[12px]" onClick={() => setOpen((v) => !v)}>{open ? 'Tutup' : 'Buka'}</button>
      </div>
      {open && (
        <>
          <p className="mt-1 text-[12.5px] text-muted">Tekan Ada/Habis untuk stok hari ini. Tekan Ubah untuk tukar nama, saiz atau harga modal.</p>
          {msg && <p className="mt-2 rounded-xl bg-basil/10 px-3 py-2 text-[13px] font-semibold text-basil">{msg}</p>}
          {err && <p className="mt-2 text-[13px] font-semibold text-tomato">{err}</p>}
          {edit === 'new' ? (
            <div className="mt-3"><KitchenProductForm pin={pin} onDone={done} onCancel={() => setEdit('')} /></div>
          ) : (
            <button className="btn btn-red mt-3 w-full py-2.5 text-[14px]" onClick={() => (setEdit('new'), setMsg(''))}><Plus className="size-4" /> Tambah menu baru</button>
          )}
          <ul className="mt-3 space-y-3">
            {menu.map((m) => (
              <li key={m.id}>
                {edit === m.id ? (
                  <KitchenProductForm initial={m} pin={pin} onDone={done} onCancel={() => setEdit('')} />
                ) : (
                  <div className="flex items-center gap-3">
                    <img src={m.img} alt="" className={`size-12 rounded-xl object-cover ${m.available ? '' : 'grayscale'}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`font-bold ${m.available ? '' : 'text-muted line-through'}`}>{m.name}</div>
                      <div className="text-[11.5px] text-muted">{m.sizes?.length ? m.sizes.map((z) => `${z.label} modal ${rm(z.cost)}`).join(' · ') : `modal ${rm(m.cost)}`}</div>
                      {m.pendingPrice && <div className="text-[11px] font-bold text-crust">Menunggu harga jualan dari Pizzadonia</div>}
                    </div>
                    <button className="btn btn-ghost px-3 py-1.5 text-[12px]" onClick={() => (setEdit(m.id), setMsg(''))}>Ubah</button>
                    <button role="switch" aria-checked={m.available} disabled={busy === m.id} onClick={() => toggle(m)}
                      className={`min-w-20 rounded-full px-3 py-2 text-[12.5px] font-extrabold transition ${m.available ? 'bg-basil text-white' : 'bg-tomato text-white'}`}>
                      {busy === m.id ? <Loader2 className="mx-auto size-4 animate-spin" /> : m.available ? '✓ Ada' : '✕ Habis'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function KitchenStatement({ st }) {
  return (
    <section className="card mt-4 p-4">
      <h2 className="flex items-center gap-2 font-display text-xl tracking-wide"><Landmark className="size-5 text-basil" /> Bayaran diterima dari Pizzadonia</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[['Hari ini', st.today], ['7 hari', st.week], ['30 hari', st.month]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-cream px-2 py-2.5"><div className="text-[11.5px] text-muted">{k}</div><div className="font-extrabold">{rm(v)}</div></div>
        ))}
      </div>
      {st.rows.length > 0 && (
        <ul className="mt-3 max-h-56 divide-y divide-line overflow-y-auto rounded-2xl border border-line text-[13px]">
          {st.rows.map((r) => (
            <li key={r.id} className="flex justify-between px-3 py-2">
              <span><b>{r.id}</b> <span className="text-muted">{new Date(r.at).toLocaleString('ms-MY', { dateStyle: 'short', timeStyle: 'short' })}</span></span>
              <span className="font-bold text-basil">{rm(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const BI_STATUS = {
  pending: ['Menunggu semakan', 'bg-cheese text-ink'],
  confirmed: ['Diterima', 'bg-basil text-white'],
  rejected: ['Ditolak', 'bg-tomato text-white'],
}

/** COD cash the rider holds -> bank in to the owner and upload the receipt. */
function CashPanel({ cash, pin, onDone }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const send = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!confirm(`Hantar resit bank-in ${rm(cash.amount)} untuk ${cash.owing.length} pesanan?`)) return
    setBusy(true)
    setErr('')
    try {
      await upload('rider', pin, '/bankin', f)
      onDone()
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }
  const pending = cash.bankins.filter((b) => b.status === 'pending')
  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
        <Landmark className="size-5 text-cheese" />
        <div className="flex-1">
          <div className="text-[12px] font-bold uppercase tracking-wider text-white/70">Tunai perlu bank-in</div>
          <div className="font-display text-2xl tracking-wide">{rm(cash.amount)}</div>
        </div>
        <span className="text-[12.5px] text-white/70">{cash.owing.length} pesanan</span>
      </div>
      <div className="space-y-3 p-4 text-[13.5px]">
        {cash.owing.length > 0 ? (
          <>
            <p className="text-muted">
              {cash.keepsFee ? 'Caj penghantaran anda simpan. ' : ''}Bank-in jumlah ini kepada Pizzadonia, kemudian muat naik resit.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {cash.owing.map((o) => <li key={o.id} className="rounded-full bg-cream px-2.5 py-1 text-[12px] font-bold">{o.id} · {rm(o.owed)}</li>)}
            </ul>
            <button className="text-[13px] font-bold text-tomato underline" onClick={() => setOpen((v) => !v)}>{open ? 'Tutup' : 'Lihat akaun bank Pizzadonia'}</button>
            {open && (
              <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-cream p-3">
                {cash.pay.qr && <img src={cash.pay.qr} alt="QR Pizzadonia" className="size-32 rounded-xl bg-white object-contain p-1" />}
                <div>
                  <div className="font-bold">{cash.pay.bankName || 'Bank belum ditetapkan'}</div>
                  <div className="text-muted">{cash.pay.accountName}</div>
                  <div className="select-all text-[16px] font-extrabold tabular-nums">{cash.pay.accountNumber}</div>
                </div>
              </div>
            )}
            <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={send} />
            <button className="btn btn-red w-full py-3.5 text-[15px]" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Muat naik resit bank-in {rm(cash.amount)}
            </button>
          </>
        ) : (
          <p className="flex items-center gap-2 font-semibold text-basil"><CircleCheck className="size-4" /> Tiada tunai tertunggak. Terima kasih!</p>
        )}
        {err && <p className="font-semibold text-tomato">{err}</p>}
        {cash.bankins.length > 0 && (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {cash.bankins.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <b>{b.id}</b>
                <span className="text-muted">{new Date(b.at).toLocaleString('ms-MY', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="ml-auto font-bold">{rm(b.amount)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${BI_STATUS[b.status][1]}`}>{BI_STATUS[b.status][0]}</span>
                {b.status === 'rejected' && b.reason && <span className="w-full text-[12px] text-tomato">Sebab: {b.reason} - sila bank-in semula.</span>}
              </li>
            ))}
          </ul>
        )}
        {pending.length > 0 && <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><Clock className="size-3.5" /> Pizzadonia akan sahkan bank-in anda.</p>}
      </div>
    </section>
  )
}

export default function Staff({ role }) {
  const R = ROLE[role]
  const [pin, setPin] = useState(() => readPin(role))
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const known = useRef(null)
  const logout = useCallback(() => {
    writePin(role, '')
    setPin('')
    setData(null)
  }, [role])
  const load = useCallback(async () => {
    if (!pin) return
    try {
      const d = await call(role, pin)
      const waiting = new Set(d.orders.filter((o) => R.action[o.status]).map((o) => o.id + o.status))
      if (known.current && [...waiting].some((k) => !known.current.has(k))) beep()
      known.current = waiting
      setData(d)
      setErr('')
      const n = d.orders.filter((o) => o.status === (role === 'kitchen' ? 'supplier_paid' : 'ready')).length
      document.title = n ? `(${n}) ${R.title} - Pizzadonia` : `${R.title} - Pizzadonia`
    } catch (e) {
      if (e.status === 401) logout()
      setErr(e.message)
    }
  }, [pin, role, R, logout])
  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  if (!pin) return <Login role={role} onOk={setPin} />
  return (
    <div className="min-h-dvh pb-16">
      <header className="sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Logo small />
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white"><R.Icon className="size-3.5" /> {R.title}</span>
          <button onClick={load} className="btn btn-ghost ml-auto shrink-0 px-3 py-1.5 text-[12.5px]" aria-label="Muat semula"><RefreshCw className="size-3.5" /></button>
          <button onClick={logout} className="btn btn-ghost shrink-0 px-3 py-1.5 text-[12.5px]" aria-label="Keluar"><LogOut className="size-3.5" /> <span className="hidden sm:inline">Keluar</span></button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-5">
        <p className="text-[13.5px] text-muted">{R.intro} Halaman ini semak pesanan baru setiap 8 saat dan berbunyi bila ada.</p>
        {err && <p className="mt-3 rounded-xl bg-tomato/10 px-3 py-2 text-[13px] text-tomato">{err}</p>}
        {data && <ChangeOwnPin role={role} pin={pin} isDefault={data.defaultPin} onChanged={(p) => (writePin(role, p), setPin(p))} />}
        {!data ? (
          <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
        ) : (
          <>
            {role === 'rider' && data.cash && <CashPanel cash={data.cash} pin={pin} onDone={load} />}
            {role === 'rider' && data.wallet && <RiderWallet w={data.wallet} pin={pin} onDone={load} />}
            {role === 'kitchen' && data.menu && <KitchenMenu menu={data.menu} pin={pin} onDone={load} />}
            {role === 'kitchen' && data.statement && <KitchenStatement st={data.statement} />}
            <div className="mt-4 space-y-4">
              {data.orders.length === 0 && <p className="card p-8 text-center text-muted">{R.empty}</p>}
              {data.orders.map((o) => <OrderCard key={o.id + o.status} o={o} role={role} pin={pin} onDone={load} />)}
            </div>
            {data.done.length > 0 && (
              <section className="mt-8">
                <h2 className="font-display text-xl tracking-wide">Selesai hari ini ({data.done.length})</h2>
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white text-[13.5px]">
                  {data.done.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                      <b>{o.id}</b>
                      <span className="min-w-0 flex-1 truncate text-muted">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span>
                      {role === 'rider' && o.proof && <Camera className="size-3.5 text-basil" aria-label="Ada gambar" />}
                      {role === 'rider' && o.cod && <span className="font-bold text-basil">{rm(o.total)} tunai</span>}
                      {role === 'kitchen' && <span className="font-bold text-basil">{rm(o.supplierCost)}</span>}
                    </li>
                  ))}
                </ul>
                {role === 'rider' && (
                  <p className="mt-2 text-right text-[13px] font-bold">
                    Jumlah tunai dikutip hari ini: {rm(data.done.filter((o) => o.cod).reduce((s, o) => s + o.total, 0))}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
