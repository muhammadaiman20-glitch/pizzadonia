import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import { Download, RefreshCw, X } from 'lucide-react'
import { checkForUpdate, openUpdate, type UpdateInfo } from '../lib/updates'

const DISMISS_KEY = 'pizzadonia.update.dismissed'

/**
 * Pemberitahuan kemas kini APK. Muncul apabila manifest versi di pelayan
 * lebih baharu daripada versi app yang dipasang. Pengguna menekan butang
 * untuk memuat turun APK dan memasangnya (Android memerlukan pengesahan).
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let active = true

    const check = async () => {
      try {
        const next = await checkForUpdate()
        if (!active || !next) return
        const dismissed = window.localStorage.getItem(DISMISS_KEY)
        if (dismissed === next.latest.versionName) return
        setUpdate(next)
        setHidden(false)
      } catch {
        // Abaikan ralat rangkaian — semakan seterusnya akan cuba lagi.
      }
    }

    void check()
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void check()
    })

    return () => {
      active = false
      void listener.then((handle) => handle.remove())
    }
  }, [])

  if (!update || hidden) return null

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, update.latest.versionName)
    setHidden(true)
  }

  return (
    <div
      role="status"
      className="fixed left-3 right-3 top-3 z-[70] mx-auto flex max-w-xl items-center gap-2.5 rounded-2xl border border-tomato/30 bg-paper p-2.5 shadow-2xl animate-rise sm:left-auto sm:right-4 sm:top-4"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tomato/10 text-tomato-deep">
        <RefreshCw className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-extrabold text-ink">Kemas kini tersedia</p>
        <p className="truncate text-[10px] font-medium text-muted">
          Versi {update.latest.versionName} · anda guna {update.current}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void openUpdate(update.latest.url)}
        className="btn btn-red h-9 shrink-0 px-3 text-[11px]"
      >
        <Download className="h-3.5 w-3.5" />
        Muat turun
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Tutup pemberitahuan kemas kini"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-cream hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
