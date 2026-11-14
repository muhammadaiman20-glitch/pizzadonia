import { CheckCircle2 } from 'lucide-react'

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-cream shadow-2xl animate-rise"
    >
      <CheckCircle2 className="h-4 w-4 text-cheese" />
      {message}
    </div>
  )
}
