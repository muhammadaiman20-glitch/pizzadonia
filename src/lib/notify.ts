import { STATUS_META, type OrderStatus } from '../config'
import { rm } from './format'
import { paymentLabel, paymentStatusLabel } from './payment'
import type { Order } from '../types'

/** Tukar nombor tempatan (0123456789) ke format WhatsApp (60123456789). */
export function waPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('60')) return digits
  if (digits.startsWith('0')) return `6${digits}`
  return digits
}

const STATUS_NOTE: Record<OrderStatus, string> = {
  baru: 'Kami telah terima tempahan anda dan akan sahkan sebentar lagi.',
  diterima: 'Tempahan anda telah disahkan. Pizza akan mula dibakar tidak lama lagi.',
  dibakar: 'Pizza anda sedang dibakar. Ia akan siap dalam masa 20–25 minit.',
  siap: 'Pizza anda sudah siap!',
  selesai: 'Terima kasih kerana menempah di Pizzadonia. Jemput datang lagi!',
  batal: 'Maaf, tempahan ini telah dibatalkan. Hubungi kami jika ada pertanyaan.',
}

export function buildStatusMessage(order: Order) {
  const meta = STATUS_META[order.status]
  const firstName = order.name.split(' ')[0]
  const lines = [
    '*KEMAS KINI TEMPAHAN — PIZZADONIA*',
    `No. Tempahan: ${order.id}`,
    '',
    `Hai ${firstName}, status tempahan anda kini: *${meta.label}*`,
    '',
    ...(order.status === 'siap' && order.fulfilment === 'delivery'
      ? ['Pizza anda sedang dalam perjalanan ke alamat anda.']
      : order.status === 'siap' && order.fulfilment === 'pickup'
        ? ['Sila ambil tempahan anda di kedai Pizzadonia.']
        : [STATUS_NOTE[order.status]]),
    '',
    '*Pesanan*',
    ...order.items.map(
      (item, index) =>
        `${index + 1}. ${item.name} (${item.sizeLabel}) x${item.qty} — ${rm(item.price * item.qty)}`,
    ),
    '',
    `Jumlah: *${rm(order.total)}*`,
    '',
    `Bayaran: ${paymentLabel(order.payment)} — *${paymentStatusLabel(order.paymentStatus)}*`,
    ...(order.paymentStatus === 'unpaid' && order.payment === 'qr'
      ? ['Sila selesaikan bayaran QR pada halaman tempahan anda.']
      : []),
    '',
    'Terima kasih! 🍕',
  ]
  return lines.join('\n')
}

export function statusWhatsAppLink(order: Order) {
  return `https://wa.me/${waPhone(order.phone)}?text=${encodeURIComponent(buildStatusMessage(order))}`
}
