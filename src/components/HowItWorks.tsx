import { ArrowRight, MessageCircle, Pizza, ShoppingBag } from 'lucide-react'

const STEPS = [
  {
    icon: Pizza,
    title: 'Pilih pizza',
    desc: 'Lihat menu, pilih saiz 8 atau 10 inci, dan masukkan ke beg tempahan.',
  },
  {
    icon: ShoppingBag,
    title: 'Isi butiran',
    desc: 'Nama, nombor telefon, alamat atau pilih ambil sendiri di kedai.',
  },
  {
    icon: MessageCircle,
    title: 'Hantar WhatsApp',
    desc: 'Butiran tempahan dihantar terus ke WhatsApp kami untuk pengesahan.',
  },
]

interface HowItWorksProps {
  onMenu: () => void
}

export function HowItWorks({ onMenu }: HowItWorksProps) {
  return (
    <section id="cara" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-label justify-center">Cara tempah</p>
          <h2 className="mt-3 font-display text-4xl leading-[1.05] tracking-wide text-ink sm:text-5xl">
            Tiga langkah, pizza <span className="text-tomato">di pintu.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted sm:text-[15px]">
            Tiada aplikasi tambahan, tiada akaun. Tempahan terus melalui WhatsApp — mudah dan
            pantas.
          </p>
        </div>

        <ol className="relative mt-10 grid gap-4 md:grid-cols-3">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-14 hidden border-t-2 border-dashed border-crust/25 md:block" />
          {STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <li
                key={step.title}
                className="relative rounded-3xl border border-line bg-paper p-6 shadow-card transition duration-300 hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-tomato/10 text-tomato">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-5xl leading-none tracking-wide text-line">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-xl tracking-wide text-ink">{step.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{step.desc}</p>
              </li>
            )
          })}
        </ol>

        <div className="mt-8 flex justify-center">
          <button type="button" onClick={onMenu} className="btn btn-red h-12 px-6 text-sm">
            Mula Tempah Sekarang
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}
