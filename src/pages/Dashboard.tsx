import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight,
  Banknote,
  Bike,
  CheckCircle2,
  ClipboardList,
  Copy,
  Flame,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Navigation,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  TrendingUp,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SHOP, STATUS_META, type OrderStatus } from '../config'
import {
  clearAdminToken,
  getAdminToken,
  loginAdmin,
  onAuthExpired,
} from '../lib/api'
import { formatDateTime, isToday, rm, timeAgo } from '../lib/format'
import { locationDirectionsUrl } from '../lib/location'
import { statusWhatsAppLink, waPhone } from '../lib/notify'
import { paymentLabel } from '../lib/payment'
import type { Order, PaymentStatus } from '../types'
import { Logo } from '../components/Logo'
import { PaymentBadge } from '../components/PaymentBadge'
import { StatusBadge } from '../components/StatusBadge'

interface DashboardProps {
  orders: Order[]
  /** Cache peranti untuk paparan segera sebelum D1 menjawab. */
  fallbackOrders: Order[]
  source: 'local' | 'server'
  adminState: 'idle' | 'loading' | 'ready' | 'error'
  adminError: string
  loadAdminOrders: () => Promise<void>
  updateStatus: (id: string, status: OrderStatus) => void
  advanceStatus: (id: string) => void
  setPaymentStatus: (id: string, paymentStatus: PaymentStatus) => void
  deleteOrder: (id: string) => void
  clearAll: () => void
  notify: (message: string) => void
}

type Filter = 'semua' | OrderStatus

const FILTERS: Filter[] = ['semua', 'baru', 'diterima', 'dibakar', 'siap', 'selesai', 'batal']

function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (checking) return

    const value = pin.trim()
    if (!value) {
      setError('Masukkan PIN akaun penjual.')
      return
    }

    setChecking(true)
    setError('')
    try {
      // PIN disemak oleh Worker. Token sesi yang dipulangkan digunakan
      // untuk panggilan dashboard seterusnya.
      await loginAdmin(value)
      onSuccess()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'PIN tidak betul. Cuba lagi.')
      setPin('')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 dots opacity-60" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-tomato/10 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="flex justify-center">
          <Logo href={null} src="/logo-seller.svg" />
        </div>
        <form
          onSubmit={submit}
          className="mt-6 rounded-3xl border border-line bg-paper p-6 shadow-card sm:p-7"
        >
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ink text-cheese">
            <Lock className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-center font-display text-2xl tracking-wide text-ink">
            Dashboard penjual
          </h1>
          <p className="mt-1.5 text-center text-xs leading-relaxed text-muted">
            Masukkan PIN akaun penjual. Hanya akaun sebenar dibenarkan masuk.
          </p>

          <label htmlFor="pin" className="label mt-6">
            PIN akaun penjual
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value.replace(/\D/g, '').slice(0, 32))
              setError('')
            }}
            className="field text-center text-lg tracking-[0.5em]"
            placeholder="••••"
            maxLength={32}
            disabled={checking}
            autoFocus
          />
          {error && <p className="error-text text-center">{error}</p>}

          <button
            type="submit"
            className="btn btn-red mt-4 h-11 w-full text-sm"
            disabled={checking}
          >
            {checking ? 'Menyemak…' : 'Masuk Dashboard'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'cream',
}: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  tone?: 'cream' | 'tomato' | 'cheese' | 'basil' | 'ink'
}) {
  const tones = {
    cream: 'bg-paper border-line text-ink',
    tomato: 'bg-tomato/5 border-tomato/20 text-tomato-deep',
    cheese: 'bg-cheese/15 border-cheese/50 text-[#7a4f00]',
    basil: 'bg-basil/5 border-basil/20 text-basil',
    ink: 'bg-ink border-ink text-cream',
  }[tone]
  const iconTone = {
    cream: 'bg-cream text-ink',
    tomato: 'bg-tomato/10 text-tomato',
    cheese: 'bg-cheese/40 text-[#7a4f00]',
    basil: 'bg-basil/10 text-basil',
    ink: 'bg-white/10 text-cheese',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 shadow-card ${tones}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconTone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 font-display text-[1.4rem] leading-none tracking-wide min-[400px]:text-[1.75rem]">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">{label}</p>
      <p className="mt-1.5 text-[10px] font-medium opacity-60">{hint}</p>
    </div>
  )
}

