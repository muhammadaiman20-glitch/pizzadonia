import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Check, Copy, ExternalLink, KeyRound, Loader2, RefreshCw, Send, Store, Trash2, TriangleAlert, Unlink, UserRound, X } from 'lucide-react'
import { api } from '../lib.js'
import { withTxPin } from './PinPrompt.jsx'

// Seller dashboard <-> Pizzadonia's own Telegram bot.
// 1. owner pastes the BotFather token  2. "Open Telegram" deep-links to t.me/<bot>?start=<code>
// 3. owner taps Start, the server's webhook links the chat, and this card flips to Connected by itself.

const since = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : new Date(ms).toLocaleDateString()
}
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const botfather = { app: 'tg://resolve?domain=BotFather', web: 'https://t.me/BotFather' }

/** connection state for the header chip + the card. live = also ask Telegram (webhook, bot). */
export function useTelegramStatus(pin, { live = false, every = 60000 } = {}) {
  const [st, setSt] = useState(null)
  const load = useCallback(
    (withLive = live) => api(`/api/admin/telegram${withLive ? '?live=1' : ''}`, { pin }).then((r) => (setSt(r), r)),
    [pin, live],
  )
  useEffect(() => {
    if (!pin) return
    load().catch(() => {})
    const id = setInterval(() => document.visibilityState === 'visible' && load(false).catch(() => {}), every)
    return () => clearInterval(id)
  }, [pin, load, every])
  return [st, load]
}

