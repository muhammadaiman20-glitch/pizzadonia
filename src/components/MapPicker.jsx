import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { LocateFixed, Loader2, Search, X } from 'lucide-react'

const KL = { lat: 3.139, lng: 101.6869 }
const pinIcon = (color) =>
  L.divIcon({
    className: 'pin-icon',
    iconSize: [40, 52],
    iconAnchor: [20, 50],
    html: `<svg width="40" height="52" viewBox="0 0 40 52"><path d="M20 51C20 51 37 31 37 19A17 17 0 0 0 3 19C3 31 20 51 20 51Z" fill="${color}" stroke="#fff" stroke-width="3"/><circle cx="20" cy="19" r="7" fill="#fff"/></svg>`,
  })
const shopIcon = L.divIcon({
  className: 'pin-icon',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: '<div style="width:34px;height:34px;border-radius:50%;background:#fff;border:2px solid #c9732a;display:grid;place-items:center;box-shadow:0 4px 12px rgb(0 0 0/.2)"><img src="/logo.svg" width="22" height="22"/></div>',
})

/** Map where the user drops a pin: tap the map, drag the pin, search a place or use GPS.
 *  onChange({lat,lng}) on every move; onAddress(text) with the street address of the new spot. */
export default function MapPicker({ value, onChange, onAddress, shop, color = '#e23d2d', height = 320, hint = 'Tekan peta atau seret pin ke pintu rumah anda' }) {
  const box = useRef(null)
  const map = useRef(null)
  const pin = useRef(null)
  const cb = useRef({ onChange, onAddress })
  cb.current = { onChange, onAddress }
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  // reverse geocode (OpenStreetMap Nominatim) - fills the address box, debounced
  const revTimer = useRef(0)
  const reverse = (p) => {
    clearTimeout(revTimer.current)
    revTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${p.lat}&lon=${p.lng}&accept-language=ms,en`)
        const j = await r.json()
        if (j.display_name) cb.current.onAddress?.(j.display_name.split(', ').slice(0, 5).join(', '))
      } catch {
        /* address is optional help only */
      }
    }, 600)
  }
  const place = (p, zoom) => {
    const ll = [p.lat, p.lng]
    if (!pin.current) {
      pin.current = L.marker(ll, { draggable: true, icon: pinIcon(color), autoPan: true }).addTo(map.current)
      pin.current.on('dragend', () => {
        const { lat, lng } = pin.current.getLatLng()
        cb.current.onChange?.({ lat, lng })
        reverse({ lat, lng })
      })
    } else pin.current.setLatLng(ll)
    if (zoom) map.current.setView(ll, zoom)
    else map.current.panTo(ll)
  }

  useEffect(() => {
    const start = value || shop || KL
    map.current = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], value || shop ? 15 : 11)
    L.control.zoom({ position: 'bottomright' }).addTo(map.current)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map.current)
    if (shop) L.marker([shop.lat, shop.lng], { icon: shopIcon, interactive: false }).addTo(map.current)
    if (value) place(value)
    map.current.on('click', (e) => {
      const p = { lat: e.latlng.lat, lng: e.latlng.lng }
      place(p)
      cb.current.onChange?.(p)
      reverse(p)
    })
    return () => {
      map.current.remove()
      map.current = null
      pin.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    setErr('')
    if (!navigator.geolocation) return setErr('Telefon ini tidak boleh kongsi lokasi. Sila tekan peta.')
    setBusy('gps')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy('')
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        place(p, 17)
        onChange?.(p)
        reverse(p)
      },
      () => {
        setBusy('')
        setErr('Lokasi tidak dapat dibaca. Benarkan "Location" untuk laman ini, atau cari / tekan peta.')
      },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }
  const search = async (e) => {
    e.preventDefault()
    if (q.trim().length < 3) return
    setBusy('search')
    setErr('')
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=my&accept-language=ms,en&q=${encodeURIComponent(q)}`)
      const j = await r.json()
      setResults(j)
      if (!j.length) setErr('Tempat tidak dijumpai. Cuba nama taman / jalan, atau tekan peta.')
    } catch {
      setErr('Carian gagal. Tekan peta untuk pin lokasi.')
    }
    setBusy('')
  }
  const pick = (r) => {
    const p = { lat: +r.lat, lng: +r.lon }
    setResults([])
    place(p, 17)
    onChange?.(p)
    reverse(p)
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white">
      <div className="relative">
        <div ref={box} style={{ height }} className="z-0" />
        <form onSubmit={search} className="absolute inset-x-3 top-3 z-[500]">
          <div className="flex items-center gap-2 rounded-full bg-white/95 py-1.5 pl-4 pr-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari taman, jalan atau bangunan"
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
              aria-label="Cari lokasi"
            />
            {q && (
              <button type="button" onClick={() => (setQ(''), setResults([]))} className="p-1 text-muted" aria-label="Kosongkan">
                <X className="size-4" />
              </button>
            )}
            <button className="btn btn-red px-3.5 py-1.5 text-[13px]" disabled={busy === 'search'}>
              {busy === 'search' ? <Loader2 className="size-4 animate-spin" /> : 'Cari'}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-2 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
              {results.map((r) => (
                <li key={r.place_id}>
                  <button type="button" onClick={() => pick(r)} className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-cream">
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <button
          type="button"
          onClick={locate}
          className="btn btn-ghost absolute bottom-3 left-3 z-[500] px-4 py-2 text-[13px] shadow-lg"
          disabled={busy === 'gps'}
        >
          {busy === 'gps' ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4 text-tomato" />} Guna lokasi saya
        </button>
      </div>
      <div className="px-4 py-2.5 text-[12.5px] text-muted">{err ? <span className="text-tomato">{err}</span> : hint}</div>
    </div>
  )
}
