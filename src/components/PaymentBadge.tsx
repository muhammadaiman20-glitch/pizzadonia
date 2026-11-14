import { CheckCircle2, Clock3, Wallet } from 'lucide-react'
import { paymentStatusLabel } from '../lib/payment'
import type { PaymentStatus } from '../types'

const TONES: Record<PaymentStatus, string> = {
  unpaid: 'bg-ink/5 text-muted ring-ink/10',
  pending: 'bg-cheese/25 text-[#8a5a00] ring-cheese/50',
  paid: 'bg-basil/10 text-basil ring-basil/25',
}

const ICONS = {
  unpaid: Wallet,
  pending: Clock3,
  paid: CheckCircle2,
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const Icon = ICONS[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${TONES[status]}`}
    >
      <Icon className="h-3 w-3" />
      {paymentStatusLabel(status)}
    </span>
  )
}
