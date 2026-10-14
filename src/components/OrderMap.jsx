import { useEffect, useRef } from 'react'
import L from 'leaflet'

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const pin = (color) =>
  L.divIcon({
    className: 'pin-icon',
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    html: `<svg width="30" height="40" viewBox="0 0 40 52"><path d="M20 51C20 51 37 31 37 19A17 17 0 0 0 3 19C3 31 20 51 20 51Z" fill="${color}" stroke="#fff" stroke-width="3"/><circle cx="20" cy="19" r="7" fill="#fff"/></svg>`,
  })
const shopIcon = L.divIcon({
  className: 'pin-icon',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: '<div style="width:30px;height:30px;border-radius:50%;background:#fff;border:2px solid #c9732a;display:grid;place-items:center;box-shadow:0 4px 12px rgb(0 0 0/.2)"><img src="/logo.svg" width="19" height="19"/></div>',
})

/** Read-only map: the shop + one or more delivery pins, each labelled (customer name / order id).
 *  points = [{ lat, lng, label, sub, color }]; the map fits them all. */
export default function OrderMap({ points, shop, height = 220, interactive = true }) {
  const box = useRef(null)
  const key = JSON.stringify([points, shop])
  useEffect(() => {
    const map = L.map(box.current, {
      zoomControl: interactive, attributionControl: true, scrollWheelZoom: false,
      dragging: interactive, touchZoom: interactive, doubleClickZoom: interactive,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map)
    const all = []
    if (shop) {
      L.marker([shop.lat, shop.lng], { icon: shopIcon, interactive: false }).addTo(map)
      all.push([shop.lat, shop.lng])
    }
    for (const p of points) {
      L.marker([p.lat, p.lng], { icon: pin(p.color || '#e23d2d') })
        .addTo(map)
        .bindTooltip(`<b>${esc(p.label)}</b>${p.sub ? `<br/>${esc(p.sub)}` : ''}`, { permanent: true, direction: 'top', offset: [0, -34] })
      all.push([p.lat, p.lng])
    }
    if (all.length > 1) map.fitBounds(all, { padding: [40, 40], maxZoom: 16 })
    else if (all.length) map.setView(all[0], 16)
    else map.setView([3.139, 101.6869], 11)
    return () => map.remove()
  }, [key, interactive]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} style={{ height }} className="z-0 w-full overflow-hidden rounded-2xl border border-line" />
}
