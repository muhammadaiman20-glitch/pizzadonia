import { useState } from 'react'
import { ChevronRight, Loader2, LogOut, MapPin, Package, Trash2, UserRound, Wallet as WalletIcon } from 'lucide-react'
import { Header } from './Shop.jsx'
import { accountApi, api, go, ownerSession, prettyPhone, rm, useAccount, useAutoSubmit, useShop } from '../lib.js'
import { stepOf } from '../status.js'
import GoogleButton from '../components/GoogleButton.jsx'
import { PAY_STATUS } from '../components/PaymentPanel.jsx'

export function StatusChip({ status }) {
  const s = stepOf(status)
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${s.cls}`}><s.Icon className="size-3.5" /> {s.ms}</span>
}

/** First Google sign-in: name + phone (and the old PIN if that phone already has an account). */
function GoogleProfile({ g, onCancel }) {
  const [name, setName] = useState(g.name || '')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [needPin, setNeedPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      accountApi.signedIn(await api('/api/account/google/complete', { method: 'POST', body: { ticket: g.ticket, name, phone, pin: needPin ? pin : undefined } }))
    } catch (e2) {
      setErr(e2.message)
      if (e2.status === 409 && /PIN/.test(e2.message)) setNeedPin(true)
    }
    setBusy(false)
  }
  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <div className="card p-6">
        <div className="flex items-center gap-3">
          {g.picture ? <img src={g.picture} alt="" className="size-12 rounded-full" referrerPolicy="no-referrer" /> : <UserRound className="size-10" />}
          <div className="min-w-0">
            <div className="font-display text-2xl tracking-wide">Lengkapkan profil</div>
            <div className="truncate text-[13px] text-muted">{g.email}</div>
          </div>
        </div>
        <p className="mt-3 text-[13.5px] text-muted">Sekali sahaja. Nombor telefon diperlukan untuk penghantaran dan rider hubungi anda.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold">Nama</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold">No. telefon (WhatsApp)</span>
            <input className="field" value={phone} onChange={(e) => (setPhone(e.target.value), setNeedPin(false))} inputMode="tel" autoComplete="tel" maxLength={16} placeholder="012-345 6789" />
          </label>
          {needPin && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-bold">PIN akaun lama anda</span>
              <input className="field tracking-[0.35em]" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} />
            </label>
          )}
          {err && <p className="rounded-xl bg-tomato/10 px-3 py-2 text-[13px] font-semibold text-tomato">{err}</p>}
          <button className="btn btn-red w-full py-3.5 text-[15px]" disabled={busy || name.trim().length < 2 || phone.replace(/\D/g, '').length < 9 || (needPin && pin.length < 4)}>
            {busy && <Loader2 className="size-4 animate-spin" />} Simpan & teruskan
          </button>
          <button type="button" className="w-full text-center text-[13px] text-muted underline" onClick={onCancel}>Batal</button>
        </form>
      </div>
    </div>
  )
}

function AuthForm() {
  const { shop } = useShop()
  const [gProfile, setGProfile] = useState(null)
  const [gErr, setGErr] = useState('')
  const onGoogle = async (credential) => {
    setGErr('')
    try {
      const r = await api('/api/account/google', { method: 'POST', body: { credential } })
      // the shop owner's Gmail: straight into the admin dashboard (no customer profile needed)
      if (r.adminSession) {
        ownerSession.set(r.adminSession)
        if (r.token) accountApi.signedIn(r)
        return go('/admin')
      }
      if (r.needProfile) setGProfile(r)
      else accountApi.signedIn(r)
    } catch (e) {
      setGErr(e.message)
    }
  }
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e?.preventDefault()
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      if (mode === 'login') await accountApi.login(phone, pin)
      else await accountApi.register(name, phone, pin)
    } catch (e2) {
      setErr(e2.message)
      if (e2.status === 409) setMode('login')
    }
    setBusy(false)
  }
  // login: try by itself once phone + PIN look complete (register still needs the button)
  useAutoSubmit(`${phone}|${pin}`, mode === 'login' && phone.replace(/\D/g, '').length >= 9 && pin.length >= 4, submit, 800)
  if (gProfile) return <GoogleProfile g={gProfile} onCancel={() => setGProfile(null)} />
  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-cheese"><UserRound className="size-8" /></span>
        <h1 className="mt-4 font-display text-4xl tracking-wide">{mode === 'login' ? 'Log masuk' : 'Daftar akaun'}</h1>
        <p className="mt-1 text-[14px] text-muted">Jejak semua pesanan anda dan simpan alamat untuk order seterusnya.</p>
      </div>
      <div className="card mt-6 p-5">
        {shop?.googleClientId && (
          <>
            <GoogleButton clientId={shop.googleClientId} onCredential={onGoogle} />
            {gErr && <p className="mt-2 text-center text-[13px] font-semibold text-tomato">{gErr}</p>}
            <div className="my-4 flex items-center gap-3 text-[12px] text-muted"><span className="h-px flex-1 bg-line" /> atau guna no. telefon + PIN <span className="h-px flex-1 bg-line" /></div>
          </>
        )}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-cream p-1" role="tablist">
          {[['login', 'Log masuk'], ['register', 'Daftar baru']].map(([id, l]) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => (setMode(id), setErr(''))}
              className={`rounded-full py-2 text-[14px] font-bold ${mode === id ? 'bg-white shadow' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-bold">Nama</span>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} placeholder="Nama anda" />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold">No. telefon</span>
            <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={16} placeholder="012-345 6789" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold">PIN (4-6 nombor)</span>
            <input className="field tracking-[0.35em]" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric" maxLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••" />
            {mode === 'register' && <span className="mt-1 block text-[12px] text-muted">Pilih PIN yang mudah anda ingat. Jangan guna PIN bank.</span>}
          </label>
          {err && <p className="rounded-xl bg-tomato/10 px-3 py-2 text-[13px] font-semibold text-tomato">{err}</p>}
          <button className="btn btn-red w-full py-3.5 text-[15px]" disabled={busy || pin.length < 4 || phone.length < 9 || (mode === 'register' && name.trim().length < 2)}>
            {busy && <Loader2 className="size-4 animate-spin" />} {mode === 'login' ? 'Log masuk' : 'Daftar & log masuk'}
          </button>
        </form>
        {mode === 'login' && <p className="mt-3 text-center text-[12.5px] text-muted">Lupa PIN? WhatsApp kedai dan kami akan bantu.</p>}
        <p className="mt-2 text-center text-[12px] text-muted">Pemilik kedai? <a href="#/admin" className="font-bold underline">Dashboard admin</a></p>
      </div>
    </div>
  )
}

