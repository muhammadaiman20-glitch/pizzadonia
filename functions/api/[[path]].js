/**
 * Proxy API untuk Cloudflare Pages.
 *
 * App Android memuatkan `pizzadonia.pages.dev` kerana sesetengah ISP menyekat
 * `*.workers.dev` (ERR_NAME_NOT_RESOLVED). Permintaan `/api/*` dari Pages
 * diteruskan ke Worker di sisi Cloudflare, jadi DNS pengguna tidak perlu
 * menyelesaikan nama workers.dev langsung.
 */
const WORKER_ORIGIN = 'https://pizzadonia.muhammadaiman20.workers.dev'

export function onRequest(context) {
  const url = new URL(context.request.url)
  const target = new URL(url.pathname + url.search, WORKER_ORIGIN)

  // `new Request(target, request)` menyalin method, headers dan body.
  // Host ditetapkan semula oleh runtime Cloudflare mengikut URL sasaran.
  return fetch(new Request(target, context.request))
}
