import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bot, Check, ClipboardCopy, Loader2, MessageCircle, Plug, RefreshCw, Send, Trash2, TriangleAlert, Unplug, UserRound, X } from 'lucide-react'
import { api, autoRefresh } from '../lib.js'
import { withTxPin } from './PinPrompt.jsx'

const NAME = { facebook: 'Facebook', instagram: 'Instagram' }
const timeOf = (t) => new Date(t).toLocaleString('ms-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function CopyRow({ label, value }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch { /* long-press still works on the text */ }
  }
  return (
    <div className="mt-2">
      <div className="text-[12px] font-bold">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-cream p-2 text-[12px]">{value || 'Belum tersedia'}</code>
        <button type="button" className="btn btn-ghost min-h-11 min-w-11 px-3" aria-label={`Salin ${label}`} disabled={!value} onClick={copy}>{done ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}</button>
      </div>
    </div>
  )
}

function Connect({ d, pin, onChanged }) {
  const [f, setF] = useState({ token: '', appSecret: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const r = await withTxPin('Sambung Facebook dan Instagram', (tx) => api('/api/admin/social/connect', { method: 'POST', body: f, pin, txPin: tx }), 'Token disimpan di server sahaja')
      if (r) {
        setF({ token: '', appSecret: '' })
        setMsg({ ok: r.subscribed, text: r.subscribed ? `Bersambung dengan ${r.pageName}${r.igName ? ` dan @${r.igName}` : ''}. Teruskan dengan langkah 3.` : `Bersambung dengan ${r.pageName}, tetapi Meta belum melanggan mesej: ${r.subscribeError}` })
        await onChanged()
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
    setBusy(false)
  }
  const disconnect = async () => {
    setBusy(true)
    try {
      if (await withTxPin('Putuskan Facebook dan Instagram', (tx) => api('/api/admin/social/connect', { method: 'DELETE', pin, txPin: tx }))) await onChanged()
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
    setBusy(false)
  }
  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold"><Plug className="size-4 text-tomato" /> {d.connected ? 'Sambungan Meta' : 'Sambung Facebook dan Instagram'}</h2>
      {d.connected ? (
        <p className="mt-2 text-[13.5px]">Bersambung dengan <b>{d.pageName}</b>{d.igName ? <> dan <b>@{d.igName}</b></> : ' (Instagram belum dipautkan pada Page ini)'}.</p>
      ) : (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
          <li>Di Meta for Developers, buat Business App dan tambah Messenger serta Instagram Messaging. Pautkan Instagram Professional pada Facebook Page anda.</li>
          <li>Jana Page access token, kemudian tampal token dan App secret di bawah.</li>
          <li>Tampal alamat webhook dan token pengesahan ke dalam Meta, kemudian langgan medan <code>messages</code>.</li>
        </ol>
      )}
      <form onSubmit={save} className="mt-3 space-y-3">
        <div>
          <label htmlFor="so-token" className="mb-1 block text-[13px] font-bold">Page access token{d.connected ? ' (kosong = kekalkan)' : ''}</label>
          <input id="so-token" type="password" autoComplete="off" className="field" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} />
        </div>
        <div>
          <label htmlFor="so-secret" className="mb-1 block text-[13px] font-bold">App secret{d.connected ? ' (kosong = kekalkan)' : ''}</label>
          <input id="so-secret" type="password" autoComplete="off" className="field" value={f.appSecret} onChange={(e) => setF({ ...f, appSecret: e.target.value })} />
        </div>
        {msg && <p role="alert" className={`rounded-2xl p-3 text-[13px] font-semibold ${msg.ok ? 'bg-basil/10 text-basil' : 'bg-tomato/10 text-tomato-deep'}`}>{msg.text}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-red min-h-11 px-4" disabled={busy || (!d.connected && (!f.token || !f.appSecret))}><Plug className="size-4" /> {d.connected ? 'Kemas kini' : 'Sambung'}</button>
          {d.connected && <button type="button" className="btn btn-ghost min-h-11 px-4" disabled={busy} onClick={disconnect}><Unplug className="size-4" /> Putuskan</button>}
        </div>
      </form>
      {d.verifyToken && (
        <div className="mt-3 border-t border-line pt-2">
          <CopyRow label="Alamat webhook (Callback URL)" value={d.webhookUrl} />
          <CopyRow label="Token pengesahan (Verify token)" value={d.verifyToken} />
          <p className="mt-2 text-[12.5px] text-muted">{d.lastInboundAt ? `Mesej terakhir diterima ${timeOf(d.lastInboundAt)}.` : 'Belum ada mesej diterima. Hantar mesej percubaan dari akaun lain.'}</p>
        </div>
      )}
    </section>
  )
}

function Mode({ d, pin, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = async (mode) => {
    setBusy(true)
    setError('')
    try {
      if (await withTxPin(mode === 'auto' ? 'Hidupkan balasan automatik' : 'Kembali ke mod kelulusan', (tx) => api('/api/admin/social/mode', { method: 'PUT', body: { mode }, pin, txPin: tx }))) await onChanged()
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold"><Bot className="size-4 text-basil" /> Cara membalas</h2>
      <p className="mt-1 text-[13.5px]">{d.mode === 'auto' ? <><b>Automatik.</b> AI membalas soalan biasa sendiri. Aduan, amaran harga dan soalan yang AI tidak pasti tetap menunggu anda.</> : <><b>Kelulusan.</b> AI menulis draf, dan tiada apa dihantar sebelum anda tekan Hantar.</>}</p>
      {error && <p role="alert" className="mt-2 text-[13px] font-semibold text-tomato-deep">{error}</p>}
      <button className="btn btn-ghost mt-3 min-h-11 px-4" disabled={busy} onClick={() => set(d.mode === 'auto' ? 'draft' : 'auto')}>{d.mode === 'auto' ? 'Kembali ke mod kelulusan' : 'Hidupkan automatik'}</button>
    </section>
  )
}

function Chat({ c, pin, onChanged, onBack }) {
  const [text, setText] = useState(c.draft?.text || '')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const box = useRef(null)
  const draftText = c.draft?.text || ''
  const [needAck, setNeedAck] = useState(false) // the server found a problem in text the owner edited
  useEffect(() => { setText(draftText); setAck(false); setNeedAck(false) }, [draftText, c.id])
  useEffect(() => { box.current?.scrollTo({ top: 1e6 }) }, [c.messages.length, c.id])
  useEffect(() => {
    if (c.unread) api(`/api/admin/social/${c.id}`, { method: 'POST', body: { action: 'read' }, pin }).then(onChanged).catch(() => {})
  }, [c.id, c.unread]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (action, extra = {}) => {
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/social/${c.id}`, { method: 'POST', body: { action, ...extra }, pin })
      if (action === 'send') setText('')
      if (action === 'delete') onBack()
      await onChanged()
    } catch (e) {
      setError(e.message)
      if (e.status === 409 && action === 'send') setNeedAck(true)
    }
    setBusy(false)
  }
  const hasWarnings = Boolean(c.draft?.warnings?.length) && text === draftText
  return (
    <section className="card flex h-[75dvh] min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-cream/60 p-3">
        <button className="btn btn-ghost min-h-11 min-w-11 px-3" aria-label="Kembali ke senarai" onClick={onBack}><ArrowLeft className="size-4" /></button>
        <b className="min-w-0 flex-1 truncate text-[14px]">Pelanggan {NAME[c.platform]} …{c.userId.slice(-4)}</b>
        {c.status !== 'closed'
          ? <button className="btn btn-ghost min-h-11 px-3 text-[12.5px]" disabled={busy} onClick={() => act('close')}><X className="size-4" /> Tutup</button>
          : <button className="btn btn-ghost min-h-11 px-3 text-[12.5px]" disabled={busy} onClick={() => act('delete')}><Trash2 className="size-4" /> Padam</button>}
      </div>
      <div ref={box} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-cream/40 p-3">
        {c.messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === 'customer' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] ${m.from === 'customer' ? 'bg-white ring-1 ring-line' : m.from === 'owner' ? 'bg-basil text-white' : 'bg-ink/85 text-white'}`}>
              <div className="mb-0.5 flex items-center gap-1 text-[10.5px] font-bold opacity-75">{m.from === 'customer' ? <UserRound className="size-3" /> : m.from === 'ai' ? <Bot className="size-3" /> : null}{m.from === 'customer' ? 'Pelanggan' : m.from === 'owner' ? 'Anda' : 'AI'}</div>
              <div className="whitespace-pre-line break-words">{m.text}</div>
              <div className="mt-0.5 text-right text-[10px] opacity-60">{timeOf(m.at)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line bg-white p-3">
        {c.status === 'needs_owner' && <p className="mb-2 rounded-xl bg-tomato/10 p-2 text-[12.5px] font-semibold text-tomato-deep">Perbualan ini perlukan anda. AI tidak akan membalas.</p>}
        {c.paused && <button className="btn btn-ghost mb-2 min-h-11 px-3 text-[12.5px]" disabled={busy} onClick={() => act('resume')}><Bot className="size-4" /> Serahkan semula kepada AI</button>}
        {!c.canReply && <p className="mb-2 rounded-xl bg-cream p-2 text-[12.5px]">Lebih 24 jam sejak mesej terakhir pelanggan. Meta tidak membenarkan balasan dari sini.</p>}
        {hasWarnings && (
          <div className="mb-2 rounded-xl border border-cheese bg-cheese/15 p-2 text-[12.5px]">
            <p className="flex items-center gap-1 font-bold"><TriangleAlert className="size-4" /> Semak sebelum hantar</p>
            <ul className="list-disc pl-4">{c.draft.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            <label className="mt-1 flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" className="size-5" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Saya sudah semak dan maklumat ini benar</label>
          </div>
        )}
        {needAck && !hasWarnings && (
          <label className="mb-2 flex min-h-11 items-center gap-2 rounded-xl border border-cheese bg-cheese/15 p-2 text-[12.5px] font-semibold"><input type="checkbox" className="size-5" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Teks ini ada harga atau janji yang tiada dalam data kedai. Saya sudah semak dan ia benar.</label>
        )}
        {error && <p role="alert" className="mb-2 text-[12.5px] font-semibold text-tomato-deep">{error}</p>}
        <label htmlFor={`so-${c.id}`} className="mb-1 block text-[12px] font-bold">{c.draft ? 'Draf AI (boleh diubah)' : 'Balasan anda'}</label>
        <textarea id={`so-${c.id}`} className="field min-h-20" maxLength={1000} value={text} disabled={!c.canReply} onChange={(e) => { setText(e.target.value); setAck(false); setNeedAck(false) }} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn btn-red min-h-11 px-4" disabled={busy || !c.canReply || !text.trim() || ((hasWarnings || needAck) && !ack)} onClick={() => act('send', { text, ack })}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Hantar</button>
          <button className="btn btn-ghost min-h-11 px-4" disabled={busy || !c.canReply} onClick={() => act('redraft')}><RefreshCw className="size-4" /> {c.draft ? 'Tulis semula' : 'Minta draf AI'}</button>
        </div>
      </div>
    </section>
  )
}

export default function SocialInbox({ pin }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState('')
  const load = useCallback(() => api('/api/admin/social', { pin }).then((r) => { setD(r); setError('') }).catch((e) => setError(e.message)), [pin])
  useEffect(() => autoRefresh(load, 8000), [load])
  if (error && !d) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold">Tidak dapat memuatkan mesej.</p>
        <p className="mt-1 text-[13px] text-muted">{error}</p>
        <button className="btn btn-ghost mt-3 min-h-11 px-4" onClick={load}><RefreshCw className="size-4" /> Cuba lagi</button>
      </div>
    )
  }
  if (!d) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const c = d.chats.find((x) => x.id === sel)
  if (c) return <Chat c={c} pin={pin} onChanged={load} onBack={() => setSel('')} />
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        {d.chats.length === 0 ? (
          <div className="card p-8 text-center text-[13.5px] text-muted">
            <MessageCircle className="mx-auto mb-2 size-8 text-line" />
            {d.connected ? 'Belum ada mesej. Mesej Facebook dan Instagram akan muncul di sini.' : 'Sambung Page anda dahulu untuk menerima mesej di sini.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {d.chats.map((x) => {
              const last = x.messages.at(-1)
              return (
                <li key={x.id}>
                  <button onClick={() => setSel(x.id)} className={`card min-h-11 w-full p-3 text-left ${x.status === 'needs_owner' ? 'bg-tomato/5' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="min-w-0 flex-1 truncate text-[14px]">{NAME[x.platform]} …{x.userId.slice(-4)}</b>
                      {x.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-tomato px-1 text-[11px] font-extrabold text-white">{x.unread}</span>}
                      {x.status === 'needs_owner' && <span className="rounded-full bg-tomato px-2 py-0.5 text-[10.5px] font-bold text-white">Perlukan anda</span>}
                      {x.draft && <span className="rounded-full bg-cheese/40 px-2 py-0.5 text-[10.5px] font-bold">Draf menunggu</span>}
                      {x.status === 'closed' && <span className="rounded-full bg-line px-2 py-0.5 text-[10.5px] font-bold text-muted">Ditutup</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-muted">{last?.text}</div>
                    <div className="text-[11px] text-muted">{timeOf(x.updatedAt)}</div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="min-w-0 space-y-4">
        {d.connected && <Mode d={d} pin={pin} onChanged={load} />}
        <Connect d={d} pin={pin} onChanged={load} />
      </div>
    </div>
  )
}
