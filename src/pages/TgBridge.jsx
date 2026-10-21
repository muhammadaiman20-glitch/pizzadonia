import { useEffect, useState } from 'react'
import { api, go, ownerSession } from '../lib.js'

// /#/tg - opened from the bot's Menu button or "Seller dashboard" inside Telegram. Telegram signs who opened it
// (initData); the backend checks that it's the linked owner chat and returns an owner session, then we go to the
// seller dashboard. Google sign-in can't be used here: it doesn't work in Telegram's in-app browser.
const TG_SCRIPT = 'https://telegram.org/js/telegram-web-app.js'

function telegramWebApp() {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp)
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = TG_SCRIPT
    s.onload = () => resolve(window.Telegram?.WebApp || null)
    s.onerror = () => resolve(null)
    document.head.append(s)
  })
}

export default function TgBridge() {
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    ;(async () => {
      const tg = await telegramWebApp()
      try { tg?.ready(); tg?.expand() } catch { /* not inside Telegram */ }
      if (!tg?.initData) {
        // opened in a normal browser: the usual sign-in page
        if (ownerSession.get()) return go('/admin')
        if (alive) setError('Halaman ini dibuka melalui butang Menu dalam bot Telegram kedai. Di pelayar biasa, log masuk dengan Google di dashboard seller.')
        return
      }
      try {
        const r = await api('/api/telegram/app-session', { method: 'POST', body: { initData: tg.initData } })
        ownerSession.set(r.session)
        go('/admin')
      } catch (e) {
        if (alive) setError(e.message)
      }
    })()
    return () => { alive = false }
  }, [])
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">🍕</div>
      {error ? (
        <>
          <p className="text-base font-semibold text-red-600">{error}</p>
          <a className="btn" href="#/admin">Buka dashboard seller</a>
        </>
      ) : (
        <p className="text-base font-semibold">Membuka dashboard seller…</p>
      )}
    </main>
  )
}