export default function Account() {
  const acc = useAccount()
  const { shop } = useShop()
  const [busy, setBusy] = useState('')
  const removeAddress = async (id) => {
    setBusy(id)
    try {
      accountApi.set(await api(`/api/account/addresses/${id}`, { method: 'DELETE' }))
    } catch {
      /* keep the list as is */
    }
    setBusy('')
  }

  return (
    <div className="min-h-dvh pb-16">
      <Header />
      {acc === undefined ? (
        <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-tomato" /></div>
      ) : !acc ? (
        <AuthForm />
      ) : (
        <div className="mx-auto max-w-3xl px-4 pt-8">
          <div className="flex flex-wrap items-center gap-4">
            {acc.google?.picture ? (
              <img src={acc.google.picture} alt="" referrerPolicy="no-referrer" className="size-14 rounded-2xl object-cover" />
            ) : (
              <span className="grid size-14 place-items-center rounded-2xl bg-tomato font-display text-2xl text-white">{acc.name.slice(0, 1).toUpperCase()}</span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl tracking-wide">Hai, {acc.name}!</h1>
              <p className="text-[14px] text-muted">{prettyPhone(acc.phone)}{acc.google ? ` · ${acc.google.email}` : ''}</p>
            </div>
            <button className="btn btn-ghost px-4 py-2 text-[13px]" onClick={() => accountApi.logout()}><LogOut className="size-4" /> Log keluar</button>
          </div>

          {ownerSession.get() && (
            <a href="#/admin" className="mt-6 flex items-center gap-4 rounded-[22px] bg-ink p-5 text-white transition hover:-translate-y-0.5">
              <UserRound className="size-8 text-cheese" />
              <div className="flex-1">
                <div className="font-display text-2xl tracking-wide">Anda pemilik kedai</div>
                <div className="text-[13px] text-white/70">Akaun Google ini dikenali sebagai admin & seller - buka halaman seller</div>
              </div>
              <ChevronRight className="size-6" />
            </a>
          )}
          <a href="#/dompet" className="mt-6 flex items-center gap-4 rounded-[22px] bg-gradient-to-br from-tomato to-tomato-deep p-5 text-white shadow-pop transition hover:-translate-y-0.5">
            <WalletIcon className="size-8" />
            <div className="flex-1">
              <div className="font-display text-2xl tracking-wide">Dompet saya</div>
              <div className="text-[13px] text-white/80">Baki, tambah nilai, bonus promo dan refund</div>
            </div>
            <ChevronRight className="size-6" />
          </a>

          <section className="mt-7">
            <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide"><Package className="size-5 text-tomato" /> Pesanan saya</h2>
            {acc.orders.length === 0 ? (
              <div className="card mt-3 p-6 text-center text-muted">
                Belum ada pesanan lagi.
                <div><a href="#/" className="btn btn-red mt-4 px-6 py-2.5 text-[14px]">Order pizza</a></div>
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {acc.orders.map((o) => (
                  <li key={o.id}>
                    <a href={`#/order/${o.id}?t=${o.token}`} className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-xl tracking-wide">{o.id}</span>
                          <StatusChip status={o.status} />
                          {o.paymentMethod === 'transfer' && o.status !== 'cancelled' && (
                            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${PAY_STATUS[o.payment.status]?.cls}`}>{PAY_STATUS[o.payment.status]?.ms}</span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-[13px] text-muted">
                          {new Date(o.createdAt).toLocaleString('ms-MY', { dateStyle: 'medium', timeStyle: 'short' })} · {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                        </div>
                      </div>
                      <span className="font-extrabold text-tomato">{rm(o.total)}</span>
                      <ChevronRight className="size-5 text-muted" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide"><MapPin className="size-5 text-tomato" /> Alamat tersimpan</h2>
            <p className="mt-1 text-[13px] text-muted">Disimpan sendiri bila anda order. Pilih di checkout supaya tak perlu pin semula.</p>
            {acc.addresses.length === 0 ? (
              <p className="card mt-3 p-5 text-center text-[14px] text-muted">Belum ada alamat.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {acc.addresses.map((a) => (
                  <li key={a.id} className="card flex items-start gap-3 p-4">
                    <MapPin className="mt-0.5 size-5 shrink-0 text-tomato" />
                    <div className="min-w-0 flex-1 text-[14px]">
                      <div className="font-semibold">{a.address}</div>
                      {a.notes && <div className="text-[12.5px] text-muted">{a.notes}</div>}
                    </div>
                    <button onClick={() => removeAddress(a.id)} disabled={busy === a.id} className="grid size-9 place-items-center rounded-full text-muted hover:bg-tomato/10 hover:text-tomato" aria-label="Padam alamat">
                      {busy === a.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="mt-10 text-center text-[12.5px] text-muted">{shop?.shopName || 'Pizzadonia'} · bayar tunai bila sampai</p>
        </div>
      )}
    </div>
  )
}
