import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

const MANIFEST_URL = '/app-version.json'

export interface AppRelease {
  versionName: string
  url: string
  notes?: string
}

interface Manifest {
  customer?: AppRelease
  seller?: AppRelease
}

export interface UpdateInfo {
  latest: AppRelease
  current: string
}

/** Bandingkan versi semver ringkas, cth. 1.10.0 > 1.9.3. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (value: string) =>
    value
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0))

  const a = parse(latest)
  const b = parse(current)
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

/**
 * Semak manifest versi yang dihoskan bersama laman. Hanya berfungsi dalam
 * app Android/iOS; pelayar biasa tidak mempunyai versi app untuk dibandingkan.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null

  const info = await App.getInfo()
  const channel = info.id === 'com.pizzadonia.seller' ? 'seller' : 'customer'

  const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) return null

  const manifest = (await response.json()) as Manifest
  const latest = manifest[channel]
  if (!latest || !isNewerVersion(latest.versionName, info.version)) return null

  return { latest, current: info.version }
}

export async function openUpdate(url: string): Promise<void> {
  const absolute = new URL(url, window.location.origin).toString()
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: absolute })
    return
  }
  window.open(absolute, '_blank', 'noopener,noreferrer')
}
