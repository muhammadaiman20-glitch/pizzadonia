import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { MenuItem } from '../data/menu'
import { rm } from '../lib/format'

interface PizzaCardProps {
  item: MenuItem
  onAdd: (itemId: string, sizeId: string) => void
}

export function PizzaCard({ item, onAdd }: PizzaCardProps) {
  const [sizeId, setSizeId] = useState(item.sizes[0].id)
  const size = item.sizes.find((option) => option.id === sizeId) ?? item.sizes[0]

  return (
    <article className="group flex flex-col overflow-hidden rounded-[26px] border border-line bg-paper shadow-card transition duration-300 hover:-translate-y-1.5 hover:border-crust/30 hover:shadow-[0_28px_60px_-30px_rgba(42,26,18,0.45)]">
      <div className="relative aspect-[5/4] overflow-hidden bg-line/40">
        <img
          src={item.img}
          alt={`Pizza ${item.name}`}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-transparent" />
        {item.tag && (
          <span className="absolute left-3 top-3 rounded-full bg-tomato-deep px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
            {item.tag}
          </span>
        )}
        <span className="absolute right-3 top-3 rounded-full border border-white/50 bg-paper/90 px-2.5 py-1 text-[10px] font-extrabold text-ink backdrop-blur">
          {item.sizes[0].label} · {rm(item.sizes[0].price)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl tracking-wide text-ink">{item.name}</h3>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{item.desc}</p>

        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label={`Saiz pizza ${item.name}`}>
          {item.sizes.map((option) => {
            const active = option.id === sizeId
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSizeId(option.id)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  active
                    ? 'border-ink bg-ink text-cream'
                    : 'border-line bg-cream text-muted hover:border-crust/40 hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex-1" />

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">Harga</p>
            <p className="font-display text-xl leading-none tracking-wide text-ink">{rm(size.price)}</p>
          </div>
          <button
            type="button"
            onClick={() => onAdd(item.id, size.id)}
            className="btn btn-red h-10 px-4 text-xs"
            aria-label={`Tambah ${item.name} ${size.label} ke beg`}
          >
            <Plus className="h-4 w-4" />
            Tambah
          </button>
        </div>
      </div>
    </article>
  )
}
