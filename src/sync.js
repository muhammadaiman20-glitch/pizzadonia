// Refresh while visible and online; returning to the app always checks immediately.
// A single subscription never runs overlapping requests, even on slow connections.
export function autoRefresh(load, interval = 5000, environment = {}) {
  const win = environment.window ?? window
  const doc = environment.document ?? document
  const nav = environment.navigator ?? navigator
  const timers = environment.timers ?? globalThis
  let stopped = false, running = false, queued = false, timer
  const available = () => doc.visibilityState !== 'hidden' && nav.onLine !== false
  const schedule = () => {
    timers.clearTimeout(timer)
    if (!stopped && available()) timer = timers.setTimeout(run, interval)
  }
  async function run() {
    timers.clearTimeout(timer)
    if (stopped || !available()) return
    if (running) { queued = true; return }
    running = true
    try { await load() } catch { /* Loaders retain their own data and error state. */ }
    finally {
      running = false
      if (queued && !stopped && available()) { queued = false; void run() }
      else schedule()
    }
  }
  const resume = () => { if (available()) void run(); else timers.clearTimeout(timer) }
  const changed = () => { void run() }
  for (const event of ['focus', 'online', 'pz:data-changed']) win.addEventListener(event, changed)
  win.addEventListener('offline', resume)
  doc.addEventListener('visibilitychange', resume)
  void run()
  return () => {
    stopped = true
    timers.clearTimeout(timer)
    for (const event of ['focus', 'online', 'pz:data-changed']) win.removeEventListener(event, changed)
    win.removeEventListener('offline', resume)
    doc.removeEventListener('visibilitychange', resume)
  }
}
