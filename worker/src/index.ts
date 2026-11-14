/**
 * Pizzadonia API — Cloudflare Worker + D1.
 *
 * Laluan awam (pelanggan):
 *  - `POST /api/orders`              cipta tempahan
 *  - `GET  /api/orders/lookup?q=`    cari ikut no. tempahan / telefon
 *  - `GET  /api/orders/:id`          baca satu tempahan
 *  - `POST /api/orders/:id/payment`  pelanggan sahkan "sudah bayar" (pending)
 *
 * Laluan admin (token sesi `Authorization: Bearer <token>`):
 *  - `POST   /api/auth/login`        tukar PIN kepada token sesi
 *  - `GET    /api/orders`            senarai semua tempahan
 *  - `PATCH  /api/orders/:id`        tukar status / status bayaran
 *  - `DELETE /api/orders/:id`        padam tempahan
 *  - `POST   /api/orders/reset`      ganti semua tempahan (padam semua)
 *
 * Jika binding `ASSETS` disediakan, Worker turut menghidangkan `dist/` pada
 * origin yang sama supaya frontend boleh panggil `/api` tanpa CORS.
 */
import type { D1Database, ExportedHandler, Fetcher } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  ASSETS?: Fetcher
  /** Secret akaun penjual (`wrangler secret put ADMIN_PIN`). Wajib ditetapkan. */
  ADMIN_PIN?: string
  /** Pilihan: kunci tandatangan token. Jika tiada, `ADMIN_PIN` digunakan. */
  AUTH_SECRET?: string
}

interface OrderRecord {
  id: string
  createdAt: string
  updatedAt: string
  status: string
  paymentStatus: string
  total: number
  phone: string
  [key: string]: unknown
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 8
const MAX_PIN_LENGTH = 128
const ORDER_STATUSES = new Set(['baru', 'diterima', 'dibakar', 'siap', 'selesai', 'batal'])
const PAYMENT_STATUSES = new Set(['unpaid', 'pending', 'paid'])
const ID_PATTERN = /^PZ-[0-9A-Za-z-]{4,40}$/
const MAX_BODY_BYTES = 64 * 1024
const MAX_BULK_ORDERS = 200
const MAX_LOOKUP_RESULTS = 20

/**
 * Had cubaan log masuk ringkas (per isolate). Bukan pengganti rate limiting
 * global, tetapi menghalang brute force asas pada satu instance.
 */
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

/** Origin yang dibenarkan memanggil API dari domain lain (Vite dev / Pages / Capacitor). */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  // APK Capacitor yang membundle UI sendiri (bukan `server.url`).
  'https://localhost',
  'capacitor://localhost',
])

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:') return false
    return url.hostname === 'pizzadonia.pages.dev' || url.hostname.endsWith('.pizzadonia.pages.dev')
  } catch {
    return false
  }
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin')
  if (!origin || !isAllowedOrigin(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(request),
    },
  })
}

function fail(request: Request, status: number, message: string): Response {
  return json(request, { error: message }, status)
}

/** Perbandingan rentetan masa-tetap supaya PIN tidak boleh diteka melalui timing. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function clientAddress(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}

function loginBlocked(request: Request): boolean {
  const key = clientAddress(request)
  const entry = loginAttempts.get(key)
  if (!entry) return false
  if (entry.resetAt <= Date.now()) {
    loginAttempts.delete(key)
    return false
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS
}

function recordLoginFailure(request: Request): void {
  const key = clientAddress(request)
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
  } else {
    entry.count += 1
  }
  if (loginAttempts.size > 500) {
    for (const [key, value] of loginAttempts) {
      if (value.resetAt <= now) loginAttempts.delete(key)
    }
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function tokenSecret(env: Env): string | null {
  // `AUTH_SECRET` mengelakkan token menjadi tidak sah jika PIN ditukar.
  // Jika tidak ditetapkan, PIN itu sendiri menjadi kunci tandatangan.
  return env.AUTH_SECRET ?? env.ADMIN_PIN ?? null
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function signToken(secret: string): Promise<string> {
  const payload = { sub: 'seller', exp: Date.now() + TOKEN_TTL_MS }
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body))
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`
}

async function adminAuthorized(request: Request, env: Env): Promise<boolean> {
  const secret = tokenSecret(env)
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return false

  const [body, signature] = match[1].split('.')
  if (!body || !signature) return false

  try {
    const expected = new Uint8Array(
      await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body)),
    )
    const provided = base64UrlDecode(signature)
    if (provided.length !== expected.length) return false

    let diff = 0
    for (let i = 0; i < expected.length; i += 1) diff |= provided[i] ^ expected[i]
    if (diff !== 0) return false

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as {
      sub?: string
      exp?: number
    }
    return payload.sub === 'seller' && typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

/** Log masuk akaun penjual sebenar. PIN disemak di pelayan, bukan di browser. */
async function login(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_PIN) {
    return fail(request, 503, 'Akaun penjual belum dikonfigurasi pada pelayan.')
  }
  if (loginBlocked(request)) {
    return fail(request, 429, 'Terlalu banyak cubaan log masuk. Cuba lagi selepas 15 minit.')
  }

  const body = await readJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(request, 400, 'Data tidak sah.')
  }

  const pin = (body as { pin?: unknown }).pin
  if (typeof pin !== 'string' || pin.length === 0 || pin.length > MAX_PIN_LENGTH) {
    recordLoginFailure(request)
    return fail(request, 401, 'PIN tidak sah.')
  }

  if (!constantTimeEqual(pin, env.ADMIN_PIN)) {
    recordLoginFailure(request)
    return fail(request, 401, 'PIN tidak sah.')
  }

  loginAttempts.delete(clientAddress(request))
  const secret = tokenSecret(env)
  if (!secret) return fail(request, 503, 'Akaun penjual belum dikonfigurasi pada pelayan.')

  return json(request, {
    token: await signToken(secret),
    expiresIn: TOKEN_TTL_MS / 1000,
  })
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Sahkan bentuk tempahan. `admin` menentukan sama ada status/paymentStatus
 * daripada klien diterima — tempahan baru sentiasa bermula `baru`/`unpaid`.
 */
