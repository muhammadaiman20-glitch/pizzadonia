export function Logo({
  light = false,
  href = '#/',
  src = '/logo.svg',
}: {
  light?: boolean
  /** `null` memaparkan logo tanpa pautan (untuk dashboard penjual). */
  href?: string | null
  src?: string
}) {
  const content = (
    <>
      <img
        src={src}
        alt=""
        className="h-10 w-10 drop-shadow-sm transition-transform duration-300 group-hover:-rotate-12"
      />
      <span
        className={`font-display text-[1.65rem] leading-none tracking-wide ${light ? 'text-cream' : 'text-ink'}`}
      >
        Pizza<span className="text-tomato">donia</span>
      </span>
    </>
  )

  if (href === null) {
    return <div className="flex items-center gap-2.5">{content}</div>
  }

  return (
    <a href={href} className="group flex items-center gap-2.5" aria-label="Pizzadonia — laman utama">
      {content}
    </a>
  )
}
