import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  Clock,
  MapPin,
  Navigation,
  QrCode,
  ReceiptText,
  Search,
  ShoppingBag,
  Store,
  Wallet,
} from 'lucide-react'
import { formatDateTime, rm, timeAgo } from '../lib/format'
import { SHOP } from '../config'
import { locationDirectionsUrl } from '../lib/location'
import { paymentLabel } from '../lib/payment'
import type { Order } from '../types'
import { OrderTimeline } from '../components/OrderTimeline'
import { PaymentBadge } from '../components/PaymentBadge'
import { StatusBadge } from '../components/StatusBadge'

interface TrackViewProps {
  /** Tempahan yang disimpan pada peranti ini (untuk senarai ringkas). */
  recentOrders: Order[]
  initialQuery?: string
  /** Cari melalui API awam; fallback cache peranti dilakukan oleh hook. */
  onSearch: (query: string) => Promise<Order[]>
}

export function TrackView({ recentOrders, initialQuery = '', onSearch }: TrackViewProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Order[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const search = useCallback(async (value: string) => {
    const text = value.trim()
    if (!text) {
      setError('Masukkan nombor tempahan atau nombor telefon.')
      setResults(null)
      return
    }

    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const found = await onSearch(text)
      if (found.length === 0) {
        setError('Tiada tempahan dijumpai. Semak semula nombor anda.')
        setResults(null)
        setSelectedId(null)
        return
      }
      setResults(found)
      setSelectedId(found[0].id)
    } catch {
      setError('Gagal mencari tempahan. Periksa sambungan dan cuba lagi.')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [onSearch])

  useEffect(() => {
    // Carian awal daripada pautan `#/track?q=...`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialQuery) void search(initialQuery)
  }, [initialQuery, search])

  const selected = results?.find((order) => order.id === selectedId) ?? results?.[0]

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 dots opacity-50" />
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-tomato/10 text-tomato">
            <ReceiptText className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-4xl tracking-wide text-ink sm:text-5xl">
            Jejak tempahan
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Masukkan nombor tempahan (cth. PZ-261113-1234) atau nombor telefon yang digunakan
            semasa menempah.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void search(query)
          }}
          className="mx-auto mt-7 max-w-xl"
        >
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-paper p-2 shadow-card sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full rounded-xl border-0 bg-transparent pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted/70"
                placeholder="PZ-261113-1234 atau 0123456789"
                aria-label="Nombor tempahan atau telefon"
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-red h-11 px-5 text-sm">
              {loading ? 'Mencari…' : 'Jejak'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="mt-2 text-center text-xs font-semibold text-tomato-deep">{error}</p>}
        </form>

        {results && results.length > 1 && (
          <div className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
            {results.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedId(order.id)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  selected?.id === order.id
                    ? 'border-ink bg-ink text-cream'
                    : 'border-line bg-paper text-muted hover:text-ink'
                }`}
              >
                {order.id} · {order.name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1.1fr_0.9fr] animate-rise">
            <section className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted">
                    Nombor tempahan
                  </p>
                  <p className="font-mono text-sm font-bold text-ink">{selected.id}</p>
                </div>
                <StatusBadge status={selected.status} />
              </div>
              <div className="mt-6">
                <OrderTimeline status={selected.status} />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-4 text-[11px] font-medium text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Ditempah {formatDateTime(selected.createdAt)}
                </span>
                <span>Dikemas kini {timeAgo(selected.updatedAt)}</span>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <a href={`#/order/${selected.id}`} className="btn btn-red h-10 flex-1 text-xs">
                  Buka halaman tempahan
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <a
                  href={`https://wa.me/${SHOP.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost h-10 flex-1 text-xs"
                >
                  WhatsApp kedai
                </a>
              </div>
            </section>

            <section className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
              <h2 className="flex items-center gap-2 font-display text-xl tracking-wide text-ink">
                <ShoppingBag className="h-4 w-4 text-tomato" />
                Butiran
              </h2>
              <ul className="mt-4 space-y-2.5">
                {selected.items.map((item) => (
                  <li key={`${item.itemId}:${item.sizeId}`} className="flex justify-between gap-2 text-[13px]">
                    <span className="text-ink">
                      {item.name} <span className="text-muted">({item.sizeLabel})</span>{' '}
                      <span className="font-bold">×{item.qty}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-ink">{rm(item.price * item.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
                <span className="text-sm font-bold text-ink">Jumlah</span>
                <span className="font-display text-2xl tracking-wide text-tomato-deep">{rm(selected.total)}</span>
              </div>
              <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-xs">
                <div className="flex items-center gap-2 text-muted">
                  <Store className="h-3.5 w-3.5" />
                  {selected.fulfilment === 'delivery' ? 'Penghantaran' : 'Ambil sendiri'}
                </div>
                {selected.address && (
                  <div className="flex items-start gap-2 text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {selected.address}
                  </div>
                )}
                {selected.location && (
                  <div className="flex items-center gap-2">
                    <Navigation className="h-3.5 w-3.5" />
                    <a
                      href={locationDirectionsUrl(selected.location)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-basil transition hover:underline"
                    >
                      Buka lokasi di peta
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted">
                  <Wallet className="h-3.5 w-3.5" />
                  {paymentLabel(selected.payment)}
                  <PaymentBadge status={selected.paymentStatus} />
                </div>
              </dl>
              {selected.payment === 'qr' && selected.paymentStatus !== 'paid' && (
                <a
                  href={`#/order/${encodeURIComponent(selected.id)}`}
                  className="btn btn-red mt-4 h-11 w-full text-xs"
                >
                  <QrCode className="h-4 w-4" />
                  {selected.paymentStatus === 'unpaid'
                    ? 'Buat bayaran QR'
                    : 'Hantar tempahan ke WhatsApp'}
                </a>
              )}
            </section>
          </div>
        )}

        {!results && !searched && recentOrders.length > 0 && (
          <div className="mx-auto mt-10 max-w-xl">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              Tempahan terkini pada peranti ini
            </p>
            <ul className="mt-3 space-y-2">
              {recentOrders.slice(0, 4).map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(order.id)
                      setResults([order])
                      setSelectedId(order.id)
                      setError('')
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-left shadow-card transition hover:border-crust/40 hover:bg-cream"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] font-bold text-ink">{order.id}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {order.name} · {timeAgo(order.createdAt)}
                      </span>
                    </span>
                    <StatusBadge status={order.status} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
