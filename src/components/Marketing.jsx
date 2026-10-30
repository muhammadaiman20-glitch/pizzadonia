import { useCallback, useEffect, useState } from 'react'
import { Check, ClipboardCopy, Loader2, Megaphone, Pencil, RefreshCw, Save, Send, Sparkles, Trash2, TriangleAlert, TrendingUp, X } from 'lucide-react'
import { api, rm } from '../lib.js'
import { KINDS, PLATFORMS } from '../../marketing.js'
import SocialInbox from './SocialInbox.jsx'

const STATUS = {
  draft: ['Draf', 'bg-cheese/40 text-ink'],
  approved: ['Diluluskan', 'bg-basil text-white'],
  posted: ['Sudah diterbitkan', 'bg-ink text-white'],
  rejected: ['Ditolak', 'bg-line text-muted'],
}
const FILTERS = [['open', 'Perlu tindakan'], ['posted', 'Diterbitkan'], ['rejected', 'Ditolak']]

function Chips({ options, value, onChange, label }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([id, l]) => (
          <button type="button" key={id} aria-pressed={value === id} onClick={() => onChange(id)}
            className={`min-h-11 rounded-full px-4 text-[13.5px] font-bold ${value === id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{l}</button>
        ))}
      </div>
    </fieldset>
  )
}

function Report({ r }) {
  const change = r.orders - r.prevOrders
  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold"><TrendingUp className="size-4 text-basil" /> Prestasi 7 hari</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div><dt className="text-[12px] text-muted">Pesanan selesai</dt><dd className="text-xl font-extrabold">{r.orders}</dd>
          <dd className="text-[12px] text-muted">{change === 0 ? 'Sama seperti minggu lepas' : `${change > 0 ? '+' : ''}${change} berbanding minggu lepas`}</dd></div>
        <div><dt className="text-[12px] text-muted">Jualan pizza</dt><dd className="text-xl font-extrabold">{rm(r.sales)}</dd>
          <dd className="text-[12px] text-muted">Minggu lepas {rm(r.prevSales)}</dd></div>
      </dl>
      {r.top.length > 0 && <p className="mt-3 text-[13px]"><b>Paling laris:</b> {r.top.map((p) => `${p.name} (${p.qty})`).join(', ')}</p>}
      <p className="mt-2 rounded-2xl bg-cream p-3 text-[13px]"><b>Cadangan:</b> {r.suggestion}</p>
    </section>
  )
}

function Generator({ data, pin, onCreated }) {
  const [platform, setPlatform] = useState('facebook')
  const [kind, setKind] = useState('post')
  const [goal, setGoal] = useState('')
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const offers = [...data.promos.map((p) => `Kod ${p.code}`), data.cashback && `Cashback ${data.cashback.percent}%`, data.welcome && `Hadiah pelanggan baharu ${rm(data.welcome.amount)}`].filter(Boolean)
  const full = data.usedToday >= data.maxPerDay
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api('/api/admin/marketing/generate', { method: 'POST', body: { platform, kind, goal, products: picked }, pin })
      onCreated(r.draft)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold"><Sparkles className="size-4 text-tomato" /> Tulis kandungan baharu</h2>
      <Chips label="Platform" options={PLATFORMS} value={platform} onChange={setPlatform} />
      <Chips label="Jenis" options={KINDS} value={kind} onChange={setKind} />
      <div>
        <label htmlFor="mk-goal" className="mb-1.5 block text-[13px] font-bold">Tujuan (pilihan)</label>
        <input id="mk-goal" className="field" value={goal} maxLength={300} onChange={(e) => setGoal(e.target.value)} placeholder="Contoh: naikkan pesanan malam Jumaat" />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-bold">Fokus pizza (kosong = semua menu)</legend>
        <div className="flex flex-wrap gap-2">
          {data.products.map((p) => (
            <button type="button" key={p.id} aria-pressed={picked.includes(p.id)} onClick={() => toggle(p.id)}
              className={`min-h-11 rounded-full px-3.5 text-[13px] font-semibold ${picked.includes(p.id) ? 'bg-tomato text-white' : 'border border-line bg-white'}`}>{p.name}</button>
          ))}
        </div>
      </fieldset>
      <p className="text-[12.5px] text-muted">Tawaran yang boleh disebut: {offers.length ? offers.join(', ') : 'tiada promosi aktif'}.</p>
      {!data.aiReady && <p className="rounded-2xl bg-cream p-3 text-[13px]">AI hanya berjalan pada laman sebenar di Cloudflare.</p>}
      {error && <p role="alert" className="rounded-2xl bg-tomato/10 p-3 text-[13px] font-semibold text-tomato-deep">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-muted">{data.usedToday} daripada {data.maxPerDay} draf hari ini</span>
        <button className="btn btn-red min-h-11 px-5" disabled={busy || !data.aiReady || full}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {busy ? 'Sedang menulis...' : 'Tulis draf'}
        </button>
      </div>
    </form>
  )
}

function DraftCard({ d, pin, onChanged, onRemoved }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(d.text)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { setText(d.text); setAck(false) }, [d.text])
  const act = async (action, extra = {}) => {
    setBusy(true)
    setError('')
    try {
      const r = await api(`/api/admin/marketing/${d.id}`, { method: 'PATCH', body: { action, ...extra }, pin })
      onChanged(r.draft)
      setEditing(false)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  const remove = async () => {
    setBusy(true)
    try {
      await api(`/api/admin/marketing/${d.id}`, { method: 'DELETE', pin })
      onRemoved(d.id)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(d.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Tidak dapat menyalin. Tekan lama pada teks untuk salin.')
    }
  }
  const [label, cls] = STATUS[d.status]
  const hasWarnings = d.warnings.length > 0
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[14px]">{PLATFORMS[d.platform]} · {KINDS[d.kind]}</b>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
        <span className="ml-auto text-[11.5px] text-muted">{d.id} · {new Date(d.createdAt).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' })}</span>
      </div>
      {d.goal && <p className="mt-1 text-[12.5px] text-muted">Tujuan: {d.goal}</p>}
      {editing ? (
        <div className="mt-3">
          <label htmlFor={`mk-${d.id}`} className="sr-only">Ubah kandungan</label>
          <textarea id={`mk-${d.id}`} className="field min-h-48" value={text} maxLength={2500} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-line break-words rounded-2xl bg-cream/70 p-3 text-[14px] leading-relaxed">{d.text}</p>
      )}
      {hasWarnings && !editing && d.status !== 'posted' && d.status !== 'rejected' && (
        <div className="mt-3 rounded-2xl border border-cheese bg-cheese/15 p-3 text-[13px]">
          <p className="flex items-center gap-1.5 font-bold"><TriangleAlert className="size-4" /> Semak sebelum lulus</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          {d.status === 'draft' && (
            <label className="mt-2 flex min-h-11 items-center gap-2 font-semibold">
              <input type="checkbox" className="size-5" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Saya sudah semak dan maklumat ini benar
            </label>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-tomato/10 p-3 text-[13px] font-semibold text-tomato-deep">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {editing ? (
          <>
            <button className="btn btn-red min-h-11 px-4" disabled={busy || !text.trim()} onClick={() => act('edit', { text })}><Save className="size-4" /> Simpan</button>
            <button className="btn btn-ghost min-h-11 px-4" disabled={busy} onClick={() => { setEditing(false); setText(d.text) }}><X className="size-4" /> Batal</button>
          </>
        ) : (
          <>
            {d.status === 'draft' && <button className="btn btn-red min-h-11 px-4" disabled={busy || (hasWarnings && !ack)} onClick={() => act('approve', { ack })}><Check className="size-4" /> Lulus</button>}
            {d.status === 'approved' && <button className="btn btn-red min-h-11 px-4" onClick={copy}><ClipboardCopy className="size-4" /> {copied ? 'Disalin' : 'Salin'}</button>}
            {d.status === 'approved' && <button className="btn btn-ghost min-h-11 px-4" disabled={busy} onClick={() => act('posted')}><Megaphone className="size-4" /> Tanda diterbitkan</button>}
            {(d.status === 'draft' || d.status === 'approved') && <button className="btn btn-ghost min-h-11 px-4" disabled={busy} onClick={() => setEditing(true)}><Pencil className="size-4" /> Ubah</button>}
            {(d.status === 'draft' || d.status === 'approved') && <button className="btn btn-ghost min-h-11 px-4" disabled={busy} onClick={() => act('reject')}><X className="size-4" /> Tolak</button>}
            {d.status === 'rejected' && <button className="btn btn-ghost min-h-11 px-4" disabled={busy} onClick={remove}><Trash2 className="size-4" /> Padam</button>}
          </>
        )}
      </div>
    </li>
  )
}

export default function Marketing({ pin }) {
  const [view, setView] = useState('content')
  return (
    <div>
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Bahagian Marketing">
        {[['content', 'Kandungan'], ['inbox', 'Mesej']].map(([id, l]) => (
          <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`min-h-11 rounded-full px-5 text-[13.5px] font-bold ${view === id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{l}</button>
        ))}
      </div>
      {view === 'content' ? <Content pin={pin} /> : <SocialInbox pin={pin} />}
    </div>
  )
}

