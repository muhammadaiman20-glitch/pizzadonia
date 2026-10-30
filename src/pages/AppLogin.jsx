import { useState } from 'react'
import { api, useRoute, useShop } from '../lib.js'
import GoogleButton from '../components/GoogleButton.jsx'
import Logo from '../components/Logo.jsx'

// Opened by Pizzadonia Seller in the phone's real browser, because Google blocks sign-in inside an app.
// The browser only hands back a short one-time code; the app redeems it with a secret the browser never saw.
export default function AppLogin() {
  const { query } = useRoute()
  const { shop } = useShop()
  const [link, setLink] = useState('')
  const [err, setErr] = useState('')
  const challenge = query.get('c') || ''
  const onGoogle = async (credential) => {
    setErr('')
    try {
      const r = await api('/api/admin/app-login', { method: 'POST', body: { credential, challenge } })
      const back = `intent://login?code=${r.code}#Intent;scheme=my.pizzadonia.seller;package=my.pizzadonia.seller;end`
      setLink(back)
      location.href = back
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <div className="dots grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-sm p-7 text-center">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-5 font-display text-2xl tracking-wide">Log masuk Pizzadonia Seller</h1>
        {!/^[A-Za-z0-9_-]{43}$/.test(challenge) ? (
          <p className="mt-4 text-[14px] font-semibold text-tomato">Pautan ini tidak sah. Buka semula dari aplikasi Pizzadonia Seller.</p>
        ) : link ? (
          <>
            <p className="mt-4 text-[14px] text-muted">Log masuk berjaya.</p>
            <a href={link} className="btn bg-tomato text-white mt-4 w-full justify-center">Kembali ke aplikasi</a>
          </>
        ) : (
          <>
            <p className="mt-3 text-[14px] text-muted">Pilih akaun Google pemilik kedai.</p>
            <div className="mt-4">{shop?.googleClientId ? <GoogleButton clientId={shop.googleClientId} onCredential={onGoogle} text="signin_with" /> : <p className="text-[14px] text-muted">Memuatkan…</p>}</div>
            {err && <p className="mt-3 text-[13px] font-semibold text-tomato">{err}</p>}
          </>
        )}
      </div>
    </div>
  )
}
