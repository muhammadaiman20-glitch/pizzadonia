import { useEffect, useRef, useState } from 'react'

// Google Identity Services: loads Google's script once and draws the official "Continue with Google" button.
// onCredential(idToken) gets the signed ID token; the server checks it with Google.
let gisPromise = null
function loadGis() {
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve(window.google)
    s.onerror = () => {
      gisPromise = null
      reject(new Error('Google tidak dapat dimuatkan'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

export default function GoogleButton({ clientId, onCredential, text = 'continue_with' }) {
  const box = useRef(null)
  const cb = useRef(onCredential)
  cb.current = onCredential
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!clientId) return
    let gone = false
    loadGis()
      .then((g) => {
        if (gone || !box.current) return
        g.accounts.id.initialize({ client_id: clientId, callback: (r) => cb.current(r.credential), ux_mode: 'popup', auto_select: false })
        g.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', shape: 'pill', text, width: Math.min(360, box.current.offsetWidth || 320), logo_alignment: 'center' })
      })
      .catch((e) => !gone && setErr(e.message))
    return () => {
      gone = true
    }
  }, [clientId, text])
  if (!clientId) return null
  return (
    <div>
      <div ref={box} className="flex min-h-11 w-full justify-center" />
      {err && <p className="mt-1 text-center text-[12px] text-tomato">{err}</p>}
    </div>
  )
}
