import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export type LocationErrorCode =
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unknown'

export class LocationError extends Error {
  readonly code: LocationErrorCode

  constructor(code: LocationErrorCode, message: string) {
    super(message)
    this.name = 'LocationError'
    this.code = code
  }
}

export interface Coordinates {
  lat: number
  lng: number
}

const MESSAGES: Record<LocationErrorCode, string> = {
  unsupported: 'Peranti ini tidak menyokong lokasi automatik. Tampal pautan Google Maps.',
  insecure:
    'Lokasi automatik memerlukan sambungan selamat (https). Tampal pautan Google Maps sebagai ganti.',
  denied:
    'Akses lokasi disekat. Benarkan lokasi untuk app ini dalam tetapan, atau tampal pautan Google Maps.',
  unavailable:
    'Isyarat GPS tidak tersedia. Pastikan Lokasi (GPS) dihidupkan, atau tampal pautan Google Maps.',
  timeout:
    'Lokasi mengambil masa terlalu lama. Cuba lagi di ruang terbuka, atau tampal pautan Google Maps.',
  unknown: 'Gagal dapatkan lokasi. Cuba lagi, atau tampal pautan Google Maps.',
}

/** Mesej Mesra pengguna untuk ralat lokasi (termasuk ralat bukan LocationError). */
export function locationErrorMessage(error: unknown): string {
  return error instanceof LocationError ? error.message : MESSAGES.unknown
}

/**
 * Dapatkan koordinat semasa.
 *
 * Dalam app Android, plugin native `@capacitor/geolocation` digunakan kerana
 * WebView tidak boleh meminta kebenaran lokasi Android sendiri. Dalam pelayar
 * biasa, `navigator.geolocation` digunakan.
 */
export async function getCurrentCoordinates(): Promise<Coordinates> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Geolocation')) {
    return getNativeCoordinates()
  }
  return getBrowserCoordinates()
}

function toCoordinates(position: {
  coords: { latitude: number; longitude: number }
}): Coordinates {
  return {
    lat: Number(position.coords.latitude.toFixed(6)),
    lng: Number(position.coords.longitude.toFixed(6)),
  }
}

async function getNativeCoordinates(): Promise<Coordinates> {
  let permissions
  try {
    permissions = await Geolocation.checkPermissions()
    if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
      permissions = await Geolocation.requestPermissions()
    }
  } catch {
    // Biasanya perkhidmatan lokasi dimatikan pada peranti.
    throw new LocationError('unavailable', MESSAGES.unavailable)
  }

  const granted =
    permissions.location === 'granted' || permissions.coarseLocation === 'granted'

  if (!granted) {
    throw new LocationError('denied', MESSAGES.denied)
  }

  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
    return toCoordinates(position)
  } catch (error) {
    throw mapNativeError(error)
  }
}

function getBrowserCoordinates(): Promise<Coordinates> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.reject(new LocationError('unsupported', MESSAGES.unsupported))
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return Promise.reject(new LocationError('insecure', MESSAGES.insecure))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toCoordinates(position)),
      (error) => reject(mapBrowserError(error)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

function mapBrowserError(error: GeolocationPositionError): LocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new LocationError('denied', MESSAGES.denied)
    case error.POSITION_UNAVAILABLE:
      return new LocationError('unavailable', MESSAGES.unavailable)
    case error.TIMEOUT:
      return new LocationError('timeout', MESSAGES.timeout)
    default:
      return new LocationError('unknown', MESSAGES.unknown)
  }
}

function mapNativeError(error: unknown): LocationError {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const text = message.toLowerCase()

  if (text.includes('denied') || text.includes('permission')) {
    return new LocationError('denied', MESSAGES.denied)
  }
  if (text.includes('timeout') || text.includes('timed out')) {
    return new LocationError('timeout', MESSAGES.timeout)
  }
  if (text.includes('disabled') || text.includes('not enabled') || text.includes('unavailable')) {
    return new LocationError('unavailable', MESSAGES.unavailable)
  }
  return new LocationError('unknown', MESSAGES.unknown)
}
