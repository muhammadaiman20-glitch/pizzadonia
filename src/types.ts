import type { OrderStatus } from './config'

export interface CartLine {
  key: string
  itemId: string
  sizeId: string
  qty: number
}

export interface OrderItem {
  itemId: string
  name: string
  sizeId: string
  sizeLabel: string
  price: number
  qty: number
}

export type Fulfilment = 'delivery' | 'pickup'
/**
 * `cod` dikekalkan untuk memaparkan tempahan lama. Tempahan baharu hanya
 * boleh menggunakan `transfer` atau `qr` — pilihan COD dibuang.
 */
export type Payment = 'cod' | 'transfer' | 'qr'
export type PaymentStatus = 'unpaid' | 'pending' | 'paid'

export interface OrderLocation {
  /** Pautan peta yang dibuka oleh penjual/penghantar. */
  url: string
  lat?: number
  lng?: number
  /** `gps` = diambil dari peranti, `link` = ditampal oleh pelanggan. */
  source: 'gps' | 'link'
}

export interface Order {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  phone: string
  fulfilment: Fulfilment
  address: string
  location?: OrderLocation | null
  payment: Payment
  paymentStatus: PaymentStatus
  notes: string
  items: OrderItem[]
  subtotal: number
  deliveryFee: number
  total: number
  status: OrderStatus
}

export type NewOrder = Omit<
  Order,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'paymentStatus'
>
