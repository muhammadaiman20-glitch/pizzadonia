import { useEffect, useState, useSyncExternalStore } from 'react'
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

// In-app update, the same way as Ronda: a bar when a newer version is ready, and a card with the installed version
// and a Check again button. The download and install happen inside the app; Android still asks for a tap on Pasang.
const RECHECK_MS = 30 * 60_000
let update = { state: 'checking' }
let checkedAt = 0
let running = null
const listeners = new Set()
const setUpdate = (patch) => {
  update = { ...update, ...patch }
  listeners.forEach((l) => l())
}
function checkUpdate() {
  running ??= (async () => {
    checkedAt = Date.now()
    setUpdate({ checking: true, error: '' })
    let me = null
    let v = null
    try {
      const [info, list] = await Promise.all([appCall('info'), fetch('/apk/version.json', { cache: 'no-store' }).then((r) => r.json())])
      me = info
      v = list?.[appRole]
    } catch { /* shown as offline */ }
    const ok = me && Number(v?.versionCode) > 0
    setUpdate({ checking: false, state: !ok ? 'offline' : v.versionCode > me.versionCode ? 'update' : 'latest', me, next: v })
    running = null
  })()
  return running
}
async function installUpdate() {
  const { state, working, next } = update
  if (state !== 'update' || working) return
  setUpdate({ working: true, error: '', asked: false })
  try {
    await appCall('install', { url: `https://pizzadonia.pages.dev/${next.path}?v=${next.versionCode}` })
    setUpdate({ working: false, asked: true })
  } catch (e) {
    setUpdate({ working: false, error: e?.code === 'PERMISSION' ? 'Benarkan pasang dari app ini, kemudian tekan Kemas kini sekali lagi.' : 'Kemas kini gagal. Semak internet dan cuba lagi.' })
  }
}
const useUpdate = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => update)
const noteOf = (u) => (u.working ? 'Memuat turun…' : u.error || (u.asked ? 'Tekan Pasang pada skrin Android.' : ''))

export function AppUpdateBar() {
  const u = useUpdate()
  useEffect(() => {
    if (!appRole) return undefined
    checkUpdate()
    const back = () => { if (document.visibilityState === 'visible' && Date.now() - checkedAt > RECHECK_MS) checkUpdate() }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])
  if (u.state !== 'update') return null
  return (
    <div className="bg-ink px-4 py-2.5 text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 text-[13px]">
        <span className="min-w-0" role="status">{noteOf(u) || `Versi baharu ${u.next.versionName} tersedia.`}</span>
        <button type="button" className="btn shrink-0 bg-cheese px-3 py-2 text-[13px] text-ink" disabled={u.working} onClick={installUpdate}>Kemas kini</button>
      </div>
    </div>
  )
}

/** Installed version, the update button and Semak semula. Shown only inside the APK. */
export function AppUpdateCard({ className = '' }) {
  const u = useUpdate()
  if (!appRole) return null
  const text = u.state === 'checking' ? 'Menyemak versi…'
    : u.state === 'offline' ? 'Tidak dapat menyemak versi. Semak internet dan cuba lagi.'
      : u.state === 'latest' ? `Aplikasi anda versi terkini (${u.me.versionName}).`
        : `Versi baharu ${u.next.versionName} tersedia. Versi anda ${u.me.versionName}. Data anda tidak hilang.`
  const note = noteOf(u)
  return (
    <div className={`card p-5 ${className}`}>
      <h2 className="font-display text-xl tracking-wide">Aplikasi</h2>
      <p role="status" className="mt-1 text-[14px] text-muted">{text}</p>
      {note && <p className="mt-2 text-[13px] font-semibold">{note}</p>}
      <div className="mt-3 grid gap-2">
        {u.state === 'update' && <button type="button" className="btn btn-red px-4 py-2.5" disabled={u.working} onClick={installUpdate}>Kemas kini ke {u.next.versionName}</button>}
        <button type="button" className="btn btn-ghost px-4 py-2.5" disabled={u.checking} onClick={checkUpdate}>Semak semula</button>
      </div>
    </div>
  )
}