/** "Telegram ● Connected" pill in the seller header */
export function TelegramChip({ st, onOpen }) {
  if (!st) return null
  const tone = linkTone(st)
  const label = { ok: 'Connected', wait: 'Not linked', bad: 'Problem', off: 'Off' }[tone]
  return (
    <button onClick={onOpen} title={`Telegram: ${label}`}
      className="btn btn-ghost gap-1.5 px-2.5 py-1.5 text-[12.5px]">
      <Send className="size-3.5 text-telegram" />
      <span className={`size-2 rounded-full ${tone === 'ok' ? 'bg-basil' : tone === 'bad' ? 'bg-tomato' : tone === 'wait' ? 'bg-cheese' : 'bg-ink/25'}`} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// overall health of the bot -> chat link
function linkTone(st) {
  if (!st || st.mode === 'off') return 'off'
  if (st.blockedAt || st.reachable === false || (st.delivery?.ok === false && st.delivery.permanent) || st.webhook?.ok === false) return 'bad'
  return st.connected ? 'ok' : 'wait'
}

function Segment({ state }) {
  // ok = solid basil, wait = dashes flowing toward the chat, bad = broken red, off = faint dashes
  return (
    <div className="relative mx-1 h-[3px] min-w-6 flex-1 rounded-full sm:mx-2" aria-hidden>
      <div className={`absolute inset-0 rounded-full transition-colors duration-500 ${state === 'ok' ? 'bg-basil' : state === 'bad' ? 'bg-tomato/70' : state === 'wait' ? 'tg-flow' : 'tg-dash'}`} />
      {state === 'bad' && <X className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper p-0.5 text-tomato" strokeWidth={3} />}
    </div>
  )
}

function Node({ icon: Icon, title, sub, state, pop }) {
  const ring = state === 'ok' ? 'bg-basil text-white' : state === 'bad' ? 'bg-tomato text-white' : state === 'wait' ? 'bg-cheese/40 text-ink' : 'bg-cream text-muted'
  return (
    <div className="flex w-20 shrink-0 flex-col items-center text-center sm:w-28">
      <div className={`relative grid size-12 place-items-center rounded-2xl transition-colors duration-500 sm:size-14 ${ring} ${pop ? 'pop' : ''}`}>
        <Icon className="size-6" />
        {state === 'ok' && <Check className="absolute -right-1.5 -top-1.5 size-5 rounded-full bg-paper p-0.5 text-basil" strokeWidth={3} />}
      </div>
      <div className="mt-1.5 w-full truncate text-[12.5px] font-bold">{title}</div>
      <div className="w-full truncate text-[11.5px] text-muted">{sub}</div>
    </div>
  )
}

function Diagram({ st, shopName, justLinked }) {
  const hookState = !st.bot ? 'off' : st.webhook?.ok === false || st.reachable === false ? 'bad' : 'ok'
  const chatState = st.connected ? (linkTone(st) === 'bad' ? 'bad' : 'ok') : st.bot ? 'wait' : 'off'
  return (
    <div className="flex items-start justify-center rounded-2xl bg-cream/70 px-2 py-4 sm:px-6" role="img"
      aria-label={`Shop to bot: ${hookState}. Bot to your Telegram: ${chatState}.`}>
      <Node icon={Store} title={shopName} sub="seller dashboard" state="ok" />
      <div className="flex flex-1 pt-6 sm:pt-7"><Segment state={hookState} /></div>
      <Node icon={Bot} title={st.bot ? `@${st.bot.username}` : 'No bot yet'} sub={st.bot?.name || 'from BotFather'} state={hookState} />
      <div className="flex flex-1 pt-6 sm:pt-7"><Segment state={chatState} /></div>
      <Node icon={UserRound} title={st.connected ? st.chat?.name || 'Your chat' : 'You'} sub={st.connected ? (st.chat?.username ? `@${st.chat.username}` : 'Telegram') : st.bot ? 'tap Start' : 'Telegram'} state={chatState} pop={justLinked} />
    </div>
  )
}

function Row({ label, children, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-0">
      <dt className="shrink-0 text-[12.5px] text-muted">{label}</dt>
      <dd className={`min-w-0 text-right text-[13.5px] font-semibold ${tone === 'bad' ? 'text-tomato' : tone === 'ok' ? 'text-basil' : ''}`}>{children}</dd>
    </div>
  )
}

function TokenForm({ pin, onSaved, onCancel }) {
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const r = await withTxPin('Connect Telegram bot', (tx) => api('/api/admin/telegram/bot', { method: 'POST', body: { token }, pin, txPin: tx }), 'Your bot token is kept on the server only')
      if (r) onSaved(r.bot)
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <ol className="space-y-2.5 text-[13.5px]">
        <li className="flex gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-bold text-white">1</span>
          <div className="min-w-0">
            Open <b>@BotFather</b> in Telegram, send <code className="rounded bg-cream px-1.5 py-0.5 text-[12.5px]">/newbot</code>, and give it a name such as <i>Pizzadonia Alerts</i>.
            <div className="mt-1.5 flex flex-wrap gap-2">
              <a href={botfather.app} className="btn btn-ghost px-3 py-1.5 text-[12.5px]"><Send className="size-3.5 text-telegram" /> Open BotFather</a>
              <a href={botfather.web} target="_blank" rel="noreferrer" className="self-center text-[12.5px] text-muted underline underline-offset-2">or open t.me/BotFather</a>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-bold text-white">2</span>
          <div className="min-w-0 flex-1">
            Paste the token BotFather sends back. It looks like <span className="whitespace-nowrap font-mono text-[12px]">123456789:AAH…</span>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input className="field font-mono text-[13px]" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="123456789:AAH…"
                autoComplete="off" spellCheck="false" aria-label="Bot token" aria-invalid={Boolean(err)} />
              <button className="btn btn-red shrink-0 px-5 py-2.5 text-[14px]" disabled={busy || token.length < 40}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Save bot
              </button>
            </div>
          </div>
        </li>
      </ol>
      {err && <p role="alert" className="rounded-xl bg-tomato/10 px-3 py-2 text-[13px] font-semibold text-tomato">{err}</p>}
      {onCancel && <button type="button" onClick={onCancel} className="text-[12.5px] text-muted underline underline-offset-2">Keep the current bot</button>}
    </form>
  )
}

// the one-time /start link: made ahead of time so the button is a real link (opens the app from the tap itself)
function useStartLink(pin, wanted) {
  const [link, setLink] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const busy = useRef(false)
  const make = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      setLink(await api('/api/admin/telegram/link', { method: 'POST', body: {}, pin }))
    } catch {
      setLink(null)
    }
    busy.current = false
  }, [pin])
  useEffect(() => {
    if (!wanted) return setLink(null)
    make()
  }, [wanted, make])
  useEffect(() => {
    if (!link) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [link])
  // expired while the owner was away -> quietly make a fresh one
  useEffect(() => {
    if (wanted && link && now > link.exp - 5000 && document.visibilityState === 'visible') make()
  }, [wanted, link, now, make])
  return { link, left: link ? link.exp - now : 0, renew: make }
}

