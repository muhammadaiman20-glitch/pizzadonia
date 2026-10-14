import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Banknote, Bike, Flame, MapPin, Minus, Plus, ShoppingBag, Store, Trash2, UserRound, X } from 'lucide-react'
import Logo from '../components/Logo.jsx'
import { cartApi, cartKey, cartLines, fmtDay, go, ownerSession, rm, store, useAccount, useCart, useShop } from '../lib.js'


export function Header({ onCart, count }) {
  const { shop } = useShop()
  const acc = useAccount()
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Logo />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {shop && (
            <span className={`hidden items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold sm:inline-flex ${shop.open ? 'bg-basil/10 text-basil' : 'bg-tomato/10 text-tomato'}`}>
              <span className={`size-2 rounded-full ${shop.open ? 'bg-basil' : 'bg-tomato'}`} /> {shop.open ? 'Dibuka sekarang' : 'Tutup'}
            </span>
          )}
          {ownerSession.get() && (
            <a href="#/admin" className="btn bg-ink px-3 py-2 text-[13px] text-white" aria-label="Seller page"><Store className="size-4" /> <span className="hidden sm:inline">Seller</span></a>
          )}
          <a href="#/akaun" className="btn btn-ghost px-3 py-2 text-[14px]" aria-label={acc ? `Akaun ${acc.name}` : 'Log masuk'}>
            {acc ? (
              <span className="grid size-[22px] place-items-center rounded-full bg-tomato text-[12px] font-extrabold text-white">{acc.name.slice(0, 1).toUpperCase()}</span>
            ) : (
              <UserRound className="size-[18px]" />
            )}
            <span className="hidden sm:inline">{acc ? 'Pesanan saya' : 'Log masuk'}</span>
          </a>
          {onCart && (
            <button onClick={onCart} className="btn btn-ghost relative px-4 py-2 text-[14px]" aria-label={`Troli, ${count} item`}>
              <ShoppingBag className="size-[18px]" /> <span className="hidden sm:inline">Troli</span>
              {count > 0 && (
                <span key={count} className="pop absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-tomato px-1 text-[11px] font-extrabold text-white">
                  {count}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export function Stepper({ qty, onChange, size = 'md' }) {
  const s = size === 'sm' ? 'size-8' : 'size-10'
  return (
    <div className="inline-flex items-center rounded-full bg-tomato text-white shadow-pop">
      <button className={`grid ${s} place-items-center rounded-full hover:bg-tomato-deep`} onClick={() => onChange(qty - 1)} aria-label="Kurang satu">
        {qty === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
      </button>
      <span className="min-w-6 text-center text-[15px] font-extrabold tabular-nums">{qty}</span>
      <button className={`grid ${s} place-items-center rounded-full hover:bg-tomato-deep`} onClick={() => onChange(qty + 1)} aria-label="Tambah satu" disabled={qty >= 20}>
        <Plus className="size-4" />
      </button>
    </div>
  )
}

function PizzaCard({ item, cart, i, noCashback }) {
  const sizes = item.sizes?.length ? item.sizes : null
  const [sid, setSid] = useState(sizes ? sizes[0].id : '')
  const size = sizes?.find((z) => z.id === sid) || sizes?.[0]
  const key = cartKey(item.id, size?.id)
  const qty = cart[key] || 0
  const price = size ? size.price : item.price
  return (
    <article className="card rise group flex flex-col overflow-hidden" style={{ animationDelay: `${i * 50}ms` }}>
      <div className="relative aspect-[4/3] overflow-hidden">
        <img src={item.img} alt={`Pizza ${item.name}`} loading="lazy" className={`size-full object-cover transition duration-500 group-hover:scale-105 ${item.available ? '' : 'grayscale'}`} />
        {item.tag && item.available && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-cheese px-2.5 py-1 text-[11.5px] font-extrabold text-ink shadow">
            <Flame className="size-3.5" /> {item.tag}
          </span>
        )}
        {!item.available && <span className="absolute inset-0 grid place-items-center bg-ink/45 font-display text-2xl tracking-wide text-white">Habis hari ini</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-[22px] leading-tight tracking-wide">{item.name}</h3>
          <span className="shrink-0 rounded-full bg-cream px-2.5 py-1 text-[15px] font-extrabold text-tomato">{rm(price)}</span>
        </div>
        <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-muted">{item.desc}</p>
        {noCashback && <p className="mt-1 text-[11.5px] font-semibold text-muted">Tidak termasuk promosi cashback</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {sizes ? (
            <div className="flex rounded-full bg-cream p-1" role="radiogroup" aria-label={`Saiz ${item.name}`}>
              {sizes.map((z) => (
                <button key={z.id} role="radio" aria-checked={z.id === size.id} onClick={() => setSid(z.id)}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${z.id === size.id ? 'bg-ink text-white shadow' : 'text-muted'}`}>
                  {z.label}{cart[cartKey(item.id, z.id)] ? ` ·${cart[cartKey(item.id, z.id)]}` : ''}
                </button>
              ))}
            </div>
          ) : <span />}
          {qty > 0 ? (
            <Stepper qty={qty} onChange={(q) => cartApi.set(key, q)} />
          ) : (
            <button className="btn btn-red px-5 py-2.5 text-[14px]" onClick={() => cartApi.add(key)} disabled={!item.available}>
              <Plus className="size-4" /> Tambah
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export function CartDrawer({ open, onClose, menu }) {
  const cart = useCart()
  const lines = cartLines(cart, menu)
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => (window.removeEventListener('keydown', k), (document.body.style.overflow = ''))
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="rise flex h-full w-full max-w-md flex-col bg-paper shadow-2xl" role="dialog" aria-modal="true" aria-label="Troli anda">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl tracking-wide">Troli anda</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-cream" aria-label="Tutup">
            <X className="size-5" />
          </button>
        </div>
        {lines.length === 0 ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <img src="/logo.svg" alt="" className="mx-auto size-16 opacity-60" />
              <p className="mt-3 font-display text-xl">Troli masih kosong</p>
              <p className="mt-1 text-[13.5px] text-muted">Pilih pizza kegemaran anda dari menu.</p>
              <button onClick={onClose} className="btn btn-red mt-5 px-6 py-2.5 text-[14px]">Lihat menu</button>
            </div>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {lines.map(({ key, item, qty, price, label }) => (
                <li key={key} className="flex items-center gap-3 py-3.5">
                  <img src={item.img} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{label}</div>
                    <div className="text-[13px] text-muted">{rm(price)} sebiji</div>
                    {!item.available && <div className="text-[12px] font-bold text-tomato">Habis - sila buang</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-[14px] font-extrabold">{rm(price * qty)}</span>
                    <Stepper size="sm" qty={qty} onChange={(q) => cartApi.set(key, q)} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-5" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
              <div className="flex justify-between text-[15px]">
                <span className="text-muted">Jumlah pizza</span>
                <span className="font-extrabold">{rm(subtotal)}</span>
              </div>
              <p className="mt-1 text-[12.5px] text-muted">Caj penghantaran dikira ikut jarak selepas anda pin lokasi.</p>
              <button className="btn btn-red mt-4 w-full py-3.5 text-[15px]" onClick={() => (onClose(), go('/checkout'))}>
                Teruskan <ArrowRight className="size-4" />
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

export default function Shop() {
  const { shop, error } = useShop()
  const cart = useCart()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const menu = shop?.menu ?? []
  const lines = cartLines(cart, menu)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  // price chips come from the menu itself, so they follow price changes on the admin page
  const prices = [...new Set(menu.map((m) => m.price))].sort((a, b) => a - b)
  const FILTERS = [{ id: 'all', label: 'Semua' }, ...prices.map((p, i) => ({ id: p, label: i === prices.length - 1 && prices.length > 2 ? 'Premium' : rm(p) }))]
  const shown = useMemo(() => (filter === 'all' ? menu : menu.filter((m) => m.price === filter)), [menu, filter])
  const from = prices.length ? rm(prices[0]) : ''
  const acc = useAccount()
  const myOrders = acc?.orders?.length ? acc.orders.filter((o) => !['done', 'cancelled'].includes(o.status)).slice(0, 3) : store.get('pz.orders', []).slice(0, 3)

  return (
    <div className="min-h-dvh">
      <Header onCart={() => setOpen(true)} count={count} />

      {/* hero */}
      <section className="dots relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-8 md:grid-cols-[1.1fr_1fr] md:pb-16 md:pt-14">
          <div className="rise">
            {shop && !shop.open && (
              <div className="mb-4 inline-flex rounded-full bg-tomato/10 px-3 py-1 text-[13px] font-bold text-tomato">Kedai tutup sekarang - anda masih boleh lihat menu</div>
            )}
            {shop?.welcome && (
              <a href="#/akaun" className="mb-2 mr-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-tomato to-crust px-4 py-2 text-[13.5px] font-bold text-white shadow-lg">
                <span className="rounded-full bg-white/20 px-2 py-0.5 font-display text-[15px] tracking-wide">RM{shop.welcome.amount}</span>
                Pelanggan baru: order pertama = hadiah dalam dompet
              </a>
            )}
            {shop?.cashback && (
              <a href="#/akaun" className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-basil to-[#1f5a38] px-4 py-2 text-[13.5px] font-bold text-white shadow-lg">
                <span className="rounded-full bg-white/20 px-2 py-0.5 font-display text-[15px] tracking-wide">{shop.cashback.percent}%</span>
                Cashback ke dompet · hingga {fmtDay(shop.cashback.end)}
              </a>
            )}
            <h1 className="font-display text-[44px] leading-[1.02] tracking-wide sm:text-6xl">
              Pizza panas, <span className="text-tomato">terus ke pintu</span> rumah anda.
            </h1>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted">
              Pilih pizza, pin lokasi pada peta, dan bayar tunai bila pizza sampai. Senang, tiada kad diperlukan.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {[
                [Banknote, 'Bayar bila sampai (COD)'],
                [MapPin, 'Caj hantar ikut jarak'],
                [Flame, 'Dibakar bila anda order'],
              ].map(([I, t]) => (
                <span key={t} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-semibold">
                  <I className="size-4 text-tomato" /> {t}
                </span>
              ))}
            </div>
            <a href="#menu" className="btn btn-red mt-7 px-7 py-3.5 text-[15px]">
              Lihat menu <ArrowRight className="size-4" />
            </a>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[420px]">
            <div className="absolute inset-[6%] rounded-full bg-cheese/40 blur-2xl" />
            <div className="spin-slow absolute inset-0 rounded-full border-[3px] border-dashed border-crust/30" />
            <img src="/pizzas/udang.jpg" alt="Pizza udang" className="absolute inset-[10%] size-[80%] rounded-full object-cover shadow-2xl ring-8 ring-white" />
            <img src="/pizzas/hawaii-beef.jpg" alt="" className="absolute -left-2 bottom-2 size-[34%] rounded-full object-cover shadow-xl ring-4 ring-white" />
            <img src="/pizzas/meatball.jpg" alt="" className="absolute -right-1 top-3 size-[30%] rounded-full object-cover shadow-xl ring-4 ring-white" />
            <span className="absolute bottom-[14%] right-0 rotate-[-6deg] rounded-2xl bg-tomato px-4 py-2 font-display text-xl text-white shadow-pop">dari {from}</span>
          </div>
        </div>
      </section>

      {/* my recent orders */}
      {myOrders.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <div className="card flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]">
            <Bike className="size-5 text-tomato" />
            <span className="font-bold">Pesanan anda:</span>
            {acc && <a href="#/akaun" className="ml-auto text-[12.5px] font-bold text-muted underline">Semua pesanan</a>}
            {myOrders.map((o) => (
              <a key={o.id} href={`#/order/${o.id}?t=${o.token}`} className="rounded-full bg-cream px-3 py-1 font-bold text-tomato hover:bg-cheese/40">
                {o.id}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* menu */}
      <main id="menu" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-36 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl tracking-wide">Menu kami</h2>
            <p className="mt-1 text-[14px] text-muted">Semua pizza dibakar segar. Tekan Tambah untuk masuk troli.</p>
          </div>
          <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Tapis harga">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition ${filter === f.id ? 'bg-ink text-white' : 'border border-line bg-white hover:bg-cream'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="mt-8 rounded-2xl bg-tomato/10 p-4 text-tomato">Menu tidak dapat dimuatkan: {error}</p>}
        {!shop && !error && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="card h-80 animate-pulse bg-white" />
            ))}
          </div>
        )}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m, i) => (
            <PizzaCard key={m.id} item={m} cart={cart} i={i} noCashback={Boolean(shop?.cashback?.exclude?.includes(m.id))} />
          ))}
        </div>

        {/* how it works */}
        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            ['1', 'Pilih pizza', 'Tambah pizza ke troli. Boleh pilih banyak.'],
            ['2', 'Pin lokasi', 'Tunjuk rumah anda pada peta. Caj hantar dikira terus.'],
            ['3', 'Bayar tunai', 'Bayar kepada rider bila pizza sampai. Itu sahaja!'],
          ].map(([n, t, d]) => (
            <div key={n} className="card flex gap-4 p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cheese font-display text-2xl">{n}</span>
              <div>
                <div className="font-display text-xl tracking-wide">{t}</div>
                <p className="mt-0.5 text-[13.5px] text-muted">{d}</p>
              </div>
            </div>
          ))}
        </section>
        <footer className="mt-14 text-center text-[12.5px] text-muted">
          © {new Date().getFullYear()} {shop?.shopName || 'Pizzadonia'} · Bayaran tunai semasa penghantaran
        </footer>
      </main>

      {/* sticky cart bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => setOpen(true)}
            className="rise mx-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-full bg-ink py-2.5 pl-5 pr-2.5 text-white shadow-2xl"
          >
            <span className="flex items-center gap-2.5 text-[14px] font-semibold">
              <span className="grid size-7 place-items-center rounded-full bg-tomato text-[13px] font-extrabold">{count}</span>
              pizza · {rm(subtotal)}
            </span>
            <span className="btn btn-red px-5 py-2.5 text-[14px] shadow-none">
              Lihat troli <ArrowRight className="size-4" />
            </span>
          </button>
        </div>
      )}
      <CartDrawer open={open} onClose={() => setOpen(false)} menu={menu} />
    </div>
  )
}
