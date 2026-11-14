const WORDS = [
  'Bakar segar setiap hari',
  'Keju mozzarella melimpah',
  'Doh diperam 24 jam',
  'Topping penuh',
  'Hangat sampai pintu',
]

export function Marquee() {
  const row = [...WORDS, ...WORDS]
  return (
    <div className="relative overflow-hidden border-y border-crust/20 bg-cheese/90 py-3.5 text-ink">
      <div className="marquee flex w-max items-center gap-8 whitespace-nowrap">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-8" aria-hidden={copy === 1}>
            {row.map((word, index) => (
              <span
                key={`${copy}-${word}-${index}`}
                className="flex items-center gap-8 font-display text-lg tracking-wide sm:text-xl"
              >
                {word}
                <span className="text-tomato">✶</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
