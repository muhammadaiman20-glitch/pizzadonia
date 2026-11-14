import { AtSign, Clock, LayoutDashboard, MapPin, MessageCircle } from 'lucide-react'
import { SHOP } from '../config'
import { Logo } from './Logo'

interface FooterProps {
  onMenu: () => void
  onHow: () => void
}

export function Footer({ onMenu, onHow }: FooterProps) {
  return (
    <footer className="dots-dark relative overflow-hidden bg-ink text-cream">
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-tomato/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-cheese/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr] lg:gap-16">
          <div>
            <Logo light />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/65">
              Pizza doh segar yang diperam perlahan, dibakar panas dan dihantar hangat. Dibuat
              dengan kasih untuk jiran-jiran sekitar.
            </p>
            <a
              href={`https://wa.me/${SHOP.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-cheese px-5 py-2.5 text-sm font-extrabold text-ink transition hover:-translate-y-0.5 hover:bg-cream"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Pizzadonia
            </a>
          </div>

          <div>
            <h3 className="font-display text-lg tracking-wide text-cream">Pautan</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-cream/65">
              <li>
                <button type="button" onClick={onMenu} className="transition hover:text-cheese">
                  Menu pizza
                </button>
              </li>
              <li>
                <button type="button" onClick={onHow} className="transition hover:text-cheese">
                  Cara tempah
                </button>
              </li>
              <li>
                <a href="#/track" className="transition hover:text-cheese">
                  Jejak tempahan
                </a>
              </li>
              <li>
                <a href="#/dashboard" className="inline-flex items-center gap-1.5 transition hover:text-cheese">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard penjual
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-lg tracking-wide text-cream">Hubungi</h3>
            <ul className="mt-4 space-y-3 text-sm text-cream/65">
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-cheese" />
                {SHOP.hours}
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cheese" />
                {SHOP.area}
              </li>
              <li className="flex items-start gap-2.5">
                <AtSign className="mt-0.5 h-4 w-4 shrink-0 text-cheese" />
                @pizzadonia
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-cream/10 pt-6 text-xs text-cream/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Pizzadonia. Semua hak terpelihara.</p>
          <p>Mod ujian — tempahan disimpan pada peranti ini sahaja.</p>
        </div>
      </div>
    </footer>
  )
}