function parseOrder(value: unknown, admin = false): OrderRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const order = value as Record<string, unknown>
  if (typeof order.id !== 'string' || !ID_PATTERN.test(order.id)) return null
  if (typeof order.createdAt !== 'string' || typeof order.updatedAt !== 'string') return null
  if (typeof order.name !== 'string' || order.name.trim().length === 0 || order.name.length > 120) {
    return null
  }
  if (typeof order.phone !== 'string' || order.phone.length > 40) return null
  if (order.fulfilment !== 'delivery' && order.fulfilment !== 'pickup') return null
  if (order.payment !== 'cod' && order.payment !== 'transfer' && order.payment !== 'qr') return null
  if (typeof order.address !== 'string' || order.address.length > 500) return null
  if (typeof order.notes === 'string' && order.notes.length > 1000 === false) {
    // nota panjang ditolak di bawah
  }
  if (typeof order.notes !== 'string' || order.notes.length > 1000) return null
  if (!Array.isArray(order.items) || order.items.length === 0 || order.items.length > 100) {
    return null
  }

  let itemsTotal = 0
  for (const value of order.items) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const item = value as Record<string, unknown>
    if (typeof item.itemId !== 'string' || item.itemId.length > 80) return null
    if (typeof item.name !== 'string' || item.name.length > 120) return null
    if (typeof item.sizeId !== 'string' || item.sizeId.length > 80) return null
    if (typeof item.sizeLabel !== 'string' || item.sizeLabel.length > 80) return null
    if (!isFiniteNumber(item.price) || item.price < 0 || item.price > 10000) return null
    const qty = item.qty
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 50) return null
    itemsTotal += item.price * qty
  }

  if (!isFiniteNumber(order.subtotal) || order.subtotal < 0) return null
  if (!isFiniteNumber(order.deliveryFee) || order.deliveryFee < 0) return null
  if (!isFiniteNumber(order.total) || order.total < 0) return null
  if (Math.abs(roundMoney(order.subtotal) - roundMoney(itemsTotal)) > 0.01) return null
  if (Math.abs(roundMoney(order.total) - roundMoney(order.subtotal + order.deliveryFee)) > 0.01) {
    return null
  }

  const status =
    admin && typeof order.status === 'string' && ORDER_STATUSES.has(order.status)
      ? order.status
      : 'baru'
  const paymentStatus =
    admin && typeof order.paymentStatus === 'string' && PAYMENT_STATUSES.has(order.paymentStatus)
      ? order.paymentStatus
      : 'unpaid'

  return { ...order, status, paymentStatus } as OrderRecord
}

async function readJson(request: Request): Promise<unknown | null> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > MAX_BODY_BYTES) return null
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

async function findOrder(env: Env, id: string): Promise<OrderRecord | null> {
  const row = await env.DB.prepare('SELECT data FROM pizzadonia_orders WHERE id = ?')
    .bind(id)
    .first<{ data: string }>()
  if (!row) return null
  try {
    return JSON.parse(row.data) as OrderRecord
  } catch {
    return null
  }
}

