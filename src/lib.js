import { autoRefresh } from './sync.js'
export { autoRefresh } from './sync.js'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

// owner credential: a PIN ("0000") or a Google owner session ("g:<token>")
export const adminHeaders = (cred) => (String(cred).startsWith('g:') ? { 'x-admin-session': String(cred).slice(2) } : { 'x-admin-pin': String(cred) })
export const ownerSession = {
  get: () => store.get('pz.adminSession', null),
  set: (t) => store.set('pz.adminSession', t || null),
}

export const rm = (v) => 'RM' + (Number(v) || 0).toFixed(2)

export async function api(path, { method = 'GET', body, pin, txPin } = {}) {
  const headers = {}
  if (txPin) headers['x-admin-txpin'] = txPin
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (pin) Object.assign(headers, adminHeaders(pin))
  const session = store.get('pz.session', null)
  if (session && !pin) headers.Authorization = `Bearer ${session}`
  const r = await fetch(path, { method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error || j.reason || `Ralat ${r.status}`), { status: r.status })
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) window.dispatchEvent(new Event('pz:data-changed'))
  return j
}

// ---- storage that never breaks the page (private mode, blocked storage)
export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k)
      return v == null ? d : JSON.parse(v)
    } catch {
      return d
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  },
}

// ---- cart: { [itemId]: qty }, shared by every component
let cart = store.get('pz.cart', {})
const subs = new Set()
function setCart(next) {
  cart = next
  store.set('pz.cart', cart)
  subs.forEach((f) => f())
}
export const cartApi = {
  add: (id, n = 1) => setCart({ ...cart, [id]: Math.min(20, (cart[id] || 0) + n) }),
  set: (id, q) => {
    const next = { ...cart }
    if (q <= 0) delete next[id]
    else next[id] = Math.min(20, q)
    setCart(next)
  },
  clear: () => setCart({}),
}
export function useCart() {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => cart)
}
// cart keys are "itemId" or "itemId|sizeId"; each line carries its own price and a label with the size
export const cartKey = (id, size) => (size ? `${id}|${size}` : id)
export function cartLines(c, menu) {
  return Object.entries(c)
    .map(([key, qty]) => {
      const [id, sid = ''] = key.split('|')
      const item = menu.find((m) => m.id === id)
      if (!item) return null
      const sizes = item.sizes?.length ? item.sizes : null
      const size = sizes ? sizes.find((z) => z.id === sid) || (sid ? null : sizes[0]) : null
      if (sizes && !size) return null
      return { key, item, size, qty, price: size ? size.price : item.price, label: size ? `${item.name} (${size.label})` : item.name }
    })
    .filter(Boolean)
}

// ---- live shop data, shared by all mounted consumers (one poller per tab)
let shopState = { shop: null, error: null }
let shopPromise = null
let stopShopSync
const shopSubs = new Set()
async function refreshShop() {
  if (shopPromise) return shopPromise
  shopPromise = (async () => {
    try {
      const shop = await api('/api/shop')
      if (JSON.stringify(shop) !== JSON.stringify(shopState.shop) || shopState.error) {
        shopState = { shop, error: null }
        shopSubs.forEach(f => f())
      }
    } catch (e) {
      shopState = { ...shopState, error: e.message }
      shopSubs.forEach(f => f())
    } finally { shopPromise = null }
  })()
  return shopPromise
}
function subscribeShop(f) {
  shopSubs.add(f)
  if (!stopShopSync) stopShopSync = autoRefresh(refreshShop, 5000)
  return () => {
    shopSubs.delete(f)
    if (!shopSubs.size) { stopShopSync?.(); stopShopSync = null }
  }
}
export function useShop() {
  return useSyncExternalStore(subscribeShop, () => shopState)
}

