import { Bike, ChefHat, CircleCheck, ClipboardCheck, HandCoins, PackageCheck, PartyPopper, Store } from 'lucide-react'

// One list of order steps for the customer (Malay) and the seller (English). Same ids as STATUSES in server.js.
export const STEPS = [
  { id: 'new', Icon: ClipboardCheck, ms: 'Pesanan diterima', msSub: 'Menunggu kedai sahkan pesanan anda', en: 'New', enNext: 'Confirm order', cls: 'bg-tomato text-white' },
  { id: 'confirmed', Icon: CircleCheck, ms: 'Pesanan disahkan', msSub: 'Kedai sudah sahkan dan sedang tempah dari dapur', en: 'Confirmed', enNext: 'Supplier paid', cls: 'bg-[#7c4dff] text-white' },
  { id: 'supplier_paid', Icon: HandCoins, ms: 'Dibayar kepada dapur', msSub: 'Bayaran kepada pembekal selesai - pizza anda dalam giliran', en: 'Supplier paid', enNext: 'Start baking', cls: 'bg-[#0f9d8a] text-white' },
  { id: 'preparing', Icon: ChefHat, ms: 'Sedang dibakar', msSub: 'Pizza anda sedang dibuat dan dibakar', en: 'Baking', enNext: 'Pizza ready', cls: 'bg-cheese text-ink' },
  { id: 'ready', Icon: PackageCheck, ms: 'Siap & dibungkus', msSub: 'Pizza siap, menunggu rider ambil', en: 'Ready', enNext: 'Out for delivery', cls: 'bg-crust text-white' },
  { id: 'delivering', Icon: Bike, ms: 'Dalam perjalanan', msSub: 'Rider sedang menuju ke lokasi anda - sediakan wang tunai', en: 'On the way', enNext: 'Delivered + cash collected', cls: 'bg-[#3b6fd8] text-white' },
  { id: 'done', Icon: PartyPopper, ms: 'Sudah sampai', msSub: 'Diterima dan dibayar (COD). Selamat menjamu selera!', en: 'Delivered', enNext: '', cls: 'bg-basil text-white' },
]
export const CANCELLED = { id: 'cancelled', Icon: Store, ms: 'Dibatalkan', msSub: '', en: 'Cancelled', cls: 'bg-ink/15 text-ink' }
export const stepOf = (id) => STEPS.find((s) => s.id === id) || CANCELLED
export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id)
export const nextStep = (id) => {
  const i = stepIndex(id)
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null
}
