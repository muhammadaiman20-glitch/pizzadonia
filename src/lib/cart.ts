import { SHOP } from '../config'
import { getPizza } from '../data/menu'
import { paymentLabel, paymentStatusLabel } from './payment'
import type { CartLine, OrderItem, OrderLocation, Payment, PaymentStatus } from '../types'

export interface CartDetails {
  items: OrderItem[]
  subtotal: number
  count: number
}

export function cartDetails(lines: CartLine[]): CartDetails {
  const items: OrderItem[] = []
  for (const line of lines) {
    const pizza = getPizza(line.itemId)
    const size = pizza?.sizes.find((option) => option.id === line.sizeId)
    if (!pizza || !size) continue
    items.push({
      itemId: pizza.id,
      name: pizza.name,
      sizeId: size.id,
      sizeLabel: size.label,
      price: size.price,
      qty: line.qty,
    })
  }
  return {
    items,
    subtotal: items.reduce((sum, item) => sum + item.price * item.qty, 0),
    count: items.reduce((sum, item) => sum + item.qty, 0),
  }
}

export function deliveryFeeFor(subtotal: number, fulfilment: 'delivery' | 'pickup') {
  if (fulfilment === 'pickup') return 0
  if (subtotal >= SHOP.delivery.freeAbove || subtotal <= 0) return 0
  return SHOP.delivery.fee
}

export function buildWhatsAppMessage(order: {
  id: string
  name: string
  phone: string
  fulfilment: 'delivery' | 'pickup'
  address: string
  location?: OrderLocation | null
  payment: Payment
  paymentStatus?: PaymentStatus
  notes: string
  items: OrderItem[]
  subtotal: number
  deliveryFee: number
  total: number
}) {
  const lines = [
    '*TEMPAHAN BARU — PIZZADONIA*',
    `No. Tempahan: ${order.id}`,
    '',
    `Nama: ${order.name}`,
    `Telefon: ${order.phone}`,
    `Cara: ${order.fulfilment === 'delivery' ? 'Penghantaran' : 'Ambil sendiri'}`,
  ]
  if (order.fulfilment === 'delivery' && order.address) lines.push(`Alamat: ${order.address}`)
  if (order.fulfilment === 'delivery' && order.location?.url)
    lines.push(`Lokasi peta: ${order.location.url}`)
  lines.push(
    `Bayaran: ${paymentLabel(order.payment)} (${paymentStatusLabel(order.paymentStatus ?? 'unpaid')})`,
  )
  lines.push('', '*Pesanan*')
  order.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name} (${item.sizeLabel}) x${item.qty} — RM${(item.price * item.qty).toFixed(2)}`)
  })
  lines.push('', `Subtotal: RM${order.subtotal.toFixed(2)}`)
  if (order.deliveryFee > 0) lines.push(`Penghantaran: RM${order.deliveryFee.toFixed(2)}`)
  lines.push(`*Jumlah: RM${order.total.toFixed(2)}*`)
  if (order.notes.trim()) lines.push('', `Nota: ${order.notes.trim()}`)
  lines.push('', 'Sila sahkan tempahan saya. Terima kasih!')
  return lines.join('\n')
}