async function saveOrder(env: Env, order: OrderRecord): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pizzadonia_orders (id, created_at, updated_at, status, payment_status, total, phone, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       updated_at = excluded.updated_at,
       status = excluded.status,
       payment_status = excluded.payment_status,
       total = excluded.total,
       phone = excluded.phone,
       data = excluded.data`,
  )
    .bind(
      order.id,
      order.createdAt,
      order.updatedAt,
      order.status,
      order.paymentStatus,
      order.total,
      order.phone,
      JSON.stringify(order),
    )
    .run()
}

async function listOrders(request: Request, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT data FROM pizzadonia_orders ORDER BY created_at DESC, id DESC LIMIT 1000',
  ).all<{ data: string }>()
  const orders = results
    .map((row) => {
      try {
        return JSON.parse(row.data) as unknown
      } catch {
        return null
      }
    })
    .filter((order): order is OrderRecord => order !== null)
  return json(request, { orders })
}

async function createOrder(request: Request, env: Env): Promise<Response> {
  const parsed = parseOrder(await readJson(request), false)
  if (!parsed) return fail(request, 400, 'Data tempahan tidak sah.')

  const now = new Date().toISOString()
  const order: OrderRecord = {
    ...parsed,
    createdAt: now,
    updatedAt: now,
    status: 'baru',
    paymentStatus: 'unpaid',
  }

  // Idempotent: ulangan POST dengan ID sama tidak menimpa perubahan admin.
  const result = await env.DB.prepare(
    `INSERT INTO pizzadonia_orders (id, created_at, updated_at, status, payment_status, total, phone, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(
      order.id,
      order.createdAt,
      order.updatedAt,
      order.status,
      order.paymentStatus,
      order.total,
      order.phone,
      JSON.stringify(order),
    )
    .run()

  if ((result.meta.changes ?? 0) === 0) {
    const existing = await findOrder(env, order.id)
    if (existing) return json(request, { order: existing })
  }

  return json(request, { order }, 201)
}

async function getOrder(request: Request, env: Env, id: string): Promise<Response> {
  const order = await findOrder(env, id)
  if (!order) return fail(request, 404, 'Tempahan tidak dijumpai.')
  return json(request, { order })
}

/** Cari tempahan awam ikut no. tempahan (awalan) atau nombor telefon (akhiran). */
async function lookupOrders(request: Request, env: Env, rawQuery: string): Promise<Response> {
  const query = rawQuery.trim()
  if (query.length < 4) return json(request, { orders: [] })

  const clauses: string[] = []
  const params: string[] = []
  const upper = query.toUpperCase()

  if (/^PZ-[0-9A-Za-z-]+$/.test(upper)) {
    clauses.push("UPPER(id) LIKE ? || '%'")
    params.push(upper)
  } else if (/^PZ/i.test(upper)) {
    clauses.push("UPPER(id) LIKE '%' || ? || '%'")
    params.push(upper)
  }

  const digits = query.replace(/\D/g, '')
  if (digits.length >= 7) {
    // Bandingkan akhiran supaya 0123456789, 60123456789 dan +60123456789 sepadan.
    const variants = new Set<string>([digits])
    if (digits.startsWith('60')) variants.add(`0${digits.slice(2)}`)
    if (digits.startsWith('0')) variants.add(`60${digits.slice(1)}`)
    for (const variant of variants) {
      clauses.push("REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', '') LIKE '%' || ?")
      params.push(variant)
    }
  }

  if (clauses.length === 0) return json(request, { orders: [] })

  const { results } = await env.DB.prepare(
    `SELECT data FROM pizzadonia_orders
      WHERE ${clauses.join(' OR ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ${MAX_LOOKUP_RESULTS}`,
  )
    .bind(...params)
    .all<{ data: string }>()

  const orders = results
    .map((row) => {
      try {
        return JSON.parse(row.data) as unknown
      } catch {
        return null
      }
    })
    .filter((order): order is OrderRecord => order !== null)
  return json(request, { orders })
}

/**
 * Pelanggan sahkan bayaran QR. Hanya boleh menukar `unpaid` → `pending`;
 * status `paid` hanya boleh ditetapkan oleh admin selepas semakan bank.
 */
async function confirmPayment(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(request, 400, 'Data bayaran tidak sah.')
  }
  const paymentStatus = (body as Record<string, unknown>).paymentStatus
  if (paymentStatus !== 'pending') return fail(request, 400, 'Status bayaran tidak sah.')

  const current = await findOrder(env, id)
  if (!current) return fail(request, 404, 'Tempahan tidak dijumpai.')
  if (current.payment !== 'qr') return fail(request, 400, 'Tempahan ini bukan bayaran QR.')
  if (current.paymentStatus === 'paid' || current.paymentStatus === 'pending') {
    return json(request, { order: current })
  }

  const next: OrderRecord = {
    ...current,
    paymentStatus: 'pending',
    updatedAt: new Date().toISOString(),
  }
  await saveOrder(env, next)
  return json(request, { order: next })
}