function Content({ pin }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('open')
  const load = useCallback(() => {
    setError('')
    return api('/api/admin/marketing', { pin }).then(setData).catch((e) => setError(e.message))
  }, [pin])
  useEffect(() => { load() }, [load])
  if (error && !data) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold">Tidak dapat memuatkan Marketing.</p>
        <p className="mt-1 text-[13px] text-muted">{error}</p>
        <button className="btn btn-ghost mt-3 min-h-11 px-4" onClick={load}><RefreshCw className="size-4" /> Cuba lagi</button>
      </div>
    )
  }
  if (!data) return <div className="grid place-items-center py-20"><Loader2 className="size-7 animate-spin text-tomato" /></div>
  const onCreated = (draft) => {
    setData((x) => ({ ...x, drafts: [draft, ...x.drafts], usedToday: x.usedToday + 1 }))
    setFilter('open')
  }
  const onChanged = (draft) => setData((x) => ({ ...x, drafts: x.drafts.map((y) => (y.id === draft.id ? draft : y)) }))
  const onRemoved = (id) => setData((x) => ({ ...x, drafts: x.drafts.filter((y) => y.id !== id) }))
  const shown = data.drafts.filter((d) => (filter === 'open' ? d.status === 'draft' || d.status === 'approved' : d.status === filter))
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Report r={data.report} />
        <Generator data={data} pin={pin} onCreated={onCreated} />
      </div>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map(([id, l]) => (
            <button key={id} onClick={() => setFilter(id)} className={`min-h-11 rounded-full px-4 text-[13px] font-bold ${filter === id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{l}</button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="card p-8 text-center text-[13.5px] text-muted">
            <Megaphone className="mx-auto mb-2 size-8 text-line" />
            {filter === 'open' ? 'Belum ada draf. Pilih platform dan tekan Tulis draf.' : 'Tiada kandungan di sini.'}
          </div>
        ) : (
          <ul className="space-y-3">{shown.map((d) => <DraftCard key={d.id} d={d} pin={pin} onChanged={onChanged} onRemoved={onRemoved} />)}</ul>
        )}
      </div>
    </div>
  )
}
