import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrderStatus } from '../config'
import { SHOP, STATUS_META } from '../config'
import { getPizza } from '../data/menu'
import {
  ApiError,
  apiEnabled,
  confirmPayment as confirmPaymentApi,
  createOrder,
  getOrder,
  listOrders,
  lookupOrders,
  removeOrder,
  replaceOrders,
  updateOrder,
} from '../lib/api'
import { newOrderId } from '../lib/format'
import { mapsUrl } from '../lib/location'
import type { NewOrder, Order, OrderItem, OrderLocation, Payment, PaymentStatus } from '../types'

const ORDERS_KEY = 'pizzadonia.orders.v1'
const SEED_KEY = 'pizzadonia.orders.seeded.v1'

const demoLine = (itemId: string, sizeId: string, qty: number): OrderItem => {
  const pizza = getPizza(itemId)
  const size = pizza?.sizes.find((option) => option.id === sizeId)
  if (!pizza || !size) throw new Error(`Menu demo tidak sah: ${itemId}/${sizeId}`)
  return {
    itemId,
    name: pizza.name,
    sizeId,
    sizeLabel: size.label,
    price: size.price,
    qty,
  }
}

const buildDemoOrder = (
  minutesAgo: number,
  name: string,
  phone: string,
  fulfilment: 'delivery' | 'pickup',
  payment: Payment,
  status: OrderStatus,
  items: OrderItem[],
  address = '',
  notes = '',
  location: OrderLocation | null = null,
): Order => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
  const deliveryFee = fulfilment === 'delivery' && subtotal < SHOP.delivery.freeAbove ? SHOP.delivery.fee : 0
  const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  const paymentStatus: PaymentStatus =
    status === 'selesai' ? 'paid' : payment === 'qr' ? 'pending' : 'unpaid'
  return {
    id: newOrderId(),
    createdAt,
    updatedAt: createdAt,
    name,
    phone,
    fulfilment,
    address,
    location,
    payment,
    paymentStatus,
    notes,
    items,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    status,
  }
}

const demoLocation = (lat: number, lng: number): OrderLocation => ({
  lat,
  lng,
  url: mapsUrl(lat, lng),
  source: 'gps',
})

const makeDemoOrders = (): Order[] => [
  buildDemoOrder(
    8,
    'Nurul Aisyah',
    '0123456789',
    'delivery',
    'qr',
    'baru',
    [demoLine('ayam', '10inci', 1), demoLine('mix', '8inci', 2)],
    'No. 12, Jalan Melati 3, Taman Sri Indah',
    'Tolong potong 8 bahagian.',
    demoLocation(3.0738, 101.5183),
  ),
  buildDemoOrder(
    34,
    'Faizal Hakim',
    '0138889900',
    'pickup',
    'cod',
    'diterima',
    [demoLine('daging', '8inci', 1), demoLine('tuna', '8inci', 1)],
  ),
  buildDemoOrder(
    57,
    'Siti Mariam',
    '0172223344',
    'delivery',
    'cod',
    'dibakar',
    [demoLine('udang', '8inci', 1), demoLine('hawaii-beef', '8inci', 1)],
    'Blok B-08-12, Pangsapuri Seri Murni',
  ),
  buildDemoOrder(
    95,
    'Amirul Nizam',
    '0197771122',
    'delivery',
    'transfer',
    'siap',
    [demoLine('meatball', '10inci', 1), demoLine('ayam', '8inci', 1)],
    'No. 5, Jalan Kenari 2, Taman Kenari',
    'Rumah pagar hitam.',
    demoLocation(3.139, 101.6869),
  ),
  buildDemoOrder(
    210,
    'Chen Wei',
    '0165558899',
    'pickup',
    'cod',
    'selesai',
    [demoLine('wagyu', '10inci', 1)],
  ),
  buildDemoOrder(
    26 * 60,
    'Hafiz Roslan',
    '0112345678',
    'delivery',
    'cod',
    'selesai',
    [demoLine('hawaii-chicken', '10inci', 1), demoLine('isi-ketam', '8inci', 1)],
    'No. 21, Jalan Bunga Raya, Taman Bunga Raya',
  ),
]

function parseOrders(raw: string | null): Order[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Rekod lama mungkin tiada paymentStatus — anggap belum bayar.
    return (parsed as Order[]).map((order) => ({
      ...order,
      paymentStatus: order.paymentStatus ?? 'unpaid',
    }))
  } catch {
    return []
  }
}

function loadOrders(): Order[] {
  const stored = localStorage.getItem(ORDERS_KEY)
  if (stored !== null) return parseOrders(stored)
  if (localStorage.getItem(SEED_KEY) === '1') return []
  return makeDemoOrders()
}

function filterLocalOrders(query: string, orders: Order[]): Order[] {
  const text = query.trim().toLowerCase()
  if (!text) return []
  const digits = text.replace(/\D/g, '')
  const upper = text.toUpperCase()
  return orders.filter(
    (order) =>
      order.id.toUpperCase().includes(upper) ||
      (digits.length >= 7 && order.phone.replace(/\D/g, '').includes(digits)),
  )
}

