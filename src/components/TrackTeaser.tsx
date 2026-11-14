import { ArrowRight, PackageCheck } from 'lucide-react'

export function TrackTeaser() {
  return (
    <section className="py-14 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="dots-dark relative overflow-hidden rounded-[32px] bg-ink px-6 py-10 text-cream shadow-pop sm:px-10 lg:px-14 lg:py-14">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-tomato/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-cheese/10 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cheese text-ink">
                <PackageCheck className="h-6 w-6" />
              </span>
              <div>
                <h2 className="font-display text-3xl leading-tight tracking-wide sm:text-4xl">
                  Dah tempah? Jejak pizza anda.
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream/60">
                  Masukkan nombor tempahan untuk lihat status terkini — dari dapur sampai ke
                  pintu.
                </p>
              </div>
            </div>
            <a href="#/track" className="btn h-12 shrink-0 bg-cheese px-6 text-sm text-ink hover:bg-cream">
              Jejak Tempahan
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
