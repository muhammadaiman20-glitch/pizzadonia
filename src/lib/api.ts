/**
 * Klien API Pizzadonia.
 *
 * Produksi: Worker menghidangkan app + API pada origin yang sama (`/api`).
 * Pembangunan: `npm run dev` guna localStorage secara lalai. Untuk uji terhadap
 * Worker yang sudah deploy, tetapkan `VITE_API_BASE`:
 *
 *   VITE_API_BASE=https://pizzadonia.<subdomain>.workers.dev/api npm run dev
 *
 * Tetapkan `VITE_API_BASE=off` untuk paksa mod localStorage walaupun dalam build.
 *
 * Nota keselamatan: PIN admin hanya dihantar pada panggilan admin. Laluan awam
 * (cipta/baca satu tempahan/cari/sahkan bayaran) tidak menghantar PIN.
 */
import type { OrderStatus } from '../config'
import { SHOP } from '../config'
import type { Order, PaymentStatus } from '../types'

const configuredBase = import.meta.env.VITE_API_BASE as string | undefined
const API_BASE = (configuredBase ?? '/api').replace(/\/$/, '')

export const apiEnabled = configuredBase !== 'off' && (!import.meta.env.DEV || Boolean(configuredBase))

export interface OrderPatch {
  status?: OrderStatus
  paymentStatus?: PaymentStatus
}

class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export { ApiError }

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { admin?: boolean } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(options.admin ? { 'x-admin-pin': SHOP.adminPin } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(12000),
  })

  if (!response.ok) {
    let message = `API gagal (${response.status})`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* respons bukan JSON — guna mesej lalai */
    }
    throw new ApiError(response.status, message)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new ApiError(502, 'API tidak tersedia.')
  }

  return (await response.json()) as T
}

// ---- Laluan awam ----

export async function createOrder(order: Order): Promise<Order> {
  const data = await request<{ order: Order }>('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  })
  return data.order
}

export async function getOrder(id: string): Promise<Order> {
  const data = await request<{ order: Order }>(`/orders/${encodeURIComponent(id)}`)
  return data.order
}

export async function lookupOrders(query: string): Promise<Order[]> {
  const data = await request<{ orders: Order[] }>(
    `/orders/lookup?q=${encodeURIComponent(query.trim())}`,
  )
  return data.orders
}

/** Pelanggan sahkan bayaran QR — server hanya membenarkan status `pending`. */
export async function confirmPayment(id: string): Promise<Order> {
  const data = await request<{ order: Order }>(
    `/orders/${encodeURIComponent(id)}/payment`,
    {
      method: 'POST',
      body: JSON.stringify({ paymentStatus: 'pending' }),
    },
  )
  return data.order
}

// ---- Laluan admin (PIN) ----

export async function listOrders(): Promise<Order[]> {
  const data = await request<{ orders: Order[] }>('/orders', {}, { admin: true })
  return data.orders
}

export async function updateOrder(id: string, patch: OrderPatch): Promise<Order> {
  const data = await request<{ order: Order }>(
    `/orders/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    { admin: true },
  )
  return data.order
}

export async function removeOrder(id: string): Promise<void> {
  await request<{ deleted: string }>(
    `/orders/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    { admin: true },
  )
}

/** Ganti semua tempahan di server (demo / padam semua). */
export async function replaceOrders(orders: Order[]): Promise<void> {
  await request<{ orders: Order[] }>(
    '/orders/reset',
    {
      method: 'POST',
      body: JSON.stringify({ orders }),
    },
    { admin: true },
  )
}
