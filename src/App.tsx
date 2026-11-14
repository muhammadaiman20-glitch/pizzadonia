import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import { cartDetails } from './lib/cart'
import { getPizza } from './data/menu'
import { rm } from './lib/format'
import { useCart } from './hooks/useCart'
import { useOrders } from './hooks/useOrders'
import { useHashRoute } from './hooks/useHashRoute'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { MenuSection } from './components/MenuSection'
import { Features } from './components/Features'
import { HowItWorks } from './components/HowItWorks'
import { Testimonials } from './components/Testimonials'
import { TrackTeaser } from './components/TrackTeaser'
import { CartDrawer } from './components/CartDrawer'
import { Toast } from './components/Toast'

// Halaman dimuatkan secara berasingan supaya laman utama kekal ringan.
const CheckoutView = lazy(() =>
  import('./pages/CheckoutView').then((module) => ({ default: module.CheckoutView })),
)
const OrderSuccess = lazy(() =>
  import('./pages/OrderSuccess').then((module) => ({ default: module.OrderSuccess })),
)
const TrackView = lazy(() =>
  import('./pages/TrackView').then((module) => ({ default: module.TrackView })),
)
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })),
)

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
      <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-tomato-deep" />
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Memuatkan…</p>
    </div>
  )
}

interface ToastState {
  id: number
  text: string
}

function App() {
  const { path, navigate, scrollToId } = useHashRoute()
  const cart = useCart()
  const {
    orders,
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
  } = useOrders()
  const [cartOpen, setCartOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const notify = useCallback((text: string) => {
    setToast({ id: Date.now(), text })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Muat turun chunk halaman lain semasa browser lapang supaya navigasi terasa pantas.
  useEffect(() => {
    const prefetch = () => {
      void import('./pages/Dashboard')
      void import('./pages/CheckoutView')
      void import('./pages/TrackView')
    }
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 2500 })
      return () => window.cancelIdleCallback(idleId)
    }
    const timer = window.setTimeout(prefetch, 1500)
    return () => window.clearTimeout(timer)
  }, [])

  const details = useMemo(() => cartDetails(cart.lines), [cart.lines])

  const handleAdd = useCallback(
    (itemId: string, sizeId: string) => {
      cart.add(itemId, sizeId)
      const pizza = getPizza(itemId)
      notify(`${pizza?.name ?? 'Pizza'} ditambah ke beg`)
    },
    [cart, notify],
  )

  const goMenu = useCallback(() => {
    setCartOpen(false)
    scrollToId('menu')
  }, [scrollToId])

  const goHow = useCallback(() => {
    setCartOpen(false)
    scrollToId('cara')
  }, [scrollToId])

  const goCheckout = useCallback(() => {
    setCartOpen(false)
    navigate('/checkout')
  }, [navigate])

  const [pathname, query] = path.split('?')
  const isDashboard = pathname === '/dashboard'
  const orderMatch = pathname.match(/^\/order\/(.+)$/)
  const orderId = orderMatch ? decodeURIComponent(orderMatch[1]) : null
  const currentOrder = orderId ? orders.find((order) => order.id === orderId) : undefined
  const trackQuery = new URLSearchParams(query ?? '').get('q') ?? ''

  const content = (() => {
    if (isDashboard) {
      return (
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
          resetDemo={resetDemo}
          clearAll={clearAll}
          notify={notify}
        />
      )
    }

    if (pathname === '/checkout') {
      return (
        <CheckoutView
          lines={cart.lines}
          onBack={goMenu}
          onBrowse={goMenu}
          addOrder={addOrder}
          clearCart={cart.clear}
          notify={notify}
          goToOrder={(id) => navigate(`/order/${id}`)}
        />
      )
    }

    if (pathname === '/track') {
      return (
        <TrackView
          recentOrders={orders}
          initialQuery={trackQuery}
          onSearch={searchOrders}
        />
      )
    }

    if (orderMatch) {
      return (
        <OrderSuccess
          orderId={orderId ?? ''}
          initialOrder={currentOrder}
          notify={notify}
          fetchOrder={fetchOrder}
          confirmPayment={confirmPayment}
        />
      )
    }

    if (pathname === '/menu') {
      return (
        <>
          <MenuSection onAdd={handleAdd} onCheckout={goCheckout} cartCount={cart.count} />
          <HowItWorks onMenu={goMenu} />
        </>
      )
    }

    return (
      <>
        <Hero onMenu={goMenu} onHow={goHow} />
        <Marquee />
        <MenuSection onAdd={handleAdd} onCheckout={goCheckout} cartCount={cart.count} />
        <Features />
        <HowItWorks onMenu={goMenu} />
        <Testimonials />
        <TrackTeaser />
      </>
    )
  })()

  return (
    <div className="min-h-screen bg-cream">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-cream"
      >
        Langkau ke kandungan
      </a>

      {!isDashboard && (
        <Header cartCount={cart.count} onCart={() => setCartOpen(true)} onMenu={goMenu} onHow={goHow} />
      )}

      <main id="main">
        <Suspense fallback={<RouteFallback />}>{content}</Suspense>
      </main>

      {!isDashboard && <Footer onMenu={goMenu} onHow={goHow} />}

      {!isDashboard && cart.count > 0 && !cartOpen && pathname !== '/checkout' && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 z-30 flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-cream shadow-2xl animate-rise md:hidden"
        >
          <span className="flex items-center gap-2 text-xs font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-cheese text-ink">
              <ShoppingBag className="h-3.5 w-3.5" />
            </span>
            {cart.count} item · {rm(details.subtotal)}
          </span>
          <span className="flex items-center gap-1 text-xs font-extrabold text-cheese">
            Lihat Beg <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={cart.lines}
        setQty={cart.setQty}
        remove={cart.remove}
        onCheckout={goCheckout}
        onBrowse={goMenu}
      />

      <Toast key={toast?.id ?? 'empty'} message={toast?.text ?? null} />
    </div>
  )
}

export default App
