import { useEffect, useState } from 'react'
import { api, appCall, appRole } from '../lib.js'

const VERIFIER_KEY = 'pz.appLoginVerifier'
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Pizzadonia Seller: Google opens in the phone's real browser and returns a one-time code to the app. */
export function SellerAppLogin({ onSession }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let gone = false
    const check = async () => {
      let code
      try {
        code = (await appCall('takeLoginCode'))?.code
      } catch {
        return
      }
      if (!code || gone) return
      setMsg('Menyemak log masuk…')
      try {
        const r = await api('/api/admin/app-login/redeem', { method: 'POST', body: { code, verifier: localStorage.getItem(VERIFIER_KEY) || '' } })
        localStorage.removeItem(VERIFIER_KEY)
        onSession(r.session)
      } catch (e) {
        setMsg(e.message)
      }
    }
    check()
    const t = setInterval(check, 1500)
    document.addEventListener('visibilitychange', check)
    return () => {
      gone = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', check)
    }
  }, [onSession])
  const start = async () => {
    setBusy(true)
    setMsg('')
    try {
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
      localStorage.setItem(VERIFIER_KEY, verifier)
      await appCall('openBrowser', { url: `https://pizzadonia.pages.dev/#/app-login?c=${challenge}` })
      setMsg('Selepas log masuk dalam pelayar, anda akan kembali ke sini.')
    } catch (e) {
      setMsg(e.message || 'Pelayar tidak dapat dibuka.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-4">
      <button type="button" className="btn bg-tomato text-white w-full justify-center" disabled={busy} onClick={start}>Log masuk dengan Google</button>
      {msg && <p className="mt-3 text-[13px] text-muted" role="status">{msg}</p>}
    </div>
  )
}

/** Tells the app user a newer APK is ready. Android always asks them to tap Pasang. */
export function AppUpdateBar() {
  const [next, setNext] = useState(null)
  const [state, setState] = useState('')
  useEffect(() => {
    if (!appRole) return
    let gone = false
    ;(async () => {
      try {
        const [me, list] = await Promise.all([appCall('info'), fetch('/apk/version.json', { cache: 'no-store' }).then((r) => r.json())])
        const v = list?.[appRole]
        if (!gone && v?.versionCode > me.versionCode) setNext(v)
      } catch { /* no bar: an update check must never get in the way */ }
    })()
    return () => { gone = true }
  }, [])
  if (!next) return null
  const install = async () => {
    setState('Memuat turun…')
    try {
      await appCall('install', { url: `https://pizzadonia.pages.dev/${next.path}?v=${next.versionCode}` })
      setState('Tekan Pasang pada skrin Android.')
    } catch (e) {
      setState(e.message || 'Kemas kini gagal. Cuba lagi.')
    }
  }
  return (
    <div className="bg-ink px-4 pb-2.5 text-white" style={{ paddingTop: 'calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 10px)' }}>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 text-[13px]">
        <span className="min-w-0" role="status">{state || `Versi baharu ${next.versionName} tersedia.`}</span>
        <button type="button" className="btn shrink-0 bg-cheese px-3 py-2 text-[13px] text-ink" disabled={state === 'Memuat turun…'} onClick={install}>Kemas kini</button>
      </div>
    </div>
  )
}
