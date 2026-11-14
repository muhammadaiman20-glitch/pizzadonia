import { useState } from 'react'
import { LayoutDashboard, Menu as MenuIcon, MessageCircle, ShoppingBag, X } from 'lucide-react'
import { SHOP } from '../config'
import { Logo } from './Logo'

interface HeaderProps {
  cartCount: number
  onCart: () => void
  onMenu: () => void
  onHow: () => void
}

export function Header({ cartCount, onCart, onMenu, onHow }: HeaderProps) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <div className="bg-ink text-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-[11px] font-semibold tracking-wide sm:px-6 lg:px-8">
          <p className="flex items-center gap-2">
            <span className="hidden h-1.5 w-1.5 animate-pulse rounded-full bg-cheese sm:block" />
            Penghantaran percuma untuk tempahan RM60 ke atas
          </p>
          <a
            href={`https://wa.me/${SHOP.whatsapp}`}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 text-cheese transition hover:text-white sm:flex"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp kami
          </a>
          <span className="text-cream/60 sm:hidden">{SHOP.area}</span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigasi utama">
            <button type="button" onClick={onMenu} className="nav-link">
              Menu
            </button>
            <button type="button" onClick={onHow} className="nav-link">
              Cara Tempah
            </button>
            <a href="#/track" className="nav-link">
              Jejak Tempahan
            </a>
            <a href="#/dashboard" className="nav-link inline-flex items-center gap-1.5">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCart}
              className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-paper text-ink transition hover:-translate-y-0.5 hover:border-crust/40 hover:shadow-card"
              aria-label={`Beg tempahan, ${cartCount} item`}
            >
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-tomato px-1 text-[10px] font-extrabold text-white ring-2 ring-cream">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onMenu}
              className="btn btn-red hidden h-11 px-5 text-sm sm:inline-flex"
            >
              Tempah Sekarang
            </button>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="grid h-11 w-11 place-items-center rounded-full border border-line bg-paper text-ink lg:hidden"
              aria-expanded={open}
              aria-label="Buka menu navigasi"
            >
              {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <nav
            className="animate-rise border-t border-line bg-paper px-4 py-3 lg:hidden"
            aria-label="Navigasi mudah alih"
          >
            <button
              type="button"
              onClick={() => {
                close()
                onMenu()
              }}
              className="mobile-link"
            >
              Menu
            </button>
            <button
              type="button"
              onClick={() => {
                close()
                onHow()
              }}
              className="mobile-link"
            >
              Cara Tempah
            </button>
            <a href="#/track" onClick={close} className="mobile-link">
              Jejak Tempahan
            </a>
            <a href="#/dashboard" onClick={close} className="mobile-link">
              Dashboard Penjual
            </a>
            <a
              href={`https://wa.me/${SHOP.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              onClick={close}
              className="mobile-link text-basil"
            >
              WhatsApp Pizzadonia
            </a>
          </nav>
        )}
      </header>
    </>
  )
}
