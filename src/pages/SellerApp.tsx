import { useCallback, useEffect, useState } from 'react'
import { Dashboard } from './Dashboard'
import { Toast } from '../components/Toast'
import { UpdateBanner } from '../components/UpdateBanner'
import { useOrders } from '../hooks/useOrders'

interface ToastState {
  id: number
  text: string
}

/**
 * Aplikasi penjual — dimuatkan hanya pada `/seller.html`, berasingan
 * sepenuhnya daripada laman pelanggan. Dashboard tidak dibundelkan
 * bersama laman utama pelanggan.
 */
export function SellerApp() {
  const {
    orders,
    adminOrders,
    adminState,
    adminError,
    source,
    loadAdminOrders,
    updateStatus,
    advanceStatus,
    setPaymentStatus,
    deleteOrder,
    clearAll,
  } = useOrders()
  const [toast, setToast] = useState<ToastState | null>(null)

  const notify = useCallback((text: string) => {
    setToast({ id: Date.now(), text })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <>
      <Dashboard
        orders={adminOrders}
        fallbackOrders={orders}
        source={source}
        adminState={adminState}
        adminError={adminError}
        loadAdminOrders={loadAdminOrders}
        updateStatus={updateStatus}
        advanceStatus={advanceStatus}
        setPaymentStatus={setPaymentStatus}
        deleteOrder={deleteOrder}
        clearAll={clearAll}
        notify={notify}
      />
      <Toast key={toast?.id ?? 'empty'} message={toast?.text ?? null} />
      <UpdateBanner />
    </>
  )
}
