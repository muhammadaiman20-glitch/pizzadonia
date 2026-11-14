import type { OrderStatus } from '../config'

export const rm = (value: number) => `RM${value.toFixed(2)}`

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Baru sahaja'
  if (minutes < 60) return `${minutes} min lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Semalam' : `${days} hari lalu`
}

export const isToday = (iso: string) => {
  const date = new Date(iso)
  const now = new Date()
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  )
}

export const statusLabel = (status: OrderStatus) => status

let counter = 0
export const newOrderId = () => {
  counter = (counter + 1) % 100
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 9000 + 1000)
  return `PZ-${stamp}-${String(random).padStart(4, '0')}${String(counter).padStart(2, '0')}`
}

export const normalizePhone = (value: string) => value.replace(/[^\d+]/g, '')

export const waNumber = (value: string) => value.replace(/\D/g, '')
