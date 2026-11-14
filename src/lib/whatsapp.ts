/**
 * Buka WhatsApp melalui elemen anchor sebenar. Ini lebih dipercayai daripada
 * `window.open` yang sering disekat oleh popup blocker, terutamanya pada
 * browser mudah alih dan browser dalam app (Instagram/TikTok/Facebook).
 */
export function openWhatsApp(url: string) {
  try {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.style.position = 'fixed'
    link.style.left = '-9999px'
    link.style.top = '0'
    link.style.opacity = '0'
    link.setAttribute('aria-hidden', 'true')
    document.body.appendChild(link)
    link.click()
    window.setTimeout(() => link.remove(), 0)
    return true
  } catch {
    return false
  }
}

/** 601162260552 → +60 11-6226 0552 */
export function prettyPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('60') && digits.length >= 11) {
    return `+60 ${digits.slice(2, 4)}-${digits.slice(4, 8)} ${digits.slice(8)}`
  }
  return `+${digits}`
}
