export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#/" className="group flex items-center gap-2.5" aria-label="Pizzadonia — laman utama">
      <img
        src="/logo.svg"
        alt=""
        className="h-10 w-10 drop-shadow-sm transition-transform duration-300 group-hover:-rotate-12"
      />
      <span
        className={`font-display text-[1.65rem] leading-none tracking-wide ${light ? 'text-cream' : 'text-ink'}`}
      >
        Pizza<span className="text-tomato">donia</span>
      </span>
    </a>
  )
}
