const offlineMessage = 'Sistem pesanan belum tersedia. Sila cuba lagi nanti.'

async function unavailable(request, env) {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/shop') {
    const catalog = await env.ASSETS.fetch(new URL('/catalog.json', url.origin))
    if (catalog.ok) return new Response(catalog.body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
  return Response.json({ error: offlineMessage }, {
    status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (!env.BACKEND_URL) return unavailable(request, env)
    let origin
    try {
      origin = new URL(env.BACKEND_URL)
      if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Invalid origin')
    } catch {
      return unavailable(request, env)
    }
    const target = new URL(url.pathname + url.search, origin.origin)
    const headers = new Headers(request.headers)
    // Keep the backend's existing private-admin checks. Strip client-supplied identity headers.
    for (const name of ['host', 'x-pz-proxy', 'tailscale-user-login', 'tailscale-user-name', 'x-forwarded-for', 'x-real-ip']) headers.delete(name)
    const clientIp = request.headers.get('cf-connecting-ip')
    if (clientIp) headers.set('x-forwarded-for', clientIp)
    headers.set('ngrok-skip-browser-warning', '1')
    if (env.BACKEND_PROXY_SECRET) headers.set('x-pz-proxy', env.BACKEND_PROXY_SECRET)
    try {
      const upstream = await fetch(target, {
        method: request.method, headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual', signal: AbortSignal.timeout(15000),
      })
      const contentType = upstream.headers.get('content-type') || ''
      if (upstream.status >= 500 || (upstream.status >= 300 && upstream.status < 400) ||
          (!contentType.includes('application/json') && !contentType.startsWith('image/') && !contentType.includes('application/pdf'))) {
        return unavailable(request, env)
      }
      if (url.pathname === '/api/shop' && (!upstream.ok || !contentType.includes('application/json'))) return unavailable(request, env)
      const response = new Response(upstream.body, upstream)
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch {
      return unavailable(request, env)
    }
  },
}
