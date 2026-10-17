import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Headset, Loader2, MessageCircle, Send, Store, X } from 'lucide-react'
import { autoRefresh, api, store, useAccount } from '../lib.js'

// Floating support chat on customer pages. The shop assistant answers first; "Hubungi penjual" hands the chat
// to the seller, whose replies arrive here too (polled). The chat id + token live in localStorage.
const KEY = 'pz.chat'
const QUICK = ['Menu & harga', 'Caj penghantaran', 'Status pesanan saya', 'Cara bayar', 'Ada promosi?']

function Bubble({ m }) {
  if (m.from === 'system') return <div className="my-1 text-center text-[11.5px] text-muted">— {m.text} —</div>
  const mine = m.from === 'customer'
  const seller = m.from === 'seller'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${mine ? 'rounded-br-md bg-tomato text-white' : seller ? 'rounded-bl-md bg-basil text-white' : 'rounded-bl-md bg-white ring-1 ring-line'}`}>
        {!mine && (
          <div className={`mb-0.5 flex items-center gap-1 text-[11px] font-bold ${seller ? 'text-white/80' : 'text-muted'}`}>
            {seller ? <Store className="size-3" /> : <Bot className="size-3" />} {seller ? 'Penjual' : 'Pembantu'}
          </div>
        )}
        <div className="whitespace-pre-line break-words">{m.text}</div>
        <div className={`mt-0.5 text-right text-[10px] ${mine || seller ? 'text-white/70' : 'text-muted'}`}>{new Date(m.at).toLocaleTimeString('ms-MY', { hour: 'numeric', minute: '2-digit' })}</div>
      </div>
    </div>
  )
}

export default function SupportChat() {
  const acc = useAccount()
  const [open, setOpen] = useState(false)
  const [sess, setSess] = useState(() => store.get(KEY, null))
  const [chat, setChat] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const list = useRef(null)
  const lastCount = useRef(0)

  const load = useCallback(async (seen) => {
    if (!sess) return
    try {
      const c = await api(`/api/support/${sess.id}?t=${sess.token}${seen ? '&seen=1' : ''}`)
      setChat(c)
    } catch (e) {
      if (e.status === 404) (store.set(KEY, null), setSess(null), setChat(null))
    }
  }, [sess])
  useEffect(() => {
    return autoRefresh(() => load(open), open ? 5000 : 20000)
  }, [load, open])
  useEffect(() => {
    const n = chat?.messages?.length || 0
    if (open && n !== lastCount.current) setTimeout(() => list.current?.scrollTo({ top: 1e6, behavior: 'smooth' }), 30)
    lastCount.current = n
  }, [chat, open])

  const start = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api('/api/support/start', { method: 'POST', body: acc ? {} : { name, phone: phone || undefined } })
      const s = { id: r.id, token: r.token }
      store.set(KEY, s)
      setSess(s)
      setChat(r)
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }
  const send = async (t = text) => {
    const msg = t.trim()
    if (!msg || !sess) return
    setText('')
    setBusy(true)
    setErr('')
    setChat((c) => c && { ...c, messages: [...c.messages, { from: 'customer', text: msg, at: new Date().toISOString() }] })
    try {
      setChat(await api(`/api/support/${sess.id}/message?t=${sess.token}`, { method: 'POST', body: { text: msg } }))
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  const handoff = async () => {
    setBusy(true)
    try {
      setChat(await api(`/api/support/${sess.id}/handoff?t=${sess.token}`, { method: 'POST', body: {} }))
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  const unread = chat?.unread || 0
  const status = chat?.status
  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-24 right-4 z-40 grid size-14 place-items-center rounded-full bg-ink text-white shadow-2xl transition hover:scale-105 sm:bottom-6"
          aria-label="Bantuan pelanggan">
          <MessageCircle className="size-6" />
          {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-tomato px-1 text-[11px] font-extrabold">{unread}</span>}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:inset-auto sm:bottom-6 sm:right-6" role="dialog" aria-label="Bantuan pelanggan">
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-cream shadow-2xl sm:h-[600px] sm:w-[380px] sm:rounded-[26px] sm:ring-1 sm:ring-line">
            <div className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
              <span className="grid size-9 place-items-center rounded-xl bg-white/10">{status === 'open' || status === 'waiting' ? <Headset className="size-5 text-cheese" /> : <Bot className="size-5 text-cheese" />}</span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg leading-tight tracking-wide">Bantuan Pizzadonia</div>
                <div className="text-[11.5px] text-white/70">
                  {status === 'waiting' ? 'Menunggu penjual membalas…' : status === 'open' ? 'Penjual sedang membantu anda' : 'Pembantu menjawab segera · penjual sedia membantu'}
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Tutup"><X className="size-5" /></button>
            </div>

            {!sess ? (
              <form onSubmit={start} className="flex flex-1 flex-col justify-center gap-3 p-5">
                <p className="text-[14px]">Ada soalan atau masalah? Tanya pembantu kami - kalau tak dapat selesaikan, penjual akan bantu terus di sini.</p>
                {!acc && (
                  <>
                    <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama anda" maxLength={60} autoComplete="name" />
                    <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="No. telefon (supaya kami boleh semak pesanan anda)" inputMode="tel" maxLength={16} autoComplete="tel" />
                  </>
                )}
                {err && <p className="text-[13px] font-semibold text-tomato">{err}</p>}
                <button className="btn btn-red py-3 text-[15px]" disabled={busy || (!acc && name.trim().length < 2)}>{busy && <Loader2 className="size-4 animate-spin" />} Mula berbual</button>
              </form>
            ) : (
              <>
                <div ref={list} className="flex-1 space-y-2 overflow-y-auto p-4">
                  {(chat?.messages || []).map((m, i) => <Bubble key={i} m={m} />)}
                  {busy && <div className="flex items-center gap-2 text-[12.5px] text-muted"><Loader2 className="size-3.5 animate-spin" /> sedang menaip…</div>}
                </div>
                {status === 'bot' && (
                  <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
                    {QUICK.map((q) => (
                      <button key={q} onClick={() => send(q)} disabled={busy} className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold">{q}</button>
                    ))}
                  </div>
                )}
                {err && <p className="px-4 pb-1 text-[12.5px] font-semibold text-tomato">{err}</p>}
                <form onSubmit={(e) => (e.preventDefault(), send())} className="flex items-center gap-2 border-t border-line bg-white p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                  <input className="field py-2.5" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis mesej…" maxLength={600} aria-label="Mesej" />
                  <button className="grid size-11 shrink-0 place-items-center rounded-full bg-tomato text-white disabled:opacity-40" disabled={!text.trim() || busy} aria-label="Hantar"><Send className="size-5" /></button>
                </form>
                {status === 'bot' && (
                  <button onClick={handoff} disabled={busy} className="flex items-center justify-center gap-2 bg-basil py-2.5 text-[13.5px] font-bold text-white">
                    <Headset className="size-4" /> Hubungi penjual
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