async function patchOrder(request: Request, env: Env, id: string): Promise<Response> {
  const body = await readJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(request, 400, 'Data kemas kini tidak sah.')
  }
  const patch = body as Record<string, unknown>

  const current = await findOrder(env, id)
  if (!current) return fail(request, 404, 'Tempahan tidak dijumpai.')

  const next: OrderRecord = {
    ...current,
    updatedAt: new Date().toISOString(),
  }

  if (patch.status !== undefined) {
    if (typeof patch.status !== 'string' || !ORDER_STATUSES.has(patch.status)) {
      return fail(request, 400, 'Status tidak sah.')
    }
    next.status = patch.status
  }
  if (patch.paymentStatus !== undefined) {
    if (typeof patch.paymentStatus !== 'string' || !PAYMENT_STATUSES.has(patch.paymentStatus)) {
      return fail(request, 400, 'Status bayaran tidak sah.')
    }
    next.paymentStatus = patch.paymentStatus
  }

  await saveOrder(env, next)
  return json(request, { order: next })
}

async function deleteOrder(request: Request, env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare('DELETE FROM pizzadonia_orders WHERE id = ?').bind(id).run()
  if ((result.meta.changes ?? 0) === 0) return fail(request, 404, 'Tempahan tidak dijumpai.')
  return json(request, { deleted: id })
}

/** Ganti semua tempahan — digunakan oleh butang "padam semua". */
async function replaceOrders(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(request, 400, 'Data tidak sah.')
  }
  const list = (body as { orders?: unknown }).orders
  if (!Array.isArray(list) || list.length > MAX_BULK_ORDERS) {
    return fail(request, 400, `Senarai tempahan mesti array (maksimum ${MAX_BULK_ORDERS}).`)
  }

  const orders: OrderRecord[] = []
  for (const value of list) {
    const order = parseOrder(value, true)
    if (!order) return fail(request, 400, 'Terdapat tempahan tidak sah dalam senarai.')
    orders.push(order)
  }

  const statements = [env.DB.prepare('DELETE FROM pizzadonia_orders')]
  for (const order of orders) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO pizzadonia_orders (id, created_at, updated_at, status, payment_status, total, phone, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        order.id,
        order.createdAt,
        order.updatedAt,
        order.status,
        order.paymentStatus,
        order.total,
        order.phone,
        JSON.stringify(order),
      ),
    )
  }
  await env.DB.batch(statements)

  return json(request, { orders })
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }

  if (url.pathname === '/api/health') {
    return json(request, { ok: true, service: 'pizzadonia' })
  }

  // ---- Log masuk akaun penjual (awam, PIN disemak di pelayan) ----
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    return login(request, env)
  }

  // ---- Laluan awam ----
  if (url.pathname === '/api/orders' && request.method === 'POST') {
    return createOrder(request, env)
  }

  if (url.pathname === '/api/orders/lookup' && request.method === 'GET') {
    return lookupOrders(request, env, url.searchParams.get('q') ?? '')
  }

  const paymentMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/payment$/)
  if (paymentMatch && request.method === 'POST') {
    const id = decodeURIComponent(paymentMatch[1])
    if (!ID_PATTERN.test(id)) return fail(request, 400, 'Nombor tempahan tidak sah.')
    return confirmPayment(request, env, id)
  }

  const singleMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/)
  if (singleMatch && request.method === 'GET') {
    const id = decodeURIComponent(singleMatch[1])
    if (!ID_PATTERN.test(id)) return fail(request, 400, 'Nombor tempahan tidak sah.')
    return getOrder(request, env, id)
  }

  // ---- Laluan admin (token sesi) ----
  if (!(await adminAuthorized(request, env))) {
    return fail(request, 401, 'Sesi tamat. Sila log masuk semula.')
  }

  if (url.pathname === '/api/orders' && request.method === 'GET') {
    return listOrders(request, env)
  }

  if (url.pathname === '/api/orders/reset' && request.method === 'POST') {
    return replaceOrders(request, env)
  }

  if (singleMatch) {
    const id = decodeURIComponent(singleMatch[1])
    if (!ID_PATTERN.test(id)) return fail(request, 400, 'Nombor tempahan tidak sah.')
    if (request.method === 'PATCH') return patchOrder(request, env, id)
    if (request.method === 'DELETE') return deleteOrder(request, env, id)
  }

  return fail(request, 404, 'Laluan tidak dijumpai.')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(request, env, url)
      }

      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('Not found', { status: 404 })
    } catch (error) {
      console.error('[pizzadonia] ralat API:', error)
      return fail(request, 500, 'Ralat pelayan. Cuba lagi.')
    }
  },
} satisfies ExportedHandler<Env>
