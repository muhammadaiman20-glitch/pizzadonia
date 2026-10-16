// Public storefront: business requests go directly to the cloud service, never to a PC tunnel.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/_migration/')) return env.ASSETS.fetch(request)
    if (!env.BACKEND) return Response.json({ error: 'Sistem sedang diselenggara. Sila cuba sebentar lagi.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    return env.BACKEND.fetch(request)
  },
}
