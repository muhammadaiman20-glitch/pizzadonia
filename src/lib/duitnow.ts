/**
 * DuitNow QR (EMVCo) — masukkan jumlah ke dalam payload dan kira semula CRC.
 * Payload asal diambil dari QR bank penjual (lihat SHOP.payment.duitnowQr).
 */

interface TlvNode {
  tag: string
  value: string
}

function parseTlv(payload: string): TlvNode[] {
  const nodes: TlvNode[] = []
  let index = 0
  while (index + 4 <= payload.length) {
    const tag = payload.slice(index, index + 2)
    const length = Number.parseInt(payload.slice(index + 2, index + 4), 10)
    if (!Number.isFinite(length)) break
    nodes.push({ tag, value: payload.slice(index + 4, index + 4 + length) })
    index += 4 + length
  }
  return nodes
}

function serialize(nodes: TlvNode[]) {
  return nodes
    .map((node) => `${node.tag}${String(node.value.length).padStart(2, '0')}${node.value}`)
    .join('')
}

/** CRC-16/CCITT-FALSE seperti yang digunakan oleh EMVCo. */
export function crc16(text: string) {
  let crc = 0xffff
  for (let index = 0; index < text.length; index++) {
    crc ^= text.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function isValidDuitNowPayload(payload: string) {
  if (!payload.startsWith('0002') || payload.length < 12) return false
  const body = payload.slice(0, -4)
  return crc16(body) === payload.slice(-4).toUpperCase()
}

/**
 * Hasilkan QR dinamik dengan jumlah. `01` ditukar kepada `12` (dynamic) dan
 * tag `54` (amount) ditambah, kemudian CRC dikira semula.
 */
export function payloadWithAmount(payload: string, amount: number) {
  if (!payload) return ''
  const nodes = parseTlv(payload).filter((node) => node.tag !== '54' && node.tag !== '63')
  const initiation = nodes.find((node) => node.tag === '01')
  if (initiation) initiation.value = '12'
  nodes.push({ tag: '54', value: amount.toFixed(2) })
  nodes.sort((a, b) => Number(a.tag) - Number(b.tag))
  const body = `${serialize(nodes)}6304`
  return `${body}${crc16(body)}`
}
