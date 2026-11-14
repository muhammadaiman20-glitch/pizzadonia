import { Quote, Star } from 'lucide-react'

const REVIEWS = [
  {
    quote: 'Pizza dia betul-betul panas bila sampai. Keju melimpah, doh lembut. Anak-anak habis dalam masa 10 minit!',
    name: 'Nurul A.',
    detail: 'Taman Sri Indah',
  },
  {
    quote: 'Order Mix 10 inci untuk keluarga. Topping penuh sampai tak nampak doh. Harga berbaloi sangat.',
    name: 'Faizal H.',
    detail: 'Ambil sendiri',
  },
  {
    quote: 'Tempah melalui WhatsApp senang, seller responsif. Status order pun boleh pantau. Memang repeat order.',
    name: 'Siti M.',
    detail: 'Pangsapuri Seri Murni',
  },
]

export function Testimonials() {
  return (
    <section className="border-y border-line bg-paper py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="section-label">Kata pelanggan</p>
            <h2 className="mt-3 font-display text-4xl leading-[1.05] tracking-wide text-ink sm:text-5xl">
              Jiran-jiran <span className="text-tomato">suka.</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-cream px-4 py-2">
            <div className="flex text-cheese-deep">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-3.5 w-3.5 fill-current" />
              ))}
            </div>
            <span className="text-xs font-bold text-ink">4.9 · 128 ulasan</span>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {REVIEWS.map((review) => (
            <figure
              key={review.name}
              className="relative flex flex-col rounded-3xl border border-line bg-cream p-6 shadow-card"
            >
              <Quote className="h-6 w-6 text-tomato/30" />
              <blockquote className="mt-3 flex-1 text-[13.5px] leading-relaxed text-ink/80">
                “{review.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-line pt-4">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-tomato/10 font-display text-sm tracking-wide text-tomato-deep">
                  {review.name.charAt(0)}
                </span>
                <div>
                  <p className="text-xs font-extrabold text-ink">{review.name}</p>
                  <p className="text-[10px] font-medium text-muted">{review.detail}</p>
                </div>
                <div className="ml-auto flex text-cheese-deep">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-3 w-3 fill-current" />
                  ))}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
