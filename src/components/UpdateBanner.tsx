import { useCallback, useEffect, useRef, useState } from 'react'
import { App } from '@capacitor/app'
import { Download, Loader2, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { checkForUpdate, openUpdate, type UpdateInfo } from '../lib/updates'
import { nativeUpdaterAvailable, updaterPlugin } from '../lib/updater'

const DISMISS_KEY = 'pizzadonia.update.dismissed'

type Phase = 'idle' | 'downloading' | 'permission' | 'ready' | 'error' | 'manual'

/**
 * Pemberitahuan kemas kini APK.
 *
 * Dalam app Android, APK dimuat turun secara automatik sebaik versi baharu
 * dikesan, kemudian pemasang sistem dibuka. Pengguna hanya perlu menekan
 * "Install" (Android tidak membenarkan pemasangan senyap untuk app sideload).
 * Dalam pelayar biasa, butang membuka pautan muat turun seperti dahulu.
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [hidden, setHidden] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [percent, setPercent] = useState(0)
  const phaseRef = useRef<Phase>('idle')
  const autoTried = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const install = useCallback(async (info: UpdateInfo) => {
    if (!nativeUpdaterAvailable()) {
      setPhase('manual')
      return
    }

    setPhase('downloading')
    setPercent(0)

    let handle: Awaited<ReturnType<typeof updaterPlugin.addListener>> | undefined
    try {
      handle = await updaterPlugin.addListener('progress', (progress) => {
        if (typeof progress.percent === 'number') {
          setPercent(Math.max(0, Math.min(100, Math.round(progress.percent))))
        }
      })

      const result = await updaterPlugin.downloadAndInstall({
        url: new URL(info.latest.url, window.location.origin).toString(),
        versionName: info.latest.versionName,
      })

      if (result.status === 'permission_required') {
        setPhase('permission')
      } else {
        // Pemasang sistem sudah dibuka; pengguna tinggal tekan "Install".
        setPhase('ready')
      }
    } catch {
      setPhase('error')
    } finally {
      void handle?.remove()
    }
  }, [])

  useEffect(() => {
    let active = true

    const check = async () => {
      try {
        const next = await checkForUpdate()
        if (!active) return

        if (!next) {
          setUpdate(null)
          return
        }

        const dismissed = window.localStorage.getItem(DISMISS_KEY)
        if (dismissed === next.latest.versionName) return

        setUpdate(next)
        setHidden(false)

        // Muat turun automatik sekali. Selepas kebenaran pemasangan diberi,
        // cuba semula secara automatik apabila app kembali aktif.
        const shouldAutoInstall = !autoTried.current || phaseRef.current === 'permission'
        if (shouldAutoInstall) {
          autoTried.current = true
          void install(next)
        }
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
  }, [install])

  if (!update || hidden) return null

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, update.latest.versionName)
    setHidden(true)
  }

  const allowInstall = () => {
    void updaterPlugin.openInstallSettings()
  }

  const retry = () => {
    void install(update)
  }

  const downloadManually = () => {
    void openUpdate(update.latest.url)
  }

  const { versionName } = update.latest

  const content = (() => {
    if (phase === 'permission') {
      return {
        title: 'Benarkan pemasangan',
        detail: 'Sekali sahaja — untuk kemas kini automatik akan datang',
        icon: <ShieldAlert className="h-4 w-4" />,
        action: (
          <button type="button" onClick={allowInstall} className="btn btn-red h-9 shrink-0 px-3 text-[11px]">
            Benarkan
          </button>
        ),
      }
    }

    if (phase === 'downloading') {
      return {
        title: 'Memuat turun kemas kini',
        detail: `Versi ${versionName} · ${percent}%`,
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        action: null,
      }
    }

    if (phase === 'ready') {
      return {
        title: 'Kemas kini sedia dipasang',
        detail: `Versi ${versionName} · tekan Install pada skrin sistem`,
        icon: <Download className="h-4 w-4" />,
        action: (
          <button type="button" onClick={retry} className="btn btn-red h-9 shrink-0 px-3 text-[11px]">
            Pasang
          </button>
        ),
      }
    }

    if (phase === 'error') {
      return {
        title: 'Muat turun gagal',
        detail: `Versi ${versionName} · semak sambungan internet`,
        icon: <RefreshCw className="h-4 w-4" />,
        action: (
          <button type="button" onClick={retry} className="btn btn-red h-9 shrink-0 px-3 text-[11px]">
            Cuba lagi
          </button>
        ),
      }
    }

    return {
      title: 'Kemas kini tersedia',
      detail: `Versi ${versionName} · anda guna ${update.current}`,
      icon: <RefreshCw className="h-4 w-4" />,
      action: (
        <button type="button" onClick={downloadManually} className="btn btn-red h-9 shrink-0 px-3 text-[11px]">
          <Download className="h-3.5 w-3.5" />
          Muat turun
        </button>
      ),
    }
  })()

  return (
    <div
      role="status"
      className="fixed left-3 right-3 top-3 z-[70] mx-auto flex max-w-xl items-center gap-2.5 rounded-2xl border border-tomato/30 bg-paper p-2.5 shadow-2xl animate-rise sm:left-auto sm:right-4 sm:top-4"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tomato/10 text-tomato-deep">
        {content.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-extrabold text-ink">{content.title}</p>
        <p className="truncate text-[10px] font-medium text-muted">{content.detail}</p>
        {phase === 'downloading' && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-tomato transition-all duration-300"
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </div>
        )}
      </div>
      {content.action}
      {phase === 'error' && (
        <button
          type="button"
          onClick={downloadManually}
          className="shrink-0 text-[10px] font-bold text-muted underline underline-offset-2 hover:text-ink"
        >
          Manual
        </button>
      )}
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
