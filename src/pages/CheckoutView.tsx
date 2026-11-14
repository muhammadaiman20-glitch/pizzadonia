import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Bike,
  CheckCircle2,
  Link2,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinned,
  MessageCircle,
  Navigation,
  Phone,
  QrCode,
  StickyNote,
  Store,
  User,
  Wallet,
  X,
} from 'lucide-react'
import { SHOP } from '../config'
import { getPizza } from '../data/menu'
import { buildWhatsAppMessage, cartDetails, deliveryFeeFor } from '../lib/cart'
import { rm } from '../lib/format'
import { getCurrentCoordinates, locationErrorMessage } from '../lib/geolocation'
import { mapsUrl, parseLocationInput } from '../lib/location'
import { openWhatsApp } from '../lib/whatsapp'
import type { NewOrder, Order, OrderLocation, Payment, Fulfilment } from '../types'
import type { CartLine } from '../types'

interface CheckoutViewProps {
  lines: CartLine[]
  onBack: () => void
  onBrowse: () => void
  addOrder: (input: NewOrder) => Order
  clearCart: () => void
  notify: (message: string) => void
  goToOrder: (id: string) => void
}

type Errors = Partial<Record<'name' | 'phone' | 'address', string>>

export function CheckoutView({
  lines,
  onBack,
  onBrowse,
  addOrder,
  clearCart,
  notify,
  goToOrder,
}: CheckoutViewProps) {
  const { items, subtotal, count } = cartDetails(lines)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [fulfilment, setFulfilment] = useState<Fulfilment>('delivery')
  const [address, setAddress] = useState('')
  const [payment, setPayment] = useState<Payment>('cod')
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState<OrderLocation | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [mapInput, setMapInput] = useState('')
  const [mapError, setMapError] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  const shareLocation = async () => {
    setLocationError('')
    setLocating(true)
    try {
      const { lat, lng } = await getCurrentCoordinates()
      setLocation({ lat, lng, url: mapsUrl(lat, lng), source: 'gps' })
      notify('Lokasi berjaya ditanda')
    } catch (error) {
      setLocationError(locationErrorMessage(error))
    } finally {
      setLocating(false)
    }
  }

  const applyMapLink = () => {
    const parsed = parseLocationInput(mapInput)
    if (!parsed) {
      setMapError('Pautan tidak sah. Tampal pautan Google Maps atau koordinat seperti 3.1390, 101.6869.')
      return
    }
    setLocation(parsed)
    setMapInput('')
    setMapError('')
    setLocationError('')
    notify('Lokasi peta ditambah')
  }

  const deliveryFee = deliveryFeeFor(subtotal, fulfilment)
  const total = subtotal + deliveryFee

  const phoneDigits = phone.replace(/\D/g, '')
  const nameMissing = name.trim().length < 2
  const phoneMissing = phoneDigits.length < 9 || phoneDigits.length > 13
  const addressMissing = fulfilment === 'delivery' && address.trim().length < 8
  const missing = [
    ...(nameMissing ? ['nama penuh'] : []),
    ...(phoneMissing ? ['nombor telefon'] : []),
    ...(addressMissing ? ['alamat penghantaran'] : []),
  ]
  const canSubmit = items.length > 0 && missing.length === 0

  const validate = () => {
    const next: Errors = {}
    if (nameMissing) next.name = 'Sila masukkan nama penuh.'
    if (phoneMissing) next.phone = 'Masukkan nombor telefon yang sah.'
    if (addressMissing) next.address = 'Sila masukkan alamat penghantaran yang lengkap.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (items.length === 0) return
    if (!validate()) return

    const order = addOrder({
      name: name.trim(),
      phone: phone.trim(),
      fulfilment,
      address: fulfilment === 'delivery' ? address.trim() : '',
      location: fulfilment === 'delivery' ? location : undefined,
      payment,
      notes: notes.trim(),
      items,
      subtotal,
      deliveryFee,
      total,
    })

    const message = buildWhatsAppMessage(order)
    const url = `https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(message)}`
    // QR tidak terus dibuka dalam WhatsApp: pelanggan perlu sahkan bayaran
    // pada halaman tempahan dahulu, kemudian hantar tempahan ke kedai.
    if (payment === 'qr') {
      clearCart()
      notify('Tempahan disimpan. Buat bayaran QR, kemudian hantar ke WhatsApp.')
    } else {
      const opened = openWhatsApp(url)
      clearCart()
      notify(
        opened
          ? 'Tempahan disimpan! Teruskan hantar dalam WhatsApp.'
          : 'Tempahan disimpan. Tekan butang WhatsApp pada halaman seterusnya.',
      )
    }
    goToOrder(order.id)
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-cheese/25 text-crust">
          <Store className="h-10 w-10" />
        </span>
        <h1 className="mt-5 font-display text-3xl tracking-wide text-ink">Beg anda kosong</h1>
        <p className="mt-2 text-sm text-muted">Pilih pizza dahulu sebelum meneruskan tempahan.</p>
        <button type="button" onClick={onBrowse} className="btn btn-red mt-6 h-11 px-6 text-sm">
          Lihat Menu
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke menu
      </button>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="section-label">Langkah terakhir</p>
          <h1 className="mt-2 font-display text-4xl tracking-wide text-ink sm:text-5xl">
            Selesaikan tempahan
          </h1>
        </div>
        <p className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-bold text-muted">
          {count} item
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-7 grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-tomato/10 text-tomato">
                <User className="h-4 w-4" />
              </span>
              <h2 className="font-display text-xl tracking-wide text-ink">Maklumat anda</h2>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="label">
                  Nama penuh
                </label>
                <input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="field"
                  placeholder="Cth: Aiman Yahya"
                  autoComplete="name"
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name && <p className="error-text">{errors.name}</p>}
              </div>
              <div>
                <label htmlFor="phone" className="label">
                  Nombor telefon
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="field pl-9"
                    placeholder="012-345 6789"
                    inputMode="tel"
                    autoComplete="tel"
                    aria-invalid={Boolean(errors.phone)}
                  />
                </div>
                {errors.phone && <p className="error-text">{errors.phone}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-tomato/10 text-tomato">
                <Bike className="h-4 w-4" />
              </span>
              <h2 className="font-display text-xl tracking-wide text-ink">Cara terima</h2>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {[
                {
                  id: 'delivery' as const,
                  icon: Bike,
                  title: 'Penghantaran',
                  desc: deliveryFeeFor(subtotal, 'delivery') === 0 ? 'Percuma untuk tempahan ini' : `Caj ${rm(SHOP.delivery.fee)} · dalam ${SHOP.delivery.maxKm}km`,
                },
                {
                  id: 'pickup' as const,
                  icon: Store,
                  title: 'Ambil sendiri',
                  desc: 'Siap dalam 20–25 minit',
                },
              ].map((option) => {
                const Icon = option.icon
                const active = fulfilment === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFulfilment(option.id)}
                    aria-pressed={active}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                      active
                        ? 'border-tomato bg-tomato/5 ring-1 ring-tomato/20'
                        : 'border-line bg-cream hover:border-crust/40'
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        active ? 'bg-tomato text-white' : 'bg-white text-muted'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold text-ink">{option.title}</span>
                      <span className="mt-0.5 block text-[11px] font-medium text-muted">{option.desc}</span>
                    </span>
                    {active && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-tomato" />}
                  </button>
                )
              })}
            </div>

            {fulfilment === 'delivery' && (
              <>
                <div className="mt-4">
                  <label htmlFor="address" className="label">
                    Alamat penghantaran
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
                    <textarea
                      id="address"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      rows={3}
                      className="field resize-none pl-9"
                      placeholder="No. rumah, jalan, taman, poskod"
                      aria-invalid={Boolean(errors.address)}
                    />
                  </div>
                  {errors.address && <p className="error-text">{errors.address}</p>}
                </div>

                <div className="mt-4 rounded-2xl border border-line bg-cream/60 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                        <MapPinned className="h-3.5 w-3.5 text-crust" />
                        Lokasi peta{' '}
                        <span className="font-medium normal-case tracking-normal text-muted/70">
                          (pilihan)
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] font-medium leading-relaxed text-muted">
                        Tanda lokasi rumah supaya penghantar mudah cari.
                      </p>
                    </div>
                    {location && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-basil/10 px-2 py-0.5 text-[10px] font-bold text-basil">
                        <CheckCircle2 className="h-3 w-3" /> Lokasi ditanda
                      </span>
                    )}
                  </div>

                  {location ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-basil/25 bg-basil/5 px-3 py-2.5">
                      <MapPin className="h-4 w-4 shrink-0 text-basil" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold text-ink">
                          {location.lat !== undefined && location.lng !== undefined
                            ? `${location.lat}, ${location.lng}`
                            : 'Pautan peta ditambah'}
                        </span>
                        <span className="block text-[10px] font-medium text-muted">
                          {location.source === 'gps'
                            ? 'Lokasi semasa peranti'
                            : 'Pautan yang ditampal'}
                        </span>
                      </span>
                      <a
                        href={location.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-basil/30 bg-paper px-2.5 text-[10px] font-bold text-basil transition hover:bg-basil/10"
                      >
                        <Navigation className="h-3 w-3" />
                        Lihat
                      </a>
                      <button
                        type="button"
                        onClick={() => setLocation(null)}
                        className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-paper hover:text-tomato"
                        aria-label="Buang lokasi peta"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2.5">
                      <button
                        type="button"
                        onClick={() => void shareLocation()}
                        disabled={locating}
                        className="btn btn-ghost h-10 w-full text-[11px]"
                      >
                        {locating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LocateFixed className="h-3.5 w-3.5" />
                        )}
                        {locating ? 'Mendapatkan lokasi…' : 'Kongsi lokasi semasa'}
                      </button>
                      {locationError && (
                        <p className="text-[11px] font-medium leading-relaxed text-tomato-deep">
                          {locationError}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/60">
                        <span className="h-px flex-1 bg-line" />
                        atau
                        <span className="h-px flex-1 bg-line" />
                      </div>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                          <input
                            value={mapInput}
                            onChange={(event) => {
                              setMapInput(event.target.value)
                              setMapError('')
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                applyMapLink()
                              }
                            }}
                            className="field h-10 py-0 pl-9 text-xs"
                            placeholder="Tampal pautan Google Maps"
                            aria-label="Pautan Google Maps"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={applyMapLink}
                          className="btn btn-ghost h-10 px-4 text-[11px]"
                        >
                          Guna
                        </button>
                      </div>
                      {mapError && (
                        <p className="text-[11px] font-medium leading-relaxed text-tomato-deep">
                          {mapError}
                        </p>
                      )}
                      <p className="text-[10px] leading-relaxed text-muted">
                        Cara dapat pautan: buka Google Maps → tekan lama rumah anda → Kongsi →
                        Salin pautan.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-tomato/10 text-tomato">
                <Wallet className="h-4 w-4" />
              </span>
              <h2 className="font-display text-xl tracking-wide text-ink">Cara bayaran</h2>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              {[
                { id: 'cod' as const, icon: Banknote, title: 'Tunai (COD)', desc: 'Bayar semasa terima' },
                { id: 'transfer' as const, icon: Wallet, title: 'Transfer bank', desc: 'Butiran diberi di WhatsApp' },
                { id: 'qr' as const, icon: QrCode, title: 'QR DuitNow', desc: 'Scan & bayar terus' },
              ].map((option) => {
                const Icon = option.icon
                const active = payment === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPayment(option.id)}
                    aria-pressed={active}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                      active
                        ? 'border-tomato bg-tomato/5 ring-1 ring-tomato/20'
                        : 'border-line bg-cream hover:border-crust/40'
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        active ? 'bg-tomato text-white' : 'bg-white text-muted'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-extrabold text-ink">{option.title}</span>
                      <span className="mt-0.5 block text-[11px] font-medium text-muted">{option.desc}</span>
                    </span>
                    {active && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-tomato" />}
                  </button>
                )
              })}
            </div>

            {payment === 'qr' && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-basil/25 bg-basil/5 px-3.5 py-3 text-[11px] font-semibold leading-relaxed text-basil">
                <QrCode className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Selepas tempahan disimpan, QR DuitNow asal akan dipaparkan. Scan, masukkan jumlah{' '}
                  <strong>{rm(total)}</strong> secara manual, tekan{' '}
                  <strong>“Saya sudah bayar”</strong>, kemudian hantar tempahan ke WhatsApp. Butang
                  WhatsApp hanya aktif selepas bayaran disahkan.
                </span>
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="notes" className="label">
                Nota tambahan <span className="font-medium text-muted/70">(pilihan)</span>
              </label>
              <div className="relative">
                <StickyNote className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  className="field resize-none pl-9"
                  placeholder="Cth: potong 8 bahagian, kurangkan pedas"
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24">
          <div className="rounded-3xl border border-line bg-paper p-5 shadow-card sm:p-6">
            <h2 className="font-display text-xl tracking-wide text-ink">Ringkasan tempahan</h2>
            <ul className="mt-4 space-y-3">
              {items.map((item) => (
                <li key={`${item.itemId}:${item.sizeId}`} className="flex items-start gap-3">
                  <img
                    src={getPizza(item.itemId)?.img ?? '/logo.svg'}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-extrabold leading-snug text-ink">
                      {item.name}{' '}
                      <span className="font-medium text-muted">· {item.sizeLabel}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-muted">
                      {rm(item.price)} × {item.qty}
                    </p>
                  </div>
                  <span className="text-[13px] font-bold text-ink">{rm(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between text-muted">
                <dt>Subtotal</dt>
                <dd className="font-semibold text-ink">{rm(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Penghantaran</dt>
                <dd className="font-semibold text-ink">
                  {deliveryFee === 0 ? 'Percuma' : rm(deliveryFee)}
                </dd>
              </div>
              <div className="flex items-end justify-between border-t border-line pt-3">
                <dt className="text-sm font-bold text-ink">Jumlah</dt>
                <dd className="font-display text-3xl leading-none tracking-wide text-tomato-deep">
                  {rm(total)}
                </dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={!canSubmit}
              title={canSubmit ? undefined : `Lengkapkan: ${missing.join(', ')}`}
              className="btn btn-red mt-5 h-12 w-full text-sm"
            >
              {payment === 'qr' ? (
                <QrCode className="h-4 w-4" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              {payment === 'qr' ? 'Teruskan ke bayaran QR' : 'Hantar ke WhatsApp'}
            </button>
            {canSubmit ? (
              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-bold text-basil">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Semua maklumat lengkap
              </p>
            ) : (
              <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-cream px-3 py-2 text-[11px] font-medium leading-relaxed text-muted">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tomato" />
                <span>
                  Lengkapkan{' '}
                  <strong className="font-bold text-ink">{missing.join(', ')}</strong> untuk
                  meneruskan tempahan.
                </span>
              </p>
            )}
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
              {payment === 'qr'
                ? 'Tempahan disimpan dahulu. QR DuitNow dipaparkan untuk bayaran, dan WhatsApp hanya dibuka selepas anda tekan “Saya sudah bayar”.'
                : 'Tempahan akan dibuka dalam WhatsApp untuk pengesahan. Tiada bayaran dalam talian.'}
            </p>

            <div className="mt-4 flex items-center justify-center gap-4 border-t border-line pt-4 text-[10px] font-semibold text-muted">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-basil" /> Disahkan manual
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-basil" /> Data peribadi selamat
              </span>
            </div>
          </div>
        </aside>
      </form>
    </div>
  )
}
