import { useEffect } from 'react'
import { appRole, useRoute, useShop } from './lib.js'
import { AppUpdateBar, AppUpdateCard } from './components/AppBits.jsx'
import AppLogin from './pages/AppLogin.jsx'
import { PinPromptHost } from './components/PinPrompt.jsx'
import SupportChat from './components/SupportChat.jsx'
import Shop from './pages/Shop.jsx'
import Checkout from './pages/Checkout.jsx'
import OrderStatus from './pages/OrderStatus.jsx'
import Admin from './pages/Admin.jsx'
import Account from './pages/Account.jsx'
import Staff from './pages/Staff.jsx'
import Wallet from './pages/Wallet.jsx'
import TgBridge from './pages/TgBridge.jsx'

export default function App() {
  const { path } = useRoute()
  const { shop } = useShop()
  const staffPage = appRole === 'seller' || ['/admin', '/dapur', '/rider', '/tg', '/app-login'].includes(path)
  // Pizzadonia Seller always opens on the dashboard
  useEffect(() => {
    if (appRole === 'seller' && path !== '/admin') location.replace('#/admin')
  }, [path])
  return (
    <>
      <AppUpdateBar />
      {shop?.offline && (
        <div role="status" className="bg-tomato px-4 py-3 text-center text-sm font-semibold text-white">
          Menu boleh dilihat. Sistem pesanan dan log masuk belum tersedia — sila cuba lagi nanti.
        </div>
      )}
      <Page />
      {appRole === 'customer' && path === '/akaun' && <div className="mx-auto max-w-xl px-4 pb-8"><AppUpdateCard /></div>}
      {!staffPage && <SupportChat />}
      <PinPromptHost />
    </>
  )
}

function Page() {
  const { path, query } = useRoute()
  if (appRole === 'seller') return <Admin />
  // the customer app has no seller, kitchen or rider pages (those stay in the Seller app and the browser)
  if (appRole === 'customer' && ['/admin', '/dapur', '/rider', '/tg', '/app-login'].includes(path)) return <Shop />
  if (path === '/app-login') return <AppLogin />
  if (path === '/checkout') return <Checkout />
  if (path.startsWith('/order/')) return <OrderStatus id={decodeURIComponent(path.slice(7))} token={query.get('t') || ''} />
  if (path === '/admin') return <Admin />
  if (path === '/tg') return <TgBridge />
  if (path === '/akaun') return <Account />
  if (path === '/dompet') return <Wallet />
  if (path === '/dapur') return <Staff key="kitchen" role="kitchen" />
  if (path === '/rider') return <Staff key="rider" role="rider" />
  return <Shop />
}
