import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, Share2, ShieldCheck } from 'lucide-react'
import { SHOP } from '../config'
import { rm } from '../lib/format'

interface DuitNowQRProps {
  amount: number
  size?: number
  notify?: (message: string) => void
}

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean
  share?: (data?: ShareData) => Promise<void>
}

export function DuitNowQR({ amount, size = 224, notify }: DuitNowQRProps) {
  const [src, setSrc] = useState('')
  const [copied, setCopied] = useState(false)
  // QR statik bank digunakan tanpa diubah. Jumlah dimasukkan manual oleh
  // pelanggan kerana QR dinamik yang diubah sendiri ditolak oleh TNG/bank.
  const payload = SHOP.payment.duitnowQr
  const amountText = amount.toFixed(2)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(payload, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#2A1A12', light: '#FFFDF8' },
    })
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc('')
      })
    return () => {
      cancelled = true
    }
  }, [payload])

  const copyAmount = async () => {
    try {
      await navigator.clipboard.writeText(amountText)
      setCopied(true)
      notify?.(`Jumlah ${rm(amount)} disalin — tampal dalam app bank`)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      notify?.('Gagal menyalin jumlah — taip secara manual')
    }
  }

  const downloadQr = () => {
    if (!src) return false
    const link = document.createElement('a')
    link.href = src
    link.download = `pizzadonia-duitnow-${amountText}.png`
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    return true
  }

  const saveQr = () => {
    if (downloadQr()) notify?.('QR disimpan — pilih dari galeri dalam app bank')
  }

  const shareQr = async () => {
    if (!src) return
    let blob: Blob
    try {
      blob = await (await fetch(src)).blob()
    } catch {
      notify?.('Gagal sediakan gambar QR — cuba Simpan QR')
      return
    }
    const file = new File([blob], `pizzadonia-duitnow-${amountText}.png`, {
      type: 'image/png',
    })
    const shareNavigator = navigator as ShareNavigator
    const data: ShareData = {
      title: 'QR DuitNow Pizzadonia',
      text: `Bayar ${rm(amount)} kepada ${SHOP.payment.merchant} melalui DuitNow QR.`,
      files: [file],
    }

    // 1. Share sheet Android/iOS — pilih WhatsApp, Telegram, e-mel, dll.
    if (
      typeof shareNavigator.share === 'function' &&
      shareNavigator.canShare?.({ files: [file] })
    ) {
      try {
        await shareNavigator.share(data)
        return
      } catch (error) {
        // Pengguna batalkan share sheet — jangan buat apa-apa.
        if ((error as Error)?.name === 'AbortError') return
      }
    }

    // 2. Desktop/HTTP: salin gambar QR ke clipboard untuk tampal dalam WhatsApp Web.
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        notify?.('Gambar QR disalin — tampal dalam WhatsApp atau app lain')
        return
      }
    } catch {
      // Clipboard tidak dibenarkan — jatuh ke muat turun.
    }

    // 3. Fallback terakhir: muat turun gambar, kongsi dari galeri/Downloads.
    if (downloadQr()) {
      notify?.('QR dimuat turun — kongsi gambar dari galeri atau Downloads')
    }
  }

  return (
    <div className="flex w-full max-w-[252px] flex-col items-center gap-3">
      <div
        className="grid place-items-center rounded-2xl border border-line bg-paper p-2 shadow-card"
        style={{ width: size + 16, height: size + 16 }}
      >
        {src ? (
          <img
            src={src}
            alt={`QR DuitNow asal untuk bayaran ${rm(amount)}`}
            width={size}
            height={size}
            className="h-full w-full rounded-xl"
          />
        ) : (
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-tomato-deep" />
        )}
      </div>

      <div className="w-full rounded-2xl border border-tomato/20 bg-tomato/5 px-3.5 py-3 text-center">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-tomato-deep">
          Jumlah perlu dibayar
        </p>
        <button
          type="button"
          onClick={copyAmount}
          className="mt-1 inline-flex items-center gap-2 rounded-lg px-1.5 py-0.5 transition hover:bg-tomato/10"
          aria-label={`Salin jumlah ${rm(amount)}`}
        >
          <span className="font-display text-3xl leading-none tracking-wide text-ink">
            {rm(amount)}
          </span>
          {copied ? (
            <Check className="h-4 w-4 text-basil" />
          ) : (
            <Copy className="h-4 w-4 text-muted" />
          )}
        </button>
        <p className="mt-1 text-[10px] font-semibold text-muted">
          Tekan jumlah untuk salin
        </p>
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copyAmount}
          className="btn btn-ghost h-9 px-2 text-[11px]"
        >
          <Copy className="h-3.5 w-3.5" />
          Salin jumlah
        </button>
        <button
          type="button"
          onClick={saveQr}
          disabled={!src}
          className="btn btn-ghost h-9 px-2 text-[11px]"
        >
          <Download className="h-3.5 w-3.5" />
          Simpan QR
        </button>
      </div>

      <button
        type="button"
        onClick={shareQr}
        disabled={!src}
        className="btn w-full border border-tomato/25 bg-tomato/5 px-2 py-2 text-[11px] text-tomato-deep hover:border-tomato/45 hover:bg-tomato/10"
      >
        <Share2 className="h-3.5 w-3.5" />
        Kongsi QR ke WhatsApp / app
      </button>
      <p className="text-center text-[9px] font-medium leading-relaxed text-muted">
        Hantar gambar QR ini ke WhatsApp, Telegram atau mana-mana app.
      </p>

      <div className="text-center">
        <p className="inline-flex items-center gap-1 rounded-full bg-basil/10 px-2 py-0.5 text-[10px] font-bold text-basil">
          <ShieldCheck className="h-3 w-3" /> QR asal bank
        </p>
        <p className="mt-1 text-[11px] font-semibold text-muted">{SHOP.payment.merchant}</p>
        <p className="mt-2 max-w-[236px] rounded-xl bg-cheese/20 px-2.5 py-1.5 text-[10px] font-semibold leading-relaxed text-[#7a4f00]">
          Masukkan jumlah {rm(amount)} secara manual dalam app bank sebelum bayar.
        </p>
      </div>
    </div>
  )
}
