import { STATUS_META, type OrderStatus } from '../config'

const TONES: Record<OrderStatus, string> = {
  baru: 'bg-tomato/10 text-tomato-deep ring-tomato/25',
  diterima: 'bg-crust/10 text-crust ring-crust/25',
  dibakar: 'bg-cheese/25 text-[#8a5a00] ring-cheese/50',
  siap: 'bg-basil/10 text-basil ring-basil/25',
  selesai: 'bg-ink/5 text-muted ring-ink/10',
  batal: 'bg-ink/10 text-muted ring-ink/15',
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${TONES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}