export function TelegramSettings({ s, setS, pin }) {
  const t = s.telegram || {}
  const [st, load] = useTelegramStatus(pin, { live: true, every: 30000 })
  const [msg, setMsg] = useState('')
  const [changing, setChanging] = useState(false)
  const [justLinked, setJustLinked] = useState(false)
  const [copied, setCopied] = useState(false)
  const set = (k, v) => setS({ ...s, telegram: { ...t, [k]: v } })
  const ownBot = st?.mode === 'own' && st.bot
  const waiting = Boolean(ownBot && !st.connected)
  const { link, left, renew } = useStartLink(pin, waiting)
  const was = useRef(null)

  // while waiting for Start: check every 2.5 s, and right away when the owner comes back from Telegram
  useEffect(() => {
    if (!waiting) return
    const tick = () => document.visibilityState === 'visible' && load(false).catch(() => {})
    const id = setInterval(tick, 2500)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [waiting, load])
  useEffect(() => {
    if (!st) return
    if (was.current === false && st.connected) {
      setJustLinked(true)
      setMsg('')
      load(true).catch(() => {})
    }
    was.current = st.connected
  }, [st, load])

  const run = async (label, fn) => {
    setMsg(label)
    try {
      const r = await fn()
      await load(true)
      return r
    } catch (e) {
      setMsg(e.message)
    }
  }
  const test = () => run('Sending…', async () => {
    const r = await api('/api/admin/telegram-test', { method: 'POST', body: {}, pin })
    setMsg(r.queued ? 'Sent - it lands in Telegram within a few seconds' : 'Sent - check Telegram')
  })
  const unlink = () => confirm('Stop Telegram alerts in this chat? You can connect again any time.') &&
    run('Disconnecting…', async () => {
      await api('/api/admin/telegram/unlink', { method: 'POST', body: {}, pin })
      setJustLinked(false)
      setMsg('')
    })
  const removeBot = () => confirm('Remove this bot from Pizzadonia? Alerts stop until you add a bot again.') &&
    run('Removing…', async () => {
      const r = await withTxPin('Remove Telegram bot', (tx) => api('/api/admin/telegram/bot', { method: 'DELETE', pin, txPin: tx }))
      if (r) setMsg('')
    })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.web)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy this link', link.web)
    }
  }

  const tone = linkTone(st)
  const box = (k, label) => (
    <label key={k} className="flex items-center gap-2 text-[13.5px]">
      <input type="checkbox" className="size-5 accent-[#e23d2d]" checked={t[k] !== false} onChange={(e) => set(k, e.target.checked)} disabled={!t.enabled} /> {label}
    </label>
  )
  return (
    <section id="telegram" className="card scroll-mt-32 space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl tracking-wide">Telegram</h2>
        {st && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${tone === 'ok' ? 'bg-basil text-white' : tone === 'bad' ? 'bg-tomato text-white' : tone === 'wait' ? 'bg-cheese/50 text-ink' : 'bg-ink/10 text-muted'}`}>
            {tone === 'wait' && <span className="size-1.5 animate-pulse rounded-full bg-ink" />}
            {{ ok: 'Connected', wait: 'Waiting for Start', bad: 'Needs attention', off: 'Not set up' }[tone]}
          </span>
        )}
        <button role="switch" aria-checked={t.enabled} onClick={() => set('enabled', !t.enabled)} className={`relative ml-auto h-7 w-12 rounded-full transition ${t.enabled ? 'bg-basil' : 'bg-ink/25'}`} aria-label="Telegram alerts on">
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${t.enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {!st ? (
        <div className="grid h-40 place-items-center rounded-2xl bg-cream/70"><Loader2 className="size-6 animate-spin text-telegram" /></div>
      ) : (
        <>
          <Diagram st={st} shopName={s.shopName || 'Pizzadonia'} justLinked={justLinked} />

          {(!ownBot || changing) && (
            <div className="space-y-3">
              <p className="text-[13px] text-muted">
                Get new orders, receipts and customer chats on your phone. Make a free bot for Pizzadonia - it takes a minute.
              </p>
              <TokenForm pin={pin} onSaved={() => (setChanging(false), setJustLinked(false), load(true))} onCancel={changing ? () => setChanging(false) : null} />
            </div>
          )}

          {waiting && !changing && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-telegram/40 px-4 py-5 text-center">
              <p className="max-w-md text-[14px]">
                Open <b>@{st.bot.username}</b> in Telegram and tap <b>Start</b>. This page turns green by itself.
              </p>
              {link ? (
                <a href={link.app} className="btn bg-telegram px-6 py-3 text-[15px] text-white shadow-card hover:bg-telegram-deep">
                  <Send className="size-5" /> Open Telegram & connect
                </a>
              ) : (
                <span className="btn bg-telegram/60 px-6 py-3 text-[15px] text-white"><Loader2 className="size-5 animate-spin" /> Preparing link…</span>
              )}
              {link && (
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
                  <a href={link.web} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                    App didn&apos;t open? Use t.me <ExternalLink className="size-3" />
                  </a>
                  <button type="button" onClick={copy} className="inline-flex items-center gap-1 underline underline-offset-2">
                    <Copy className="size-3" /> {copied ? 'Copied' : 'Copy link for your phone'}
                  </button>
                  <span className="tabular-nums">Link works for {mmss(left)}</span>
                </div>
              )}
              {st.siteOk === false && <p className="text-[12.5px] font-semibold text-tomato">The shop has no public https link, so Telegram can&apos;t reach it.</p>}
              <button type="button" onClick={() => setChanging(true)} className="text-[12px] text-muted underline underline-offset-2">Use a different bot</button>
            </div>
          )}

          {st.connected && !changing && (
            <div className="space-y-3">
              {justLinked && (
                <p className="rise rounded-2xl bg-basil/10 px-4 py-3 text-[13.5px] font-semibold text-basil">
                  Connected. Your bot just said hello in Telegram - alerts land there from now on.
                </p>
              )}
              {st.blockedAt && (
                <p role="alert" className="flex gap-2 rounded-2xl bg-tomato/10 px-4 py-3 text-[13px] text-tomato">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>You blocked the bot in Telegram, so alerts can&apos;t reach you. Open the chat and tap <b>Restart</b> or <b>Unblock</b>.</span>
                </p>
              )}
              <dl className="rounded-2xl bg-cream/70 px-4 py-1">
                <Row label="Bot">{st.bot ? `@${st.bot.username}` : '-'}</Row>
                <Row label="Alerts go to">{st.chat?.name}{st.chat?.username ? ` · @${st.chat.username}` : ''}</Row>
                {st.chat?.at && <Row label="Connected">{new Date(st.chat.at).toLocaleString()}</Row>}
                {st.webhook && (
                  <Row label="Bot link to shop" tone={st.webhook.ok ? 'ok' : 'bad'}>
                    {st.webhook.ok ? (st.webhook.lastError && Date.now() - st.webhook.lastErrorAt < 3600e3 ? `Working · recent error: ${st.webhook.lastError}` : 'Working') : 'Broken - save the bot again'}
                  </Row>
                )}
                {st.reachable === false && <Row label="Telegram" tone="bad">{st.error || 'Not reachable'}</Row>}
                <Row label="Last alert" tone={st.delivery?.ok === false ? 'bad' : st.delivery?.ok ? 'ok' : undefined}>
                  {st.delivery?.at ? (st.delivery.ok ? `Delivered ${since(st.delivery.at)}` : `Failed ${since(st.delivery.at)}: ${st.delivery.error}`) : 'None yet'}
                  {st.delivery?.queued > 0 && ` · ${st.delivery.queued} on the way`}
                </Row>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-ghost px-4 py-2 text-[13px]" onClick={test}><Send className="size-4 text-telegram" /> Send test alert</button>
                {st.bot && <a href={`tg://resolve?domain=${st.bot.username}`} className="btn btn-ghost px-4 py-2 text-[13px]"><ExternalLink className="size-4" /> Open chat</a>}
                <button type="button" className="btn btn-ghost px-3 py-2 text-[13px]" onClick={() => load(true).then(() => setMsg('Checked just now')).catch((e) => setMsg(e.message))} aria-label="Check connection"><RefreshCw className="size-4" /></button>
                {ownBot && <button type="button" className="btn btn-ghost px-4 py-2 text-[13px] text-tomato" onClick={unlink}><Unlink className="size-4" /> Disconnect</button>}
              </div>
            </div>
          )}

          {msg && <p className="text-[13px] text-muted" aria-live="polite">{msg}</p>}

          <div className="space-y-2 border-t border-line pt-4">
            <div className="text-[13px] font-bold">Send me alerts for</div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {box('payments', 'Payments: receipts, wallet, COD cash, bank-ins, refunds')}
              {box('orders', 'New orders and menu changes')}
              {box('support', 'A customer needs you in chat')}
            </div>
            <p className="text-[12px] text-muted">Switches save with <b>Save settings</b> at the bottom.</p>
          </div>

          {ownBot && !changing && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
              <button type="button" onClick={() => setChanging(true)} className="underline underline-offset-2">Change bot</button>
              <button type="button" onClick={removeBot} className="inline-flex items-center gap-1 underline underline-offset-2"><Trash2 className="size-3" /> Remove bot</button>
            </div>
          )}

        </>
      )}
    </section>
  )
}
