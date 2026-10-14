import { useRef, useState } from 'react'
import { Check, CircleAlert, Clock, Copy, Download, FileUp, Loader2, QrCode, ReceiptText } from 'lucide-react'
import { rm } from '../lib.js'

export const PAY_STATUS = {
  unpaid: { ms: 'Belum dibayar', en: 'Not paid', cls: 'bg-tomato/10 text-tomato' },
  pending: { ms: 'Resit dihantar - menunggu semakan', en: 'Receipt sent - check it', cls: 'bg-cheese text-ink' },
  paid: { ms: 'Bayaran diterima', en: 'Paid', cls: 'bg-basil text-white' },
  rejected: { ms: 'Resit ditolak', en: 'Rejected', cls: 'bg-tomato text-white' },
}

// Phone photos are 3-8 MB: shrink to max 1600 px JPEG before sending (PDF and small files go as they are).
export async function shrink(file) {
  if (!file.type.startsWith('image/') || file.size < 700 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

function CopyRow({ label, value, mono = true }) {
  const [ok, setOk] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value).replace(/\s/g, ''))
      setOk(true)
      setTimeout(() => setOk(false), 1500)
    } catch {
      /* long-press to copy instead */
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-[12px] text-muted">{label}</div>
        <div className={`select-all break-all text-[15px] font-bold ${mono ? 'tabular-nums tracking-wide' : ''}`}>{value}</div>
      </div>
      <button type="button" onClick={copy} className="btn btn-ghost shrink-0 px-3 py-1.5 text-[12px]" aria-label={`Salin ${label}`}>
        {ok ? <Check className="size-3.5 text-basil" /> : <Copy className="size-3.5" />} {ok ? 'Disalin' : 'Salin'}
      </button>
    </div>
  )
}

/** Customer side of a bank-transfer order: QR + bank account + upload the receipt, and the seller's verdict. */
export default function PaymentPanel({ order, token, onUpdated }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [bigQr, setBigQr] = useState(false)
  const pay = order.pay || {}
  const st = order.payment.status
  const meta = PAY_STATUS[st] || PAY_STATUS.unpaid
  const canUpload = st !== 'paid' && order.status !== 'cancelled'

  const upload = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErr('')
    if (!/^image\/|application\/pdf/.test(f.type)) return setErr('Sila pilih gambar resit atau PDF.')
    setBusy(true)
    try {
      const body = await shrink(f)
      if (body.size > 6 * 1024 * 1024) throw new Error('Fail terlalu besar (maks 6 MB).')
      const r = await fetch(`/api/orders/${encodeURIComponent(order.id)}/receipt?t=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': body.type || 'application/octet-stream' }, body,
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Muat naik gagal')
      onUpdated(j)
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }

  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-cream/60 px-5 py-3">
        <QrCode className="size-5 text-tomato" />
        <h2 className="font-display text-xl tracking-wide">Bayaran pindahan</h2>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-bold ${meta.cls}`}>{meta.ms}</span>
      </div>
      <div className="p-5">
        {st === 'paid' ? (
          <div className="flex items-center gap-3 rounded-2xl bg-basil/10 p-4 text-basil">
            <span className="grid size-11 place-items-center rounded-full bg-basil text-white"><Check className="size-6" strokeWidth={3} /></span>
            <div>
              <div className="font-bold">Bayaran {rm(order.total)} diterima</div>
              <div className="text-[13px]">Terima kasih! Kedai sudah sahkan bayaran anda. Tiada tunai diperlukan semasa penghantaran.</div>
            </div>
          </div>
        ) : (
          <>
            <ol className="mb-4 space-y-1 text-[13px] text-muted">
              <li><b className="text-ink">1.</b> Imbas QR atau pindah ke akaun bank di bawah.</li>
              <li><b className="text-ink">2.</b> Bayar tepat <b className="text-ink">{rm(order.total)}</b>, rujukan <b className="text-ink">{order.id}</b>.</li>
              <li><b className="text-ink">3.</b> Muat naik resit di sini. Kedai akan sahkan.</li>
            </ol>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              {pay.qr && (
                <div className="flex flex-col items-center gap-2">
                  <button type="button" onClick={() => setBigQr(true)} className="rounded-2xl bg-white p-2 ring-1 ring-line" aria-label="Besarkan QR">
                    <img src={pay.qr} alt="QR pembayaran" className="size-44 object-contain" />
                  </button>
                  <a href={pay.qr} download={`QR-${order.id}.png`} className="text-[12px] font-bold text-tomato underline"><Download className="mr-1 inline size-3.5" />Simpan QR</a>
                </div>
              )}
              <div className="divide-y divide-line">
                <CopyRow label="Jumlah" value={rm(order.total)} />
                <CopyRow label="Rujukan" value={order.id} />
                {pay.accountNumber && (
                  <>
                    <div className="py-2">
                      <div className="text-[12px] text-muted">Bank</div>
                      <div className="text-[15px] font-bold">{pay.bankName || '-'}</div>
                      {pay.accountName && <div className="text-[13px] text-muted">{pay.accountName}</div>}
                    </div>
                    <CopyRow label="No. akaun" value={pay.accountNumber} />
                  </>
                )}
              </div>
            </div>
            {pay.note && <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-[12.5px]">{pay.note}</p>}

            {st === 'rejected' && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-tomato/10 px-3 py-2.5 text-[13px] font-semibold text-tomato">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> Resit ditolak: {order.payment.reason}. Sila hantar resit yang betul.
              </p>
            )}
            {st === 'pending' && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-cheese/30 px-3 py-2.5 text-[13px]">
                <Clock className="mt-0.5 size-4 shrink-0 text-crust" /> Resit diterima pada {new Date(order.payment.receipts.at(-1).at).toLocaleTimeString('ms-MY', { hour: 'numeric', minute: '2-digit' })}. Kedai sedang menyemak - halaman ini akan dikemas kini sendiri.
              </p>
            )}
            {canUpload && (
              <>
                <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={upload} />
                <button type="button" className={`btn mt-4 w-full py-3.5 text-[15px] ${st === 'pending' ? 'btn-ghost' : 'btn-red'}`} onClick={() => input.current?.click()} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                  {busy ? 'Menghantar…' : st === 'pending' ? 'Hantar resit lain' : 'Muat naik resit'}
                </button>
                <p className="mt-1.5 text-center text-[12px] text-muted">Gambar / screenshot resit atau PDF · maks 6 MB</p>
              </>
            )}
            {err && <p className="mt-2 text-center text-[13px] font-semibold text-tomato">{err}</p>}
          </>
        )}
        {order.payment.receipts.length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted"><ReceiptText className="size-3.5" /> {order.payment.receipts.length} resit dihantar</p>
        )}
      </div>
      {bigQr && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-6" onClick={() => setBigQr(false)} role="dialog" aria-label="QR pembayaran">
          <div className="rounded-3xl bg-white p-4 text-center">
            <img src={pay.qr} alt="QR pembayaran" className="max-h-[70vh] w-[min(80vw,420px)] object-contain" />
            <p className="mt-2 text-[13px] text-muted">Tekan di mana-mana untuk tutup</p>
          </div>
        </div>
      )}
    </section>
  )
}
