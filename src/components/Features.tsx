import { Bike, Flame, HeartHandshake, Wheat } from 'lucide-react'

const FEATURES = [
  {
    icon: Wheat,
    title: 'Doh diperam 24 jam',
    desc: 'Rangup di luar, lembut di dalam. Doh kami berehat sehari sebelum dibakar.',
  },
  {
    icon: HeartHandshake,
    title: 'Bahan betul-betul',
    desc: 'Keju mozzarella sebenar, sos pizza buatan sendiri dan topping yang penuh.',
  },
  {
    icon: Flame,
    title: 'Bakar pada 300°C',
    desc: 'Panas tinggi untuk kerak keemasan dan keju yang meleleh sempurna.',
  },
  {
    icon: Bike,
    title: 'Hangat sampai pintu',
    desc: 'Dibakar selepas anda order, terus dihantar dalam kotak penebat panas.',
  },
]

export function Features() {
  return (
    <section id="kenapa" className="relative scroll-mt-24 overflow-hidden border-y border-line bg-paper py-16 lg:py-24">
      <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-cheese/20 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
          <div>
            <p className="section-label">Kenapa Pizzadonia</p>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] tracking-wide text-ink sm:text-5xl">
              Bukan sekadar
              <br />
              pizza biasa.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted sm:text-[15px]">
              Kami buat pizza yang kami sendiri nak makan — tanpa jalan pintas. Dari doh sampai
              kotak, setiap langkah dijaga.
            </p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-line bg-cream px-4 py-3">
              <span className="font-display text-3xl tracking-wide text-tomato">10+</span>
              <span className="text-xs font-semibold leading-snug text-muted">
                pilihan resepi,
                <br />
                dari klasik sampai wagyu
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className={`rounded-3xl border p-5 transition duration-300 hover:-translate-y-1 ${
                    index === 1
                      ? 'border-ink bg-ink text-cream shadow-pop'
                      : 'border-line bg-cream text-ink shadow-card'
                  }`}
                >
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-2xl ${
                      index === 1 ? 'bg-cheese text-ink' : 'bg-tomato/10 text-tomato'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg tracking-wide">{feature.title}</h3>
                  <p className={`mt-1.5 text-[13px] leading-relaxed ${index === 1 ? 'text-cream/65' : 'text-muted'}`}>
                    {feature.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
