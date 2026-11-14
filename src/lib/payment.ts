import type { Payment, PaymentStatus } from '../types'

export const PAYMENT_LABEL: Record<Payment, string> = {
  // Hanya untuk tempahan lama; COD tidak lagi ditawarkan pada checkout.
  cod: 'Tunai (COD)',
  transfer: 'Transfer bank',
  qr: 'QR DuitNow',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Belum bayar',
  pending: 'Menunggu pengesahan',
  paid: 'Telah dibayar',
}

export function paymentLabel(payment: Payment) {
  return PAYMENT_LABEL[payment]
}

export function paymentStatusLabel(status: PaymentStatus) {
  return PAYMENT_STATUS_LABEL[status]
}
