import { CheckCircle2 } from 'lucide-react'

interface ToastProps {
  message: string | null
  /**
   * Naikkan toast di atas bar beg terapung (mobile) supaya kedua-duanya
   * tidak bertindih. `md` ke atas tidak mempunyai bar itu.
   */
  raised?: boolean
}

export function Toast({ message, raised = false }: ToastProps) {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-4 z-[70] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-cream shadow-2xl animate-rise sm:left-6 ${
        raised ? 'bottom-20 md:bottom-6' : 'bottom-6'
      }`}
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-cheese" />
      {message}
    </div>
  )
}
