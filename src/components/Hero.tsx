import { ArrowRight, Flame, Star, UtensilsCrossed } from 'lucide-react'

interface HeroProps {
  onMenu: () => void
  onHow: () => void
}

export function Hero({ onMenu, onHow }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 dots opacity-60" />
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-cheese/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-40 h-96 w-96 rounded-full bg-tomato/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-basil/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-24 lg:pt-20 lg:px-8">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-tomato/20 bg-tomato/5 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-tomato-deep">
            <Flame className="h-3.5 w-3.5" />
            Dibakar segar setiap hari
          </span>

          <h1 className="mt-5 font-display text-[2.7rem] leading-[0.92] tracking-wide text-ink min-[400px]:text-[3.1rem] sm:text-6xl xl:text-[4.6rem]">
            Pizza panas,
            <br />
            bahagia sampai
            <br />
            ke <span className="relative inline-block text-tomato">pintu.
              <svg
                aria-hidden="true"
                viewBox="0 0 220 12"
                className="absolute -bottom-1 left-0 h-2.5 w-full text-cheese"
                preserveAspectRatio="none"
              >
                <path d="M3 9C50 3 120 2 217 7" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" />
              </svg>
            </span>
          </h1>

          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-muted sm:text-base">
            Doh diperam perlahan 24 jam, keju mozzarella melimpah dan topping penuh. Tempah
            terus melalui WhatsApp — kami bakar bila anda order.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onMenu} className="btn btn-red h-12 px-6 text-sm">
              Tempah Sekarang
              <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={onHow} className="btn btn-ghost h-12 px-6 text-sm">
              Cara Tempah
            </button>
          </div>

          <dl className="mt-9 grid max-w-md grid-cols-3 gap-3">
            {[
              { value: '10+', label: 'Pilihan pizza' },
              { value: '25–35', label: 'Minit siap' },
              { value: '4.9', label: 'Penilaian pelanggan' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-line bg-paper/80 px-3 py-3 text-center shadow-card">
                <dt className="font-display text-2xl tracking-wide text-ink">{stat.value}</dt>
                <dd className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-[440px] animate-rise lg:max-w-none">
          <div className="relative aspect-square">
            <div className="absolute inset-[6%] rounded-full border-2 border-dashed border-crust/30 animate-spin-slow" />
            <div className="absolute inset-[3%] rounded-full bg-gradient-to-br from-cheese/40 via-cream to-tomato/10" />
            <div className="absolute inset-[8%] overflow-hidden rounded-full border-[10px] border-paper shadow-[0_30px_80px_-30px_rgba(42,26,18,0.55)]">
              <img
                src="/pizzas/mix.jpg"
                alt="Pizza Mix Pizzadonia yang baru dibakar"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-ink/5" />
            </div>

            <div className="absolute -left-2 top-8 flex items-center gap-2 rounded-2xl border border-line bg-paper px-3 py-2 shadow-card sm:left-0 lg:-left-6">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-basil/10 text-basil">
                <UtensilsCrossed className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Doh</p>
                <p className="text-xs font-extrabold text-ink">Diperam 24 jam</p>
              </div>
            </div>

            <div className="absolute -bottom-1 right-0 flex items-center gap-2.5 rounded-2xl border border-line bg-paper px-3.5 py-2.5 shadow-card sm:right-2 lg:-right-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-cheese/25 text-crust">
                <Star className="h-4 w-4 fill-current" />
              </span>
              <div>
                <p className="font-display text-lg leading-none tracking-wide text-ink">4.9/5</p>
                <p className="text-[10px] font-semibold text-muted">128 ulasan pelanggan</p>
              </div>
            </div>

            <div className="absolute bottom-14 -left-3 rounded-2xl bg-ink px-4 py-2.5 text-cream shadow-pop sm:-left-2 lg:-left-8">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cream/60">Mula dari</p>
              <p className="font-display text-xl leading-none tracking-wide">
                RM21.<span className="text-cheese">90</span>
              </p>
            </div>

            <span className="absolute right-6 top-2 grid h-10 w-10 place-items-center rounded-full bg-tomato text-white shadow-pop sm:right-2">
              <Flame className="h-5 w-5" />
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
