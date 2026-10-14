import { useRoute, useShop } from './lib.js'
import { PinPromptHost } from './components/PinPrompt.jsx'
import SupportChat from './components/SupportChat.jsx'
import Shop from './pages/Shop.jsx'
import Checkout from './pages/Checkout.jsx'
import OrderStatus from './pages/OrderStatus.jsx'
import Admin from './pages/Admin.jsx'
import Account from './pages/Account.jsx'
import Staff from './pages/Staff.jsx'
import Wallet from './pages/Wallet.jsx'

export default function App() {
  const { path } = useRoute()
  const { shop } = useShop()
  const staffPage = ['/admin', '/dapur', '/rider'].includes(path)
  return (
    <>
      {shop?.offline && (
        <div role="status" className="bg-tomato px-4 py-3 text-center text-sm font-semibold text-white">
          Menu boleh dilihat. Sistem pesanan dan log masuk belum tersedia — sila cuba lagi nanti.
        </div>
      )}
      <Page />
      {!staffPage && <SupportChat />}
      <PinPromptHost />
    </>
  )
}

function Page() {
  const { path, query } = useRoute()
  if (path === '/checkout') return <Checkout />
  if (path.startsWith('/order/')) return <OrderStatus id={decodeURIComponent(path.slice(7))} token={query.get('t') || ''} />
  if (path === '/admin') return <Admin />
  if (path === '/akaun') return <Account />
  if (path === '/dompet') return <Wallet />
  if (path === '/dapur') return <Staff key="kitchen" role="kitchen" />
  if (path === '/rider') return <Staff key="rider" role="rider" />
  return <Shop />
}
