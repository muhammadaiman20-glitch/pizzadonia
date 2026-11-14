import { Check, ClipboardList, Flame, Home, PackageCheck, XCircle } from 'lucide-react'
import { STATUS_FLOW, STATUS_META, type OrderStatus } from '../config'

const ICONS = {
  baru: ClipboardList,
  diterima: Check,
  dibakar: Flame,
  siap: PackageCheck,
  selesai: Home,
} as const

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === 'batal') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-tomato/25 bg-tomato/5 px-4 py-3 text-sm font-semibold text-tomato-deep">
        <XCircle className="h-4 w-4" />
        Tempahan ini telah dibatalkan.
      </div>
    )
  }

  const currentIndex = STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number])

  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Status tempahan">
      {STATUS_FLOW.map((step, index) => {
        const Icon = ICONS[step]
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li key={step} className="relative flex flex-col items-center text-center">
            {index > 0 && (
              <span
                className={`absolute right-1/2 top-4 h-0.5 w-full ${
                  index <= currentIndex ? 'bg-basil/60' : 'bg-line'
                }`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 transition ${
                done
                  ? 'border-basil bg-basil text-white'
                  : active
                    ? 'border-tomato bg-tomato text-white shadow-pop'
                    : 'border-line bg-paper text-muted'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </span>
            <span
              className={`mt-2 px-0.5 text-[9px] font-bold leading-tight sm:text-[10px] ${
                active ? 'text-tomato-deep' : done ? 'text-basil' : 'text-muted'
              }`}
            >
              {STATUS_META[step].short}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