// ---- tiny hash router: #/  #/checkout  #/order/PZ-0001?t=..  #/admin
export function useRoute() {
  const read = () => {
    const h = location.hash.replace(/^#/, '') || '/'
    const [p, q] = h.split('?')
    return { path: p, query: new URLSearchParams(q || '') }
  }
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const f = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return route
}
export const go = (to) => (location.hash = to)

// cashback the customer will get for this pizza total (same rule as the server's cashbackFor)
// lines = cart lines (only pizzas not in cb.exclude count); discount is shared out over the whole order
export function cashbackFromCart(cb, lines, discount = 0) {
  if (!cb) return 0
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  if (!(subtotal > 0) || (cb.minOrder && subtotal - discount < cb.minOrder)) return 0
  const eligible = lines.filter((l) => !(cb.exclude || []).includes(l.item.id)).reduce((s, l) => s + l.price * l.qty, 0)
  return cashbackOf({ ...cb, minOrder: 0 }, eligible * (1 - discount / subtotal))
}
export function cashbackOf(cb, base) {
  if (!cb || !(base > 0) || (cb.minOrder && base < cb.minOrder)) return 0
  let a = Math.floor(base * cb.percent) / 100
  if (cb.maxPerOrder > 0) a = Math.min(a, cb.maxPerOrder)
  return Math.round(a * 100) / 100
}
export const fmtDay = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' }) : '')

export const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`

// ---- customer account (phone + PIN). The session token lives in localStorage; the account data is shared.
let account = store.get('pz.session', null) ? undefined : null // undefined = still loading
const accSubs = new Set()
const setAccount = (a) => ((account = a), accSubs.forEach((f) => f()))
export const accountApi = {
  async refresh() {
    const session = store.get('pz.session', null)
    if (!session) return setAccount(null)
    if (accountRequest?.session === session) return accountRequest.promise
    const promise = (async () => {
      try {
        const fresh = await api('/api/account')
        if (store.get('pz.session', null) === session && JSON.stringify(account) !== JSON.stringify(fresh)) setAccount(fresh)
      } catch (e) {
        // A temporary network failure must not sign out the customer or clear their orders.
        if (e.status === 401 && store.get('pz.session', null) === session) {
          store.set('pz.session', null)
          setAccount(null)
        }
      } finally {
        if (accountRequest?.session === session) accountRequest = null
      }
    })()
    accountRequest = { session, promise }
    return promise
  },
  async login(phone, pin) {
    const r = await api('/api/account/login', { method: 'POST', body: { phone, pin } })
    store.set('pz.session', r.token)
    setAccount(r)
    return r
  },
  async register(name, phone, pin) {
    const r = await api('/api/account/register', { method: 'POST', body: { name, phone, pin } })
    store.set('pz.session', r.token)
    setAccount(r)
    return r
  },
  async logout() {
    await api('/api/account/logout', { method: 'POST', body: {} }).catch(() => {})
    store.set('pz.session', null)
    setAccount(null)
  },
  set: setAccount,
  /** after a successful Google sign-in / profile completion */
  signedIn(r) {
    store.set('pz.session', r.token)
    if (r.adminSession) ownerSession.set(r.adminSession) // the owner's Gmail: also signed in to the seller page
    setAccount(r)
  },
}
let stopAccountSync
let accountRequest = null
function subscribeAccount(f) {
  accSubs.add(f)
  if (!stopAccountSync) {
    stopAccountSync = autoRefresh(() => accountApi.refresh(), 5000)
    window.addEventListener('storage', sessionChanged)
  }
  return () => {
    accSubs.delete(f)
    if (!accSubs.size) {
      stopAccountSync?.(); stopAccountSync = null
      window.removeEventListener('storage', sessionChanged)
    }
  }
}
function sessionChanged(event) {
  if (event.key === 'pz.session' || event.key === null) void accountApi.refresh()
}
export function useAccount() {
  return useSyncExternalStore(subscribeAccount, () => account)
}
export const prettyPhone = (p) => (p ? '0' + String(p).replace(/^60/, '').replace(/^(\d{2})(\d{3,4})(\d{4})$/, '$1-$2 $3') : '')

/** Log in by itself once the PIN looks complete: tries `submit` after the user stops typing for `delay` ms.
 *  Each value is tried once, so a wrong PIN shows its error and waits for the button (or another edit). */
export function useAutoSubmit(value, ready, submit, delay = 600) {
  const tried = useRef('')
  useEffect(() => {
    if (!ready || tried.current === value) return
    const t = setTimeout(() => {
      tried.current = value
      submit()
    }, delay)
    return () => clearTimeout(t)
  }, [value, ready]) // eslint-disable-line react-hooks/exhaustive-deps
}
