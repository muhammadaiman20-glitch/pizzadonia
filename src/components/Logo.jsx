export default function Logo({ small = false }) {
  return (
    <a href="#/" className="flex items-center gap-2" aria-label="Pizzadonia - menu">
      <img src="/logo.svg" alt="" className={small ? 'size-8' : 'size-10'} />
      <span className={`font-display leading-none tracking-wide text-tomato ${small ? 'text-2xl' : 'text-[28px]'}`}>
        Pizza<span className="text-crust">donia</span>
      </span>
    </a>
  )
}
