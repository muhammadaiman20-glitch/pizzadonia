import { useEffect, useRef, useState } from 'react'
import { Delete, Lock, ShieldCheck, X } from 'lucide-react'

// Bank-style PIN pad for money actions. askPin({ title, sub, err }) -> Promise<string | null> (null = cancelled).
// <PinPromptHost /> is mounted once in App. withTxPin() keeps asking while the PIN is wrong.
let open = null
export function askPin(opts) {
  return new Promise((resolve) => open?.({ ...opts, resolve }))
}

export async function withTxPin(title, run, sub = '') {
  let err = ''
  for (;;) {
    const pin = await askPin({ title, sub, err })
    if (!pin) return null
    try {
      return await run(pin)
    } catch (e) {
      if (e.status === 403 && /PIN/i.test(e.message)) {
        err = e.message
        continue
      }
      throw e
    }
  }
}

export function PinPromptHost() {
  const [req, setReq] = useState(null)
  const [pin, setPin] = useState('')
  const input = useRef(null)
  useEffect(() => {
    open = (r) => {
      setPin('')
      setReq(r)
    }
    return () => {
      open = null
    }
  }, [])
  useEffect(() => {
    if (req) setTimeout(() => input.current?.focus(), 50)
  }, [req])
  if (!req) return null
  const done = (v) => {
    req.resolve(v)
    setReq(null)
    setPin('')
  }
  const press = (d) => setPin((p) => (p + d).slice(0, 8))
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="PIN transaksi">
      <form
        className="rise w-full max-w-sm rounded-t-[28px] bg-paper p-6 shadow-2xl sm:rounded-[28px]"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onSubmit={(e) => (e.preventDefault(), pin.length >= 4 && done(pin))}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ink text-cheese"><ShieldCheck className="size-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold uppercase tracking-wider text-muted">PIN transaksi</div>
            <div className="font-display text-xl leading-tight tracking-wide">{req.title}</div>
            {req.sub && <div className="mt-0.5 text-[13px] text-muted">{req.sub}</div>}
          </div>
          <button type="button" onClick={() => done(null)} className="grid size-9 place-items-center rounded-full hover:bg-cream" aria-label="Batal"><X className="size-5" /></button>
        </div>
        <input
          ref={input}
          className="sr-only"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          aria-label="PIN"
        />
        <div className="mt-5 flex justify-center gap-3" onClick={() => input.current?.focus()}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} className={`size-4 rounded-full transition ${i < pin.length ? 'bg-ink' : 'border-2 border-line'}`} />
          ))}
        </div>
        {req.err && <p className="mt-3 text-center text-[13px] font-semibold text-tomato">{req.err}</p>}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className="rounded-2xl bg-cream py-3.5 text-xl font-bold active:bg-cheese/50">{d}</button>
          ))}
          <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="grid place-items-center rounded-2xl py-3.5 text-muted active:bg-cream" aria-label="Padam"><Delete className="size-6" /></button>
          <button type="button" onClick={() => press('0')} className="rounded-2xl bg-cream py-3.5 text-xl font-bold active:bg-cheese/50">0</button>
          <button className="grid place-items-center rounded-2xl bg-tomato py-3.5 text-white disabled:opacity-40" disabled={pin.length < 4} aria-label="Sahkan"><Lock className="size-5" /></button>
        </div>
        <p className="mt-3 text-center text-[11.5px] text-muted">Jangan kongsi PIN anda dengan sesiapa.</p>
      </form>
    </div>
  )
}
