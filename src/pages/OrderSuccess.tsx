import { useEffect, useState } from 'react'
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Lock,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  QrCode,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { SHOP } from '../config'
import { getPizza } from '../data/menu'
import { buildWhatsAppMessage } from '../lib/cart'
import { formatDateTime, rm } from '../lib/format'
import { locationDirectionsUrl } from '../lib/location'
import { paymentLabel } from '../lib/payment'
import { prettyPhone } from '../lib/whatsapp'
import type { Order } from '../types'
import { DuitNowQR } from '../components/DuitNowQR'
import { OrderTimeline } from '../components/OrderTimeline'
import { PaymentBadge } from '../components/PaymentBadge'
import { StatusBadge } from '../components/StatusBadge'

interface OrderSuccessProps {
  orderId: string
  initialOrder?: Order
  notify: (message: string) => void
  fetchOrder: (id: string) => Promise<Order | null>
  confirmPayment: (id: string) => Promise<Order | null>
}

export function OrderSuccess({
  orderId,
  initialOrder,
  notify,
  fetchOrder,
  confirmPayment,
}: OrderSuccessProps) {
  const [copied, setCopied] = useState(false)
  const [messageCopied, setMessageCopied] = useState(false)
  const [remoteOrder, setRemoteOrder] = useState<Order | undefined>(undefined)
  const [checked, setChecked] = useState(Boolean(initialOrder))
  const [confirming, setConfirming] = useState(false)

  // Cache peranti dipaparkan serta-merta; server mengemas kininya kemudian.
  const order = remoteOrder ?? initialOrder

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  // Sentiasa semak server supaya status terkini (termasuk pengesahan penjual)
  // muncul walaupun halaman dibuka dari peranti lain.
  useEffect(() => {
    let active = true
    const load = async () => {
      const remote = await fetchOrder(orderId)
      if (!active) return
      if (remote) setRemoteOrder(remote)
      setChecked(true)
    }
    void load()
    const timer = window.setInterval(load, 5_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [fetchOrder, orderId])

  if (!checked && !order) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
        <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-tomato-deep" />
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Memuatkan…</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-cheese/25 text-crust">
          <ReceiptText className="h-10 w-10" />
        </span>
        <h1 className="mt-5 font-display text-3xl tracking-wide text-ink">Tempahan tidak dijumpai</h1>
        <p className="mt-2 text-sm text-muted">
          Nombor tempahan ini tiada pada peranti anda. Cuba jejak menggunakan nombor telefon.
        </p>
        <a href="#/track" className="btn btn-red mt-6 h-11 px-6 text-sm">
          Jejak Tempahan
        </a>
      </div>
    )
  }

  const waLink = `https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`
  const isQr = order.payment === 'qr'
  // Untuk QR DuitNow, pelanggan mesti sahkan bayaran dahulu sebelum WhatsApp dibuka.
  const paymentConfirmed = !isQr || order.paymentStatus !== 'unpaid'

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(order.id)
      setCopied(true)
      notify('Nombor tempahan disalin')
    } catch {
      notify('Gagal menyalin — salin secara manual')
    }
  }

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppMessage(order))
      setMessageCopied(true)
      notify(`Mesej disalin — tampal dalam WhatsApp ${prettyPhone(SHOP.whatsapp)}`)
      window.setTimeout(() => setMessageCopied(false), 2200)
    } catch {
      notify('Gagal menyalin mesej')
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 dots opacity-50" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-basil/10 blur-3xl" />

      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="text-center animate-rise">
          <span className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-basil text-white shadow-[0_20px_50px_-20px_rgba(47,125,79,0.8)]">
            <span className="absolute inset-0 animate-ping rounded-full bg-basil/30" />
            <Check className="h-10 w-10" strokeWidth={3} />
          </span>
          <h1 className="mt-6 font-display text-4xl leading-tight tracking-wide text-ink sm:text-5xl">
            Tempahan disimpan!
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            {isQr && !paymentConfirmed
              ? 'Selesaikan bayaran QR DuitNow di bawah. Tekan “Saya sudah bayar” dahulu — butang WhatsApp akan aktif selepas itu.'
              : isQr && order.paymentStatus === 'pending'
                ? 'Bayaran anda ditandakan menunggu pengesahan. Sekarang hantar butiran tempahan ke WhatsApp kedai.'
                : 'Butiran tempahan sedia untuk dihantar ke WhatsApp. Tekan “Hantar ke WhatsApp”, kemudian tekan send dalam app WhatsApp.'}
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-3 shadow-card">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted">Nombor tempahan</p>
              <p className="font-mono text-sm font-bold tracking-wide text-ink">{order.id}</p>
            </div>
            <button
              type="button"
              onClick={copyId}
              className="ml-1 grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-cream hover:text-ink"
              aria-label="Salin nombor tempahan"
            >
              {copied ? <Check className="h-4 w-4 text-basil" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {paymentConfirmed ? (
            <a href={waLink} target="_blank" rel="noreferrer" className="btn btn-red h-12 px-5 text-sm">
              <MessageCircle className="h-4 w-4" />
              Hantar ke WhatsApp
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Sahkan bayaran QR dahulu"
              className="btn btn-red h-12 px-5 text-sm"
            >
              <Lock className="h-4 w-4" />
              Sahkan bayaran dahulu
            </button>
          )}
          <a href={`#/track?q=${encodeURIComponent(order.id)}`} className="btn btn-ghost h-12 px-5 text-sm">
            Jejak Status
          </a>
          {paymentConfirmed && (
            <button type="button" onClick={copyMessage} className="btn btn-ghost h-12 px-4 text-sm">
              {messageCopied ? <Check className="h-4 w-4 text-basil" /> : <Copy className="h-4 w-4" />}
              Salin mesej
            </button>
          )}
        </div>
        {paymentConfirmed ? (
          <p className="mx-auto mt-3 max-w-lg text-center text-[11px] font-medium leading-relaxed text-muted">
            Jika WhatsApp tidak terbuka, tekan <strong className="text-ink">Hantar ke WhatsApp</strong>{' '}
            sekali lagi — atau <strong className="text-ink">Salin mesej</strong> dan tampal dalam
            WhatsApp kedai {prettyPhone(SHOP.whatsapp)}.
          </p>
        ) : (
          <p className="mx-auto mt-3 max-w-lg text-center text-[11px] font-medium leading-relaxed text-muted">
            Tekan <strong className="text-ink">Saya sudah bayar</strong> dalam bahagian QR di bawah.
            Selepas itu, butang <strong className="text-ink">Hantar ke WhatsApp</strong> akan aktif.
          </p>
        )}

        <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <section className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl tracking-wide text-ink">Status tempahan</h2>
                <StatusBadge status={order.status} />
              </div>
              <div className="mt-6">
                <OrderTimeline status={order.status} />
              </div>
              <p className="mt-5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <Clock className="h-3.5 w-3.5" />
                Dikemas kini {formatDateTime(order.updatedAt)}
              </p>
            </section>

            <section className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
              <h2 className="flex items-center gap-2 font-display text-xl tracking-wide text-ink">
                <ShoppingBag className="h-4 w-4 text-tomato" />
                Pesanan anda
              </h2>
              <ul className="mt-4 space-y-3">
                {order.items.map((item) => (
                  <li key={`${item.itemId}:${item.sizeId}`} className="flex items-center gap-3">
                    <img
                      src={getPizza(item.itemId)?.img ?? '/logo.svg'}
                      alt=""
                      className="h-12 w-12 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-extrabold text-ink">
                        {item.name} <span className="font-medium text-muted">· {item.sizeLabel}</span>
                      </p>
                      <p className="text-[11px] font-medium text-muted">
                        {rm(item.price)} × {item.qty}
                      </p>
                    </div>
                    <span className="text-[13px] font-bold text-ink">{rm(item.price * item.qty)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                <div className="flex justify-between text-muted">
                  <dt>Subtotal</dt>
                  <dd className="font-semibold text-ink">{rm(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-muted">
                  <dt>Penghantaran</dt>
                  <dd className="font-semibold text-ink">
                    {order.deliveryFee === 0 ? 'Percuma' : rm(order.deliveryFee)}
                  </dd>
                </div>
                <div className="flex items-end justify-between border-t border-line pt-2.5">
                  <dt className="font-bold text-ink">Jumlah</dt>
                  <dd className="font-display text-2xl leading-none tracking-wide text-tomato-deep">
                    {rm(order.total)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          {order.payment === 'qr' && (
            <section className="relative order-first overflow-hidden rounded-3xl border border-basil/30 bg-paper p-5 shadow-card sm:p-6 lg:col-span-2">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-basil/10 blur-2xl" />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
                {order.paymentStatus !== 'paid' && (
                  <DuitNowQR amount={order.total} size={200} notify={notify} />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-display text-xl tracking-wide text-ink">
                      <QrCode className="h-4 w-4 text-tomato" />
                      Bayar dengan QR
                    </h2>
                    <PaymentBadge status={order.paymentStatus} />
                  </div>

                  {order.paymentStatus === 'paid' ? (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-basil/30 bg-basil/5 px-4 py-5">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-basil text-white">
                        <ShieldCheck className="h-6 w-6" />
                      </span>
                      <div>
                        <p className="font-display text-xl tracking-wide text-basil">
                          Bayaran diterima
                        </p>
                        <p className="text-[11px] font-medium text-muted">
                          Terima kasih! Tempahan anda sedang diproses.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mt-2 text-[11px] font-medium leading-relaxed text-muted">
                        Scan QR dengan app bank anda, masukkan jumlah{' '}
                        <strong>{rm(order.total)}</strong> secara manual, kemudian sahkan bayaran.
                      </p>
                      <ol className="mt-3 space-y-1.5 text-[11px] font-medium leading-relaxed text-muted">
                        <li>1. Buka TNG / app bank dan pilih DuitNow / Scan QR.</li>
                        <li>
                          2. Scan QR di sebelah, atau simpan QR dan pilih dari galeri.
                        </li>
                        <li>
                          3. Taip jumlah <strong>{rm(order.total)}</strong> — atau tekan jumlah
                          untuk salin, kemudian tampal dalam app bank.
                        </li>
                        <li>4. Sahkan bayaran dalam app.</li>
                        <li>5. Tekan “Saya sudah bayar” di bawah.</li>
                      </ol>
                      <p className="mt-2 text-[10px] leading-relaxed text-muted">
                        QR ini ialah QR asal bank tanpa jumlah tertanam. Ia dipaparkan tanpa diubah
                        supaya boleh dibaca oleh TNG dan semua app bank. Jumlah{' '}
                        <strong>{rm(order.total)}</strong> perlu ditaip sendiri dalam app sebelum
                        bayar.
                      </p>
                      {order.paymentStatus === 'pending' ? (
                        <div className="mt-4 space-y-3">
                          <p className="flex items-start gap-2 rounded-2xl border border-cheese/50 bg-cheese/15 px-3.5 py-3 text-[11px] font-semibold leading-relaxed text-[#7a4f00]">
                            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                            Bayaran menunggu pengesahan penjual. Hantar tempahan ke WhatsApp supaya
                            kedai boleh sahkan. Jika belum bayar, scan QR di atas dahulu.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-red h-11 px-5 text-sm"
                            >
                              <MessageCircle className="h-4 w-4" />
                              Hantar ke WhatsApp
                            </a>
                            <button
                              type="button"
                              onClick={copyMessage}
                              className="btn btn-ghost h-11 px-4 text-sm"
                            >
                              {messageCopied ? (
                                <Check className="h-4 w-4 text-basil" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                              Salin mesej
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={confirming}
                          onClick={async () => {
                            setConfirming(true)
                            // Papar status segera; server mengesahkan kemudian.
                            setRemoteOrder((current) =>
                              current
                                ? {
                                    ...current,
                                    paymentStatus: 'pending',
                                    updatedAt: new Date().toISOString(),
                                  }
                                : current,
                            )
                            try {
                              const saved = await confirmPayment(order.id)
                              if (saved) setRemoteOrder(saved)
                              notify('Terima kasih! Bayaran menunggu pengesahan penjual.')
                            } finally {
                              setConfirming(false)
                            }
                          }}
                          className="btn btn-red mt-4 h-11 w-full text-sm sm:w-auto sm:px-6"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {confirming ? 'Menyimpan…' : 'Saya sudah bayar'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="space-y-5">
            <section className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
              <h2 className="font-display text-xl tracking-wide text-ink">Butiran penghantaran</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Nama</dt>
                <dd className="mt-0.5 font-bold text-ink">{order.name}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Telefon</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-ink">
                  <Phone className="h-3.5 w-3.5 text-muted" />
                  {order.phone}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Cara terima</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {order.fulfilment === 'delivery' ? 'Penghantaran' : 'Ambil sendiri'}
                </dd>
                {order.fulfilment === 'delivery' && order.address && (
                  <dd className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-relaxed text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {order.address}
                  </dd>
                )}
                {order.fulfilment === 'delivery' && order.location && (
                  <dd className="mt-1.5">
                    <a
                      href={locationDirectionsUrl(order.location)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-basil transition hover:underline"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Buka lokasi di peta
                    </a>
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Bayaran</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {paymentLabel(order.payment)}
                  <PaymentBadge status={order.paymentStatus} />
                </dd>
              </div>
              {order.notes && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Nota</dt>
                  <dd className="mt-0.5 rounded-xl bg-cream px-3 py-2 text-[13px] leading-relaxed text-ink/80">
                    {order.notes}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-5 rounded-xl border border-cheese/50 bg-cheese/15 px-3.5 py-2.5 text-[11px] font-semibold leading-relaxed text-[#7a4f00]">
              Simpan nombor tempahan ini untuk semakan dan jejak status.
            </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