export type OrderSource = 'local' | 'server'
export type AdminState = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Data tempahan tempatan (cache peranti) + tindakan admin berasaskan API.
 *
 * Laluan awam hanya memanggil endpoint awam (cipta / baca satu / cari /
 * sahkan bayaran). Senarai penuh hanya dimuatkan selepas dashboard dibuka
 * dan PIN dihantar pada panggilan admin sahaja.
 */
export function useOrders() {
  const [orders, setOrders] = useState<Order[]>(loadOrders)
  const [adminOrders, setAdminOrders] = useState<Order[]>([])
  const [source, setSource] = useState<OrderSource>('local')
  const [adminState, setAdminState] = useState<AdminState>('idle')
  const [adminError, setAdminError] = useState('')

  const ordersRef = useRef(orders)
  const adminOrdersRef = useRef(adminOrders)
  const sourceRef = useRef<OrderSource>('local')

  const commitLocal = useCallback((updater: (current: Order[]) => Order[]) => {
    setOrders((current) => {
      const next = updater(current)
      ordersRef.current = next
      return next
    })
  }, [])

  const commitAdmin = useCallback((updater: (current: Order[]) => Order[]) => {
    setAdminOrders((current) => {
      const next = updater(current)
      adminOrdersRef.current = next
      return next
    })
  }, [])

  const markSource = useCallback((next: OrderSource) => {
    sourceRef.current = next
    setSource(next)
  }, [])

  /** Ralat 404 bermaksud tempahan hanya wujud pada cache peranti (demo). */
  const reportSaveError = useCallback((error: unknown, message: string) => {
    if (error instanceof ApiError && error.status === 404) return
    console.warn('[pizzadonia]', message, error)
    setAdminError(message)
  }, [])

  // Kekalkan cache peranti untuk fallback/offline.
  useEffect(() => {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
    localStorage.setItem(SEED_KEY, '1')
  }, [orders])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ORDERS_KEY || sourceRef.current !== 'local') return
      const next = parseOrders(event.newValue)
      ordersRef.current = next
      setOrders(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /** Muatkan senarai penuh untuk dashboard (PIN diperlukan oleh API). */
  const loadAdminOrders = useCallback(async () => {
    if (!apiEnabled) {
      markSource('local')
      setAdminOrders(ordersRef.current)
      adminOrdersRef.current = ordersRef.current
      setAdminState('ready')
      setAdminError('')
      return
    }

    setAdminState('loading')
    setAdminError('')
    try {
      const remote = await listOrders()
      adminOrdersRef.current = remote
      setAdminOrders(remote)
      markSource('server')
      setAdminState('ready')
    } catch (error) {
      console.warn('[pizzadonia] gagal muat tempahan admin:', error)
      adminOrdersRef.current = ordersRef.current
      setAdminOrders(ordersRef.current)
      markSource('local')
      setAdminState('error')
      setAdminError(
        error instanceof Error
          ? error.message
          : 'API tidak tersedia — memaparkan tempahan pada peranti ini.',
      )
    }
  }, [markSource])

  /** Cipta tempahan serta-merta pada peranti, kemudian simpan ke D1. */
  const addOrder = useCallback(
    (input: NewOrder) => {
      const now = new Date().toISOString()
      const order: Order = {
        ...input,
        id: newOrderId(),
        createdAt: now,
        updatedAt: now,
        status: 'baru',
        paymentStatus: 'unpaid',
      }
      commitLocal((current) => [order, ...current])

      if (apiEnabled) {
        void createOrder(order)
          .then((saved) => {
            markSource('server')
            commitLocal((current) =>
              current.map((existing) => (existing.id === saved.id ? saved : existing)),
            )
          })
          .catch((error: unknown) => {
            markSource('local')
            console.warn('[pizzadonia] gagal simpan tempahan ke D1:', error)
          })
      }

      return order
    },
    [commitLocal, markSource],
  )

  /** Ambil satu tempahan dari server (fallback kepada cache peranti). */
  const fetchOrder = useCallback(
    async (id: string): Promise<Order | null> => {
      const local = ordersRef.current.find((order) => order.id === id) ?? null
      if (!apiEnabled) return local

      try {
        const remote = await getOrder(id)
        markSource('server')
        commitLocal((current) => {
          const exists = current.some((order) => order.id === remote.id)
          return exists
            ? current.map((order) => (order.id === remote.id ? remote : order))
            : [remote, ...current]
        })
        return remote
      } catch (error) {
        console.warn('[pizzadonia] gagal ambil tempahan:', error)
        return local
      }
    },
    [commitLocal, markSource],
  )

  /** Cari tempahan mengikut no. tempahan / telefon. */
  const searchOrders = useCallback(
    async (query: string): Promise<Order[]> => {
      if (!apiEnabled) return filterLocalOrders(query, ordersRef.current)
      try {
        const remote = await lookupOrders(query)
        markSource('server')
        return remote
      } catch (error) {
        console.warn('[pizzadonia] carian API gagal, guna cache peranti:', error)
        return filterLocalOrders(query, ordersRef.current)
      }
    },
    [markSource],
  )

  /** Pelanggan sahkan bayaran QR (unpaid → pending). */
  const confirmPayment = useCallback(
    async (id: string): Promise<Order | null> => {
      const current =
        ordersRef.current.find((order) => order.id === id) ??
        adminOrdersRef.current.find((order) => order.id === id)
      const optimistic = current
        ? { ...current, paymentStatus: 'pending' as const, updatedAt: new Date().toISOString() }
        : null

      if (optimistic) {
        commitLocal((list) => list.map((order) => (order.id === id ? optimistic : order)))
        commitAdmin((list) => list.map((order) => (order.id === id ? optimistic : order)))
      }

      if (!apiEnabled) return optimistic

      try {
        const saved = await confirmPaymentApi(id)
        markSource('server')
        commitLocal((list) => list.map((order) => (order.id === id ? saved : order)))
        commitAdmin((list) => list.map((order) => (order.id === id ? saved : order)))
        return saved
      } catch (error) {
        console.warn('[pizzadonia] gagal hantar pengesahan bayaran:', error)
        return optimistic
      }
    },
    [commitAdmin, commitLocal, markSource],
  )

  const updateStatus = useCallback(
    (id: string, status: OrderStatus) => {
      const now = new Date().toISOString()
      const patch = (order: Order): Order => ({ ...order, status, updatedAt: now })
      commitLocal((list) => list.map((order) => (order.id === id ? patch(order) : order)))
      commitAdmin((list) => list.map((order) => (order.id === id ? patch(order) : order)))
      if (apiEnabled) {
        void updateOrder(id, { status }).catch((error: unknown) => {
          reportSaveError(error, 'Gagal simpan status ke server. Tekan muat semula.')
        })
      }
    },
    [commitAdmin, commitLocal, reportSaveError],
  )

  const advanceStatus = useCallback(
    (id: string) => {
      const current =
        adminOrdersRef.current.find((order) => order.id === id) ??
        ordersRef.current.find((order) => order.id === id)
      if (!current) return
      const next = STATUS_META[current.status].next
      if (!next) return
      updateStatus(id, next)
    },
    [updateStatus],
  )

  const setPaymentStatus = useCallback(
    (id: string, paymentStatus: PaymentStatus) => {
      const now = new Date().toISOString()
      const patch = (order: Order): Order => ({ ...order, paymentStatus, updatedAt: now })
      commitLocal((list) => list.map((order) => (order.id === id ? patch(order) : order)))
      commitAdmin((list) => list.map((order) => (order.id === id ? patch(order) : order)))
      if (apiEnabled) {
        void updateOrder(id, { paymentStatus }).catch((error: unknown) => {
          reportSaveError(error, 'Gagal simpan status bayaran ke server.')
        })
      }
    },
    [commitAdmin, commitLocal, reportSaveError],
  )

  const deleteOrder = useCallback(
    (id: string) => {
      commitLocal((list) => list.filter((order) => order.id !== id))
      commitAdmin((list) => list.filter((order) => order.id !== id))
      if (apiEnabled) {
        void removeOrder(id).catch((error: unknown) => {
          reportSaveError(error, 'Gagal padam tempahan di server.')
        })
      }
    },
    [commitAdmin, commitLocal, reportSaveError],
  )

  const resetDemo = useCallback(() => {
    const demo = makeDemoOrders()
    commitLocal(() => demo)
    commitAdmin(() => demo)
    if (apiEnabled && sourceRef.current === 'server') {
      void replaceOrders(demo)
        .then(() => markSource('server'))
        .catch((error: unknown) => {
          console.warn('[pizzadonia] gagal muat demo ke server:', error)
          setAdminError('Gagal muat data demo ke server.')
        })
    }
  }, [commitAdmin, commitLocal, markSource])

  const clearAll = useCallback(() => {
    commitLocal(() => [])
    commitAdmin(() => [])
    if (apiEnabled && sourceRef.current === 'server') {
      void replaceOrders([]).catch((error: unknown) => {
        console.warn('[pizzadonia] gagal padam semua di server:', error)
        setAdminError('Gagal padam semua tempahan di server.')
      })
    }
  }, [commitAdmin, commitLocal])

  return {
    /** Cache tempahan pada peranti ini (fallback/offline). */
    orders,
    /** Senarai penuh dari D1 selepas dashboard dibuka. */
    adminOrders,
    adminState,
    adminError,
    source,
    addOrder,
    fetchOrder,
    searchOrders,
    confirmPayment,
    loadAdminOrders,
    updateStatus,
    advanceStatus,
    setPaymentStatus,
    deleteOrder,
    resetDemo,
    clearAll,
  }
}
