import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Download } from 'lucide-react'
import { api, appCall, appRole } from '../lib.js'
import { createUpdater } from '../appUpdater.js'

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

// In-app update, required before use, the same way as Ronda. The app stays usable with no internet.
export const appUpdater = createUpdater({
  getInstalled: () => appCall('info'),
  getLatest: () => fetch('/apk/version.json', { cache: 'no-store' }).then((r) => r.json()).then((list) => list?.[appRole]),
  install: (v) => appCall('install', { url: `https://pizzadonia.pages.dev/${v.path}?v=${v.versionCode}` }),
  getProgress: () => appCall('progress'),
  exit: () => appCall('exit'),
})
const useUpdate = () => useSyncExternalStore(appUpdater.subscribe, appUpdater.get)
const updateRequired = () => appUpdater.get().state === 'update' && !appUpdater.get().deferred
// the phone's Back button asks this first (see MainActivity)
if (typeof window !== 'undefined') window.pizzaUpdateRequired = () => !!document.querySelector('dialog.update-sheet')?.open

const SHEET = {
  ready: { title: 'Kemas kini diperlukan', go: 'Kemas kini' },
  downloading: { title: 'Memuat turun kemas kini' },
  install: { title: 'Sedia untuk dipasang', go: 'Buka pemasang semula' },
  permission: { title: 'Perlukan kebenaran', go: 'Kemas kini' },
  error: { title: 'Kemas kini tidak berjaya', go: 'Cuba lagi', use: true },
}

/** Comes up by itself, but waits while the user is typing or another sheet is open. */
function UpdateSheet() {
  const u = useUpdate()
  const dialog = useRef(null)
  const needed = u.state === 'update' && !u.deferred
  useEffect(() => {
    const d = dialog.current
    if (!d) return undefined
    if (!needed) {
      if (d.open) d.close()
      return undefined
    }
    const offer = () => {
      if (d.open) return
      const el = document.activeElement
      if (document.visibilityState !== 'visible' || (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) || document.querySelector('.fixed.inset-0')) return
      d.showModal()
      d.focus()
    }
    offer()
    const timer = setInterval(offer, 2000)
    return () => clearInterval(timer)
  }, [needed])
  const s = SHEET[u.sheet] || SHEET.ready
  const downloading = u.sheet === 'downloading'
  const notes = Array.isArray(u.latest?.notes) ? u.latest.notes.filter((n) => typeof n === 'string').slice(0, 4) : []
  const message = u.sheet === 'ready' ? 'Anda perlu kemas kini dahulu untuk terus menggunakan aplikasi.' : downloading ? `${u.percent >= 0 ? `${u.percent}%` : 'Sedang dimuat turun'}. Jangan tutup aplikasi.` : u.message
  return (
    <dialog ref={dialog} className="update-sheet" aria-labelledby="updTitle" tabIndex={-1} onCancel={(e) => e.preventDefault()} onClose={() => { if (updateRequired()) dialog.current?.showModal() }}>
      <div className="flex items-center gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cheese text-ink"><Download size={24} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="updTitle" className="font-display text-xl tracking-wide">{s.title}</h2>
          <p className="text-[13px] tabular-nums text-muted">{u.latest ? `Versi ${u.installed?.versionName ?? '?'} ke ${u.latest.versionName}${Number(u.latest.sizeMB) > 0 ? ` · ${u.latest.sizeMB} MB` : ''}` : ''}</p>
        </div>
      </div>
      {u.sheet === 'ready' && notes.length > 0 && <ul className="mt-4 grid list-disc gap-1.5 pl-5 text-[14px] leading-relaxed">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <div className="mt-4 grid gap-2.5" role="status" aria-live="polite">
        {downloading && <div className={`update-track ${u.percent < 0 ? 'unknown' : ''}`}><i style={{ width: `${Math.max(0, u.percent)}%` }} /></div>}
        <p className={`text-[14px] leading-relaxed tabular-nums ${u.sheet === 'error' || u.sheet === 'permission' ? 'text-tomato' : ''}`}>{message}{u.exitFailed ? ' Tekan butang Utama telefon untuk keluar.' : ''}</p>
      </div>
      {!downloading && (
        <div className="mt-5 grid gap-2">
          <button type="button" className="update-go" onClick={() => appUpdater.install()}>{s.go}</button>
          {s.use && <button type="button" className="update-use" onClick={() => appUpdater.useFirst()}>Guna dahulu</button>}
          <button type="button" className="update-leave" onClick={() => appUpdater.exit()}>Keluar aplikasi</button>
        </div>
      )}
    </dialog>
  )
}

export function AppUpdateBar() {
  const u = useUpdate()
  useEffect(() => {
    if (!appRole) return undefined
    appUpdater.check()
    const back = () => { if (document.visibilityState === 'visible') appUpdater.recheck() }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])
  if (!appRole) return null
  return (
    <>
      <UpdateSheet />
      {u.state === 'update' && u.deferred && (
        <div className="bg-ink px-4 py-2.5 text-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 text-[13px]">
            <span className="min-w-0" role="status">Versi baharu {u.latest.versionName} tersedia.</span>
            <button type="button" className="btn shrink-0 bg-cheese px-3 py-2 text-[13px] text-ink" onClick={() => appUpdater.install()}>Kemas kini</button>
          </div>
        </div>
      )}
    </>
  )
}

/** Installed version, the update button and Semak semula. Shown only inside the APK. */
export function AppUpdateCard({ className = '' }) {
  const u = useUpdate()
  if (!appRole) return null
  const text = u.state === 'checking' ? 'Menyemak versi…'
    : u.state === 'offline' ? 'Tidak dapat menyemak versi. Semak internet dan cuba lagi.'
      : u.state === 'latest' ? `Aplikasi anda versi terkini (${u.installed.versionName}).`
        : `Versi baharu ${u.latest.versionName} tersedia. Versi anda ${u.installed.versionName}. Data anda tidak hilang.`
  return (
    <div className={`card p-5 ${className}`}>
      <h2 className="font-display text-xl tracking-wide">Aplikasi</h2>
      <p role="status" className="mt-1 text-[14px] text-muted">{text}</p>
      <div className="mt-3 grid gap-2">
        {u.state === 'update' && <button type="button" className="btn btn-red px-4 py-2.5" disabled={u.working} onClick={() => appUpdater.install()}>Kemas kini ke {u.latest.versionName}</button>}
        <button type="button" className="btn btn-ghost px-4 py-2.5" disabled={u.checking} onClick={() => appUpdater.check()}>Semak semula</button>
      </div>
    </div>
  )
}
