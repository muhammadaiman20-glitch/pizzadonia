// Small Fetch-native adapter for the Express API subset used by Pizzadonia.
import { Buffer } from 'node:buffer'
const noop = (_req, _res, next) => next()
function bytes(limit) {
  const m = /^(\d+)(kb|mb)?$/i.exec(String(limit || 65536))
  return m ? Number(m[1]) * (m[2]?.toLowerCase() === 'mb' ? 1048576 : m[2] ? 1024 : 1) : 65536
}
function compile(pattern, prefix = false) {
  const keys = []
  const source = pattern.split('/').map(part => {
    if (part.startsWith(':')) { keys.push(part.slice(1)); return '([^/]+)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('/')
  return { keys, re: new RegExp('^' + source + (prefix ? '(?:/|$)' : '/?$')) }
}
class FetchRouter {
  layers = []
  disable() { return this }
  set() { return this }
  use(...args) {
    const prefix = typeof args[0] === 'string' ? args.shift() : ''
    this.layers.push({ method: null, match: prefix ? compile(prefix, true) : null, handlers: args })
    return this
  }
  route(method, pattern, handlers) { this.layers.push({ method, match: compile(pattern), handlers }); return this }
  get(p, ...h) { return this.route('GET', p, h) }
  post(p, ...h) { return this.route('POST', p, h) }
  put(p, ...h) { return this.route('PUT', p, h) }
  patch(p, ...h) { return this.route('PATCH', p, h) }
  delete(p, ...h) { return this.route('DELETE', p, h) }
  async fetch(request) {
    const url = new URL(request.url)
    const req = {
      method: request.method, originalUrl: url.pathname + url.search,
      query: Object.fromEntries(url.searchParams), params: {}, body: undefined,
      get: name => request.headers.get(name) || undefined,
      ip: request.headers.get('cf-connecting-ip') || 'unknown',
      socket: { remoteAddress: 'cloudflare' },
    }
    let raw
    async function read(limit) {
      if (!raw) {
        const chunks = []; let size = 0
        const reader = request.body?.getReader()
        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > limit) { await reader.cancel(); throw Object.assign(new Error('Fail terlalu besar'), { status: 413 }) }
            chunks.push(Buffer.from(value))
          }
        }
        raw = Buffer.concat(chunks)
      }
      if (raw.length > limit) throw Object.assign(new Error('Fail terlalu besar'), { status: 413 })
      return raw
    }
    let result, status = 200
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    const res = {
      status(n) { status = n; return this },
      set(k, v) { headers.set(k, v); return this },
      type(t) { if (t) headers.set('Content-Type', t); return this },
      json(value) { headers.set('Content-Type', 'application/json; charset=utf-8'); result = new Response(JSON.stringify(value), { status, headers }); return this },
      send(value) { result = new Response(value, { status, headers }); return this },
    }
    try {
      if (request.headers.get('content-type')?.split(';')[0] === 'application/json') {
        try { req.body = JSON.parse((await read(65536)).toString('utf8') || '{}') }
        catch (e) { if (e.status) throw e; throw Object.assign(new Error('JSON tidak sah'), { status: 400 }) }
      }
      for (const layer of this.layers) {
        if (result) break
        if (layer.method && layer.method !== request.method && !(request.method === 'HEAD' && layer.method === 'GET')) continue
        const match = layer.match?.re.exec(url.pathname)
        if (layer.match && !match) continue
        req.params = match ? Object.fromEntries(layer.match.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])])) : {}
        const run = async i => {
          if (result || i >= layer.handlers.length) return
          const handler = layer.handlers[i]
          if (handler.rawLimit) req.body = await read(handler.rawLimit)
          let nextPromise
          await handler(req, res, () => (nextPromise = run(i + 1)))
          if (nextPromise) await nextPromise
        }
        await run(0)
      }
      return result || Response.json({ error: 'Not found' }, { status: 404, headers })
    } catch (e) {
      if (!e.status) throw e
      return Response.json({ error: e.message }, { status: e.status, headers })
    }
  }
}
export function express() { return new FetchRouter() }
express.json = () => noop
express.raw = ({ limit }) => Object.assign(noop.bind(null), { rawLimit: bytes(limit) })
