import { useMemo, useState } from 'react'
import { ArrowUpRight, Info } from 'lucide-react'
import { CATEGORIES, MENU, type CategoryId } from '../data/menu'
import { SHOP } from '../config'
import { rm } from '../lib/format'
import { PizzaCard } from './PizzaCard'

interface MenuSectionProps {
  onAdd: (itemId: string, sizeId: string) => void
  onCheckout: () => void
  cartCount: number
}

export function MenuSection({ onAdd, onCheckout, cartCount }: MenuSectionProps) {
  const [category, setCategory] = useState<CategoryId>('semua')

  const items = useMemo(
    () => MENU.filter((item) => item.available && (category === 'semua' || item.category === category)),
    [category],
  )

  return (
    <section id="menu" className="relative scroll-mt-24 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="section-label">Menu kami</p>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] tracking-wide text-ink sm:text-5xl">
              Pilih kegemaran,
              <br />
              kami bakar <span className="text-tomato">panas-panas.</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted sm:text-[15px]">
              Setiap pizza dibuat dengan doh segar dan keju mozzarella sebenar. Harga bermula
              dari {rm(21.9)} untuk saiz 8 inci.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-2xl border border-basil/25 bg-basil/5 px-4 py-3 text-xs font-semibold text-basil lg:flex">
            <Info className="h-4 w-4 shrink-0" />
            Penghantaran percuma untuk tempahan {rm(SHOP.delivery.freeAbove)} ke atas
          </div>
        </div>

        <div className="mt-8 flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Kategori menu">
          {CATEGORIES.map((option) => {
            const active = option.id === category
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(option.id)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-extrabold transition ${
                  active
                    ? 'border-ink bg-ink text-cream shadow-card'
                    : 'border-line bg-paper text-muted hover:border-crust/40 hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6">
          {items.map((item) => (
            <PizzaCard key={item.id} item={item} onAdd={onAdd} />
          ))}
        </div>

        {cartCount > 0 && (
          <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-5 py-4 shadow-card sm:flex-row">
            <p className="text-sm font-semibold text-ink">
              {cartCount} item dalam beg — sedia untuk ditempah?
            </p>
            <button type="button" onClick={onCheckout} className="btn btn-red h-10 px-5 text-xs">
              Semak & Tempah
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
