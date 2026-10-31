// In-app update, required before use, the same way as Ronda. Without a readable version file (no internet) the app stays
// usable, and after a failed download the user may use it until the next opening. Android still asks for a tap on Pasang.
const RECHECK_MS = 5 * 60_000

export function updatePlan(installed, latest) {
  if (!Number(latest?.versionCode) || typeof latest?.versionName !== 'string' || !installed) return { state: 'offline' }
  return { state: Number(latest.versionCode) > Number(installed.versionCode) ? 'update' : 'latest', latest, installed }
}

export function createUpdater({ getInstalled, getLatest, install, getProgress, exit, now = Date.now }) {
  let snapshot = { state: 'checking', sheet: 'ready', message: '', percent: -1, working: false, checking: false, deferred: false, exitFailed: false }
  let checkedAt = 0
  let running = null
  let timer = null
  const listeners = new Set()
  const set = (patch) => {
    snapshot = { ...snapshot, ...patch }
    listeners.forEach((l) => l())
  }
  // A recheck that cannot read the version file keeps a known update and its sheet. A newer version starts the sheet again.
  const afterCheck = (plan) => {
    if (plan.state === 'offline' && snapshot.state === 'update') return { checking: false }
    const newer = plan.state === 'update' && snapshot.latest && Number(plan.latest.versionCode) > Number(snapshot.latest.versionCode)
    return { ...plan, checking: false, ...(newer ? { sheet: 'ready', message: '' } : {}) }
  }
  const check = () => {
    // the sheet must stay as it is while the file downloads
    if (snapshot.working) return Promise.resolve()
    running ??= (async () => {
      checkedAt = now()
      set({ checking: true })
      let latest = null
      let installed = null
      try {
        latest = await getLatest()
      } catch { /* shown as offline */ }
      try {
        installed = await getInstalled()
      } catch { /* stays null */ }
      set(afterCheck(updatePlan(installed, latest)))
      running = null
    })()
    return running
  }
  return {
    subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    get: () => snapshot,
    check,
    recheck: () => (now() - checkedAt > RECHECK_MS ? check() : undefined),
    async install() {
      if (snapshot.state !== 'update' || snapshot.working) return
      set({ working: true, deferred: false, exitFailed: false, sheet: 'downloading', percent: -1, message: '' })
      timer = setInterval(async () => {
        try {
          set({ percent: (await getProgress()).percent })
        } catch {
          clearInterval(timer)
        }
      }, 400)
      try {
        await install(snapshot.latest)
        set({ sheet: 'install', message: 'Tekan Pasang pada skrin Android. Data anda tidak hilang.' })
      } catch (e) {
        const text = String(e?.message || 'Muat turun gagal.')
        set({ sheet: e?.code === 'PERMISSION' || /Benarkan/.test(text) ? 'permission' : 'error', message: text })
      } finally {
        clearInterval(timer)
        set({ working: false })
      }
    },
    /** After a failed download only: use the app until it is next opened. */
    useFirst: () => set({ deferred: true }),
    async exit() {
      try {
        await exit()
      } catch {
        set({ exitFailed: true })
      }
    },
  }
}
