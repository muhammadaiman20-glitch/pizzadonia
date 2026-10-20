import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Loader2, MessageCircle, RefreshCw, Trash2 } from 'lucide-react'
import { api } from '../lib.js'
import { withTxPin } from './PinPrompt.jsx'

// Seller dashboard: customer login by WhatsApp (Meta WhatsApp Cloud API). Customers send their login code to the
// shop's business number, so every login is free. The token and app secret stay on the server.

const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : new Date(ms).toLocaleDateString()
}

function CopyRow({ label, value }) {
  const [ok, setOk] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setOk(true)
      setTimeout(() => setOk(false), 1500)
    } catch {
      /* select it by hand */
    }
  }
  return (
    <div>
      <div className="mb-1 text-[12.5px] font-bold">{label}</div>
      <div className="flex gap-2">
        <input className="field min-w-0 flex-1 font-mono text-[12.5px]" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-ghost px-3" onClick={copy} aria-label={`Copy ${label}`}>{ok ? <Check className="size-4 text-basil" /> : <Copy className="size-4" />}</button>
      </div>
    </div>
  )
}

export default function WhatsAppLogin({ pin }) {
  const [st, setSt] = useState(null)
  const [f, setF] = useState({ phoneNumberId: '', wabaId: '', token: '', appSecret: '' })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const load = useCallback(() => api('/api/admin/whatsapp', { pin }).then((r) => {
    setSt(r)
    setF((x) => ({ ...x, phoneNumberId: x.phoneNumberId || r.phoneNumberId || '', wabaId: x.wabaId || r.wabaId || '' }))
  }), [pin])
  useEffect(() => {
    if (pin) load().catch(() => {})
  }, [pin, load])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value.trim() })
  const save = async (e) => {
    e.preventDefault()
    setBusy('save')
    setMsg(null)
    try {
      const r = await withTxPin('Connect WhatsApp login', (tx) => api('/api/admin/whatsapp', { method: 'POST', body: f, pin, txPin: tx }), 'The token and app secret are kept on the server only')
      if (r) {
        setF({ ...f, token: '', appSecret: '' })
        setMsg({ ok: true, text: `Connected to +${r.number}${r.name ? ` (${r.name})` : ''}.${r.subscribed === false ? ' Meta did not confirm the app subscription: check the WhatsApp Business Account ID.' : ''} Now do step 2 below.` })
        await load()
      }
    } catch (e2) {
      setMsg({ ok: false, text: e2.message })
    }
    setBusy('')
  }
  const remove = async () => {
    setBusy('remove')
    try {
      if (await withTxPin('Turn off WhatsApp login', (tx) => api('/api/admin/whatsapp', { method: 'DELETE', pin, txPin: tx }))) {
        setMsg(null)
        await load()
      }
    } catch (e2) {
      setMsg({ ok: false, text: e2.message })
    }
    setBusy('')
  }
  if (!st) return null
  const on = st.connected
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide"><MessageCircle className="size-5 text-[#0f7c43]" /> Customer login</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${on ? 'bg-basil/15 text-basil' : 'bg-cream text-muted'}`}>
          WhatsApp {on ? `on · +${st.number}` : 'off'}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${st.telegram ? 'bg-telegram/10 text-telegram' : 'bg-cream text-muted'}`}>
          Telegram {st.telegram ? 'on' : 'off'}
        </span>
      </div>
      <p className="text-[13px] text-muted">
        Customers tap <b>Log masuk dengan WhatsApp</b>, WhatsApp opens with their code already typed, they tap Send, and the shop signs them in by itself. No PIN to forget, and it costs nothing:
        Meta does not charge for messages customers send you. <b>Telegram login</b> uses your bot above and is on whenever the bot is connected.
        Once WhatsApp is on, the old phone + PIN login is hidden. Wallet payments still ask for the customer's PIN.
      </p>

      <form onSubmit={save} className="space-y-3">
        <div className="text-[13.5px] font-bold">1. Your WhatsApp Cloud API keys</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold">Phone number ID</span>
            <input className="field font-mono" value={f.phoneNumberId} onChange={set('phoneNumberId')} inputMode="numeric" placeholder="1234567890123456" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold">WhatsApp Business Account ID</span>
            <input className="field font-mono" value={f.wabaId} onChange={set('wabaId')} inputMode="numeric" placeholder="1234567890123456" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold">Permanent access token</span>
            <input className="field font-mono" type="password" autoComplete="off" value={f.token} onChange={set('token')} placeholder={on ? 'Saved - leave blank to keep' : 'EAAG…'} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold">App secret</span>
            <input className="field font-mono" type="password" autoComplete="off" value={f.appSecret} onChange={set('appSecret')} placeholder={on ? 'Saved - leave blank to keep' : 'App settings → Basic'} />
          </label>
        </div>
        {msg && <p className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${msg.ok ? 'bg-basil/10 text-basil' : 'bg-tomato/10 text-tomato'}`}>{msg.text}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-red px-5 py-2.5 text-[14px]" disabled={!!busy || !f.phoneNumberId || (!on && (!f.token || !f.appSecret))}>
            {busy === 'save' && <Loader2 className="size-4 animate-spin" />} {on ? 'Update keys' : 'Check & connect'}
          </button>
          {on && (
            <button type="button" className="btn btn-ghost px-4 py-2.5 text-[13.5px]" disabled={!!busy} onClick={remove}>
              {busy === 'remove' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Turn off
            </button>
          )}
        </div>
      </form>

      {st.verifyToken && (
        <div className="space-y-3 rounded-2xl bg-cream/60 p-4">
          <div className="text-[13.5px] font-bold">2. Point Meta at the shop</div>
          <p className="text-[12.5px] text-muted">
            In your Meta app: <b>WhatsApp → Configuration → Webhook → Edit</b>. Paste these two, tap <b>Verify and save</b>, then under Webhook fields subscribe to <b>messages</b>.
          </p>
          <CopyRow label="Callback URL" value={st.webhookUrl} />
          <CopyRow label="Verify token" value={st.verifyToken} />
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            {st.lastInboundAt
              ? <span className="font-semibold text-basil">✓ Last WhatsApp message received {ago(st.lastInboundAt)}. Login works.</span>
              : <span className="text-muted">Test it: send any message to +{st.number} from your phone. You should get a reply, and this line turns green.</span>}
            <button type="button" className="btn btn-ghost ml-auto px-3 py-1.5 text-[12.5px]" onClick={() => load().catch(() => {})}><RefreshCw className="size-3.5" /> Check</button>
          </div>
        </div>
      )}
    </section>
  )
}
