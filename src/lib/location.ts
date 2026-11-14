import type { OrderLocation } from '../types'

const COORD_PAIR = /(-?\d{1,3}\.\d+)\s*(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i
const MAP_HOST =
  /^https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|waze\.com|www\.waze\.com)\b/i

export function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

/** Pautan navigasi terus ke lokasi (jika koordinat diketahui). */
export function locationDirectionsUrl(location: OrderLocation) {
  if (typeof location.lat === 'number' && typeof location.lng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`
  }
  return location.url
}

/**
 * Terima sama ada pautan Google Maps/Waze, koordinat mentah, atau teks yang
 * mengandungi koordinat (contoh: `.../@3.1390,101.6869,17z`).
 * Pautan pendek (maps.app.goo.gl) diterima tanpa koordinat.
 */
export function parseLocationInput(value: string): OrderLocation | null {
  const text = value.trim()
  if (!text) return null

  let decoded = text
  try {
    decoded = decodeURIComponent(text)
  } catch {
    // Biarkan teks asal jika decode gagal.
  }

  const pair = decoded.match(COORD_PAIR)
  let lat: number | undefined
  let lng: number | undefined
  if (pair) {
    const nextLat = Number(pair[1])
    const nextLng = Number(pair[2])
    if (
      Number.isFinite(nextLat) &&
      Number.isFinite(nextLng) &&
      nextLat >= -90 &&
      nextLat <= 90 &&
      nextLng >= -180 &&
      nextLng <= 180
    ) {
      lat = nextLat
      lng = nextLng
    }
  }

  if (MAP_HOST.test(text)) {
    return {
      url: text,
      lat,
      lng,
      source: 'link',
    }
  }

  if (lat !== undefined && lng !== undefined) {
    return {
      url: mapsUrl(lat, lng),
      lat,
      lng,
      source: 'link',
    }
  }

  return null
}