function OrderCard({
  order,
  updateStatus,
  advanceStatus,
  setPaymentStatus,
  deleteOrder,
  notify,
}: {
  order: Order
  updateStatus: (id: string, status: OrderStatus) => void
  advanceStatus: (id: string) => void
  setPaymentStatus: (id: string, paymentStatus: PaymentStatus) => void
  deleteOrder: (id: string) => void
  notify: (message: string) => void
}) {
  const next = STATUS_META[order.status].next
  const active = order.status === 'baru'

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(order.id)
      notify('Nombor tempahan disalin')
    } catch {
      notify('Gagal menyalin nombor tempahan')
    }
  }

  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-paper shadow-card transition ${
        active ? 'border-tomato/40 ring-1 ring-tomato/10' : 'border-line'
      }`}
    >
      <div className="flex flex-col gap-2.5 border-b border-line bg-cream/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          {active && <span className="h-2 w-2 animate-pulse rounded-full bg-tomato" />}
          <button
            type="button"
            onClick={copyId}
            className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-ink transition hover:text-tomato"
            title="Salin nombor tempahan"
          >
            {order.id}
            <Copy className="h-3 w-3 text-muted" />
          </button>
          <span className="text-[11px] font-medium text-muted">
            {timeAgo(order.createdAt)} · {formatDateTime(order.createdAt)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <PaymentBadge status={order.paymentStatus} />
          <select
            value={order.status}
            onChange={(event) => {
              updateStatus(order.id, event.target.value as OrderStatus)
              notify(`Status ${order.id} dikemas kini`)
            }}
            className="h-8 rounded-lg border border-line bg-paper px-2 text-[11px] font-bold text-ink outline-none transition focus:border-crust focus:ring-2 focus:ring-cheese/40"
            aria-label={`Tukar status ${order.id}`}
          >
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tomato/10 font-display text-base tracking-wide text-tomato-deep">
              {order.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-ink">{order.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted">
                <a
                  href={`https://wa.me/${waPhone(order.phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-basil transition hover:underline"
                >
                  <MessageCircle className="h-3 w-3" />
                  {order.phone}
                </a>
                <span className="inline-flex items-center gap-1">
                  {order.fulfilment === 'delivery' ? <Bike className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                  {order.fulfilment === 'delivery' ? 'Penghantaran' : 'Ambil sendiri'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  {paymentLabel(order.payment)}
                </span>
              </div>
            </div>
          </div>

          <ul className="mt-4 space-y-1.5 rounded-2xl border border-line bg-cream/50 p-3">
            {order.items.map((item) => (
              <li key={`${item.itemId}:${item.sizeId}`} className="flex justify-between gap-2 text-[12px]">
                <span className="text-ink">
                  <span className="font-bold">{item.qty}×</span> {item.name}{' '}
                  <span className="text-muted">({item.sizeLabel})</span>
                </span>
                <span className="shrink-0 font-semibold text-ink">{rm(item.price * item.qty)}</span>
              </li>
            ))}
          </ul>

          {order.notes && (
            <p className="mt-3 rounded-xl border border-cheese/40 bg-cheese/10 px-3 py-2 text-[11px] leading-relaxed text-[#6f4a00]">
              <span className="font-bold">Nota:</span> {order.notes}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {order.fulfilment === 'delivery' && order.address ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-2xl border border-line bg-cream/50 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-crust" />
                {order.address}
              </div>
              {order.location && (
                <a
                  href={locationDirectionsUrl(order.location)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-basil/30 bg-basil/5 px-3 py-2 text-[11px] font-bold text-basil transition hover:bg-basil/10"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Navigasi ke lokasi pelanggan
                </a>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-cream/50 px-3 py-2.5 text-[11px] font-semibold text-muted">
              <Store className="h-3.5 w-3.5 text-crust" />
              Pelanggan akan ambil sendiri di kedai
            </div>
          )}

          <div className="mt-auto rounded-2xl border border-line px-3.5 py-3">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Subtotal</span>
              <span className="font-semibold text-ink">{rm(order.subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>Penghantaran</span>
              <span className="font-semibold text-ink">
                {order.deliveryFee === 0 ? 'Percuma' : rm(order.deliveryFee)}
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between border-t border-line pt-2">
              <span className="text-xs font-bold text-ink">Jumlah</span>
              <span className="font-display text-2xl leading-none tracking-wide text-tomato-deep">
                {rm(order.total)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {next && (
              <button
                type="button"
                onClick={() => {
                  advanceStatus(order.id)
                  notify(`Status ${order.id} → ${STATUS_META[next].label}`)
                }}
                className="btn btn-red h-9 flex-1 px-3 text-[11px]"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {STATUS_META[next].label}
              </button>
            )}
            {order.paymentStatus !== 'paid' && order.status !== 'batal' && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Sahkan bayaran ${rm(order.total)} untuk ${order.id}?`)) {
                    setPaymentStatus(order.id, 'paid')
                    notify(`Bayaran ${order.id} disahkan`)
                  }
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-basil/30 bg-basil/5 px-3 text-[11px] font-bold text-basil transition hover:bg-basil/10"
                title="Tandakan bayaran sebagai diterima"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Sahkan bayaran
              </button>
            )}
            <a
              href={statusWhatsAppLink(order)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-basil/30 bg-basil/5 px-3 text-[11px] font-bold text-basil transition hover:bg-basil/10"
              title="Hantar kemas kini status ke WhatsApp pelanggan"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Notifikasi
            </a>
            {order.status !== 'batal' && order.status !== 'selesai' && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Batalkan tempahan ${order.id}?`)) {
                    updateStatus(order.id, 'batal')
                    notify(`Tempahan ${order.id} dibatalkan`)
                  }
                }}
                className="grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-muted transition hover:border-tomato/30 hover:text-tomato"
                aria-label={`Batalkan tempahan ${order.id}`}
                title="Batalkan tempahan"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Padam tempahan ${order.id} secara kekal?`)) {
                  deleteOrder(order.id)
                  notify('Tempahan dipadam')
                }
              }}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-muted transition hover:border-tomato/30 hover:text-tomato"
              aria-label={`Padam tempahan ${order.id}`}
              title="Padam tempahan"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export function Dashboard({
  orders,
  fallbackOrders,
  source,
  adminState,
  adminError,
  loadAdminOrders,
  updateStatus,
  advanceStatus,
  setPaymentStatus,
  deleteOrder,
  clearAll,
  notify,
}: DashboardProps) {
  const [authed, setAuthed] = useState(() => Boolean(getAdminToken()))
  const [filter, setFilter] = useState<Filter>('semua')
  const [search, setSearch] = useState('')

  // Jika pelayan menolak token (tamat tempoh / PIN ditukar), kembali ke
  // skrin log masuk serta-merta.
  useEffect(
    () =>
      onAuthExpired(() => {
        setAuthed(false)
        notify('Sesi tamat. Sila log masuk semula.')
      }),
    [notify],
  )

  // Gabungkan senarai D1 dengan cache peranti: tempahan yang baru dicipta
  // pada peranti ini terus kelihatan walaupun senarai D1 belum selesai
  // dimuatkan. Rekod D1 mengatasi cache jika ID sama.
  const visibleOrders = useMemo(() => {
    const merged = new Map<string, Order>()
    for (const order of fallbackOrders) merged.set(order.id, order)
    for (const order of orders) merged.set(order.id, order)
    return [...merged.values()]
  }, [orders, fallbackOrders])

  // Muatkan senarai penuh dari D1 selepas sesi disahkan, dan semak semula
  // secara berkala supaya tempahan baru muncul tanpa refresh manual.
  useEffect(() => {
    if (!authed) return
    void loadAdminOrders()
    const timer = window.setInterval(() => {
      void loadAdminOrders()
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [authed, loadAdminOrders])

  const sorted = useMemo(
    () => [...visibleOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [visibleOrders],
  )

  const todayOrders = sorted.filter((order) => isToday(order.createdAt))
  const revenue = todayOrders
    .filter((order) => order.status !== 'batal')
    .reduce((sum, order) => sum + order.total, 0)
  const newCount = sorted.filter((order) => order.status === 'baru').length
  const pendingPayments = sorted.filter(
    (order) => order.paymentStatus !== 'paid' && order.status !== 'batal',
  ).length
  const activeCount = sorted.filter(
    (order) => order.status === 'diterima' || order.status === 'dibakar' || order.status === 'siap',
  ).length

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([['semua', sorted.length]])
    FILTERS.slice(1).forEach((key) => {
      map.set(key, sorted.filter((order) => order.status === key).length)
    })
    return map
  }, [sorted])

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase()
    return sorted.filter((order) => {
      const matchesFilter = filter === 'semua' || order.status === filter
      if (!matchesFilter) return false
      if (!text) return true
      return (
        order.id.toLowerCase().includes(text) ||
        order.name.toLowerCase().includes(text) ||
        order.phone.replace(/\D/g, '').includes(text.replace(/\D/g, ''))
      )
    })
  }, [sorted, filter, search])

  if (!authed) return <PinGate onSuccess={() => setAuthed(true)} />

  const dateLabel = new Intl.DateTimeFormat('ms-MY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  const logout = () => {
    clearAdminToken()
    setAuthed(false)
    notify('Anda telah log keluar')
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo href={null} src="/logo-seller.svg" />
            <span className="hidden rounded-full bg-ink px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.16em] text-cheese sm:inline-flex">
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={logout} className="btn btn-ghost h-9 px-3.5 text-[11px]">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Log Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {adminState === 'error' && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 rounded-2xl border border-tomato/30 bg-tomato/5 px-4 py-3 text-[11px] font-semibold text-tomato-deep sm:flex-row sm:items-center sm:justify-between">
            <p>
              API tidak tersedia — memaparkan tempahan pada peranti ini. {adminError}
            </p>
            <button
              type="button"
              onClick={() => void loadAdminOrders()}
              className="btn btn-ghost h-8 self-start px-3 text-[10px] sm:self-auto"
            >
              Cuba lagi
            </button>
          </div>
        </div>
      )}

      {adminState === 'loading' && visibleOrders.length === 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-3 text-[11px] font-semibold text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-tomato-deep" />
            Memuatkan tempahan dari D1…
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-tomato-deep">Pusat tempahan</p>
            <h1 className="mt-1.5 font-display text-3xl leading-tight tracking-wide text-ink sm:text-4xl">
              Selamat kembali 👋
            </h1>
            <p className="mt-1.5 text-xs font-medium capitalize text-muted">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {source === 'server' && (
              <span className="rounded-full border border-cheese/60 bg-cheese/15 px-3 py-1.5 text-[10px] font-bold text-[#7a4f00]">
                Data awan · D1
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Padam SEMUA tempahan? Tindakan ini tidak boleh diundur.')) {
                  clearAll()
                  notify('Semua tempahan dipadam')
                }
              }}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-muted transition hover:border-tomato/30 hover:text-tomato"
              aria-label="Padam semua tempahan"
              title="Padam semua tempahan"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Banknote}
            label="Jualan hari ini"
            value={rm(revenue)}
            hint={`${todayOrders.length} tempahan hari ini`}
            tone="ink"
          />
          <StatCard
            icon={ShoppingBag}
            label="Order baru"
            value={String(newCount)}
            hint="Menunggu pengesahan"
            tone="tomato"
          />
          <StatCard
            icon={Flame}
            label="Sedang diproses"
            value={String(activeCount)}
            hint="Diterima, dibakar, sedia"
            tone="cheese"
          />
          <StatCard
            icon={TrendingUp}
            label="Jumlah tempahan"
            value={String(sorted.length)}
            hint={source === 'server' ? 'Semua rekod dalam D1' : 'Semua rekod pada peranti'}
            tone="basil"
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-paper p-3 shadow-card lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Tapis status">
            {FILTERS.map((key) => {
              const active = filter === key
              const label = key === 'semua' ? 'Semua' : STATUS_META[key].short
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-extrabold transition ${
                    active ? 'bg-ink text-cream' : 'text-muted hover:bg-cream hover:text-ink'
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                      active ? 'bg-white/15 text-cream' : 'bg-cream text-muted'
                    }`}
                  >
                    {counts.get(key) ?? 0}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="relative lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="field h-10 py-0 pl-9 pr-8 text-xs"
              placeholder="Cari nama, telefon, no. tempahan"
              aria-label="Cari tempahan"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-cream hover:text-ink"
                aria-label="Kosongkan carian"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide text-ink">
            <ClipboardList className="h-5 w-5 text-tomato" />
            Tempahan masuk
          </h2>
          <div className="flex items-center gap-2">
            {pendingPayments > 0 && (
              <span className="rounded-full border border-cheese/50 bg-cheese/15 px-2.5 py-1 text-[10px] font-bold text-[#7a4f00]">
                {pendingPayments} bayaran belum selesai
              </span>
            )}
            <p className="text-[11px] font-bold text-muted">{filtered.length} dipaparkan</p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-paper px-6 py-16 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-cream text-muted">
                <ClipboardList className="h-8 w-8" />
              </span>
              <p className="mt-4 font-display text-xl tracking-wide text-ink">Tiada tempahan</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
                {search || filter !== 'semua'
                  ? 'Tiada tempahan sepadan dengan tapisan ini. Cuba tukar tapisan atau carian.'
                  : 'Tempahan baru akan muncul di sini secara automatik.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilter('semua')
                  setSearch('')
                }}
                className="btn btn-ghost mt-4 h-9 px-4 text-[11px]"
              >
                Set semula tapisan
              </button>
            </div>
          ) : (
            filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                updateStatus={updateStatus}
                advanceStatus={advanceStatus}
                setPaymentStatus={setPaymentStatus}
                deleteOrder={deleteOrder}
                notify={notify}
              />
            ))
          )}
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 rounded-2xl border border-line bg-paper px-4 py-3 text-[10px] font-medium text-muted sm:flex-row">
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-basil" />
            {source === 'server'
              ? 'Semua perubahan disimpan ke Cloudflare D1 dan dikongsi semua peranti.'
              : 'API tidak tersedia — perubahan disimpan pada peranti ini (localStorage).'}
          </p>
          <p>
            WhatsApp kedai: +{SHOP.whatsapp}
          </p>
        </div>
      </div>
    </div>
  )
}
