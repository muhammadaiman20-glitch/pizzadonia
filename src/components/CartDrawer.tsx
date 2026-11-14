import { useEffect, useRef } from 'react'
import { ArrowRight, Minus, Pizza, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { SHOP } from '../config'
import { getPizza } from '../data/menu'
import { cartDetails } from '../lib/cart'
import { rm } from '../lib/format'
import type { CartLine } from '../types'

interface CartDrawerProps {
  open: boolean
  onClose: () => void
  lines: CartLine[]
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  onCheckout: () => void
  onBrowse: () => void
}

export function CartDrawer({
  open,
  onClose,
  lines,
  setQty,
  remove,
  onCheckout,
  onBrowse,
}: CartDrawerProps) {
  const { items, subtotal, count } = cartDetails(lines)
  const remaining = Math.max(0, SHOP.delivery.freeAbove - subtotal)
  const progress = Math.min(100, (subtotal / SHOP.delivery.freeAbove) * 100)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // Bila beg dibuka, tatal supaya barang yang baru ditambah kelihatan penuh
  // dan tidak tersorok di penghujung senarai.
  useEffect(() => {
    if (!open) return

    const scrollToLast = () => {
      const list = listRef.current
      const last = list?.querySelector<HTMLElement>('li:last-child')
      if (!list || !last) return

      const listRect = list.getBoundingClientRect()
      const lastRect = last.getBoundingClientRect()
      const bottomTarget = list.scrollHeight - list.clientHeight
      const lastTopAtBottom = lastRect.top - (bottomTarget - list.scrollTop)

      // Jika tatal penuh ke bawah masih mengekalkan item terakhir, tatal penuh
      // (supaya banner penghantaran percuma juga kelihatan). Jika tidak
      // (skrin rendah), tatal sekadar cukup untuk item terakhir.
      list.scrollTop =
        lastTopAtBottom >= listRect.top + 4
          ? bottomTarget
          : Math.max(0, list.scrollTop + lastRect.bottom + 16 - listRect.bottom)
    }

    // Dua pusingan: susun atur (font/imej) kadangkala berubah selepas frame
    // pertama, jadi ukur semula dan betulkan.
    let second = 0
    const first = requestAnimationFrame(() => {
      scrollToLast()
      second = requestAnimationFrame(scrollToLast)
    })
    return () => {
      cancelAnimationFrame(first)
      if (second) cancelAnimationFrame(second)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Beg tempahan">
      <button
        type="button"
        aria-label="Tutup beg tempahan"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/55 backdrop-blur-sm animate-fade-in"
      />
      <aside className="absolute inset-y-0 right-0 flex h-full w-full max-w-md flex-col overflow-hidden bg-cream shadow-2xl animate-slide-in">
        <header className="flex shrink-0 items-center justify-between border-b border-line bg-paper px-5 py-3.5 sm:py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-tomato/10 text-tomato">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-xl leading-none tracking-wide text-ink">Beg Tempahan</h2>
              <p className="mt-1 text-xs font-medium text-muted">{count} item dipilih</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-cream text-ink transition hover:bg-line/60"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-8 py-8 text-center">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-cheese/25 text-crust">
              <Pizza className="h-10 w-10" />
            </span>
            <div>
              <p className="font-display text-xl tracking-wide text-ink">Beg masih kosong</p>
              <p className="mt-1.5 text-sm text-muted">Jom pilih pizza kegemaran anda dulu.</p>
            </div>
            <button
              type="button"
              onClick={onBrowse}
              className="btn btn-red h-11 px-6 text-sm"
            >
              Lihat Menu
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
              <ul className="space-y-3">
                {items.map((item) => {
                  const line = lines.find((entry) => entry.key === `${item.itemId}:${item.sizeId}`)
                  if (!line) return null
                  const img = getPizza(item.itemId)?.img ?? '/logo.svg'
                  return (
                    <li
                      key={line.key}
                      className="flex gap-3 rounded-2xl border border-line bg-paper p-3 shadow-card"
                    >
                      <img
                        src={img}
                        alt={item.name}
                        className="h-20 w-20 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold text-ink">{item.name}</p>
                            <p className="mt-0.5 text-xs font-medium text-muted">{item.sizeLabel}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(line.key)}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-tomato/10 hover:text-tomato"
                            aria-label={`Buang ${item.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center rounded-full border border-line bg-cream">
                            <button
                              type="button"
                              onClick={() => setQty(line.key, line.qty - 1)}
                              className="grid h-8 w-8 place-items-center rounded-full text-ink transition hover:bg-line/60"
                              aria-label={`Kurang ${item.name}`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-extrabold tabular-nums text-ink">
                              {line.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQty(line.key, line.qty + 1)}
                              className="grid h-8 w-8 place-items-center rounded-full text-ink transition hover:bg-line/60"
                              aria-label={`Tambah ${item.name}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="text-sm font-extrabold text-ink">
                            {rm(item.price * item.qty)}
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>

              {remaining > 0 ? (
                <div className="mt-5 rounded-2xl border border-cheese/60 bg-cheese/15 px-4 py-3">
                  <p className="text-xs font-bold text-[#7a4f00]">
                    Tambah {rm(remaining)} lagi untuk penghantaran percuma
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full bg-crust transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-basil/30 bg-basil/10 px-4 py-3 text-xs font-bold text-basil">
                  Syabas! Tempahan ini layak penghantaran percuma.
                </p>
              )}
            </div>

            <footer className="shrink-0 border-t border-line bg-paper px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_-16px_rgb(42_26_18_/_0.35)] [@media(max-height:480px)]:pb-3 [@media(max-height:480px)]:pt-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-muted">Subtotal</span>
                <span className="font-display text-2xl leading-none tracking-wide text-ink">{rm(subtotal)}</span>
              </div>
              <p className="mt-1 hidden text-[11px] leading-relaxed text-muted [@media(min-height:481px)]:block">
                Penghantaran dari {rm(SHOP.delivery.fee)} · percuma untuk tempahan{' '}
                {rm(SHOP.delivery.freeAbove)}+
              </p>
              <button
                type="button"
                onClick={onCheckout}
                className="btn btn-red mt-3 h-12 w-full text-sm [@media(max-height:480px)]:mt-2 [@media(max-height:480px)]:h-11"
              >
                Teruskan Tempahan
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-1.5 hidden w-full py-1 text-center text-xs font-semibold text-muted underline-offset-4 transition hover:text-ink hover:underline [@media(min-height:481px)]:block"
              >
                Terus lihat menu
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
