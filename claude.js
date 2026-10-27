// Claude for the cloud backend (fetch only, no SDK). First choice when the ANTHROPIC_API_KEY Worker secret is set;
// the Workers AI models chosen on the dashboard stay the fallback. Two jobs:
//   - customer chat replies (short Malay answers)       -> claudeGenerate()  : text
//   - the owner's Telegram ops assistant (tool calling) -> claudeOps()       : { response, tool_calls } in the
//     same shape as a Workers AI result, so ops-assistant.js (aiCalls / replyText) reads it unchanged.
export const CLAUDE_CHAT_MODEL = 'claude-haiku-5-5'
export const CLAUDE_OPS_MODEL = 'claude-sonnet-5-5'

/** Text-only chat history -> Messages API shape: system split out, roles merged, first turn from the user. */
export function toClaude(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n\n')
  const turns = []
  for (const m of messages) {
    if (m.role === 'system') continue
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const text = String(m.content ?? '').trim()
    if (!text) continue
    const last = turns.at(-1)
    if (last?.role === role) last.content += '\n\n' + text
    else turns.push({ role, content: text })
  }
  while (turns.length && turns[0].role !== 'user') turns.shift()
  return { system, messages: turns }
}

/** Workers AI tool list ({ type: 'function', function }) -> Claude tools; the stable list carries the cache breakpoint. */
export const toClaudeTools = (tools) => tools.map((t, i) => ({
  name: t.function.name, description: t.function.description, input_schema: t.function.parameters,
  ...(i === tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
}))

async function call(env, body, fetcher = fetch) {
  const r = await fetcher('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`Claude ${r.status}: ${String(j?.error?.message || 'error').slice(0, 200)}`)
  if (j?.stop_reason === 'refusal') throw new Error('Claude refused')
  return j
}
const textOf = (j) => (j?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()

/** Customer chat: a short answer from shop facts. Throws on failure so the caller can use Workers AI. */
export async function claudeGenerate(env, messages, fetcher) {
  const { system, messages: turns } = toClaude(messages)
  const j = await call(env, {
    model: env.CLAUDE_CHAT_MODEL || CLAUDE_CHAT_MODEL, max_tokens: 1200, output_config: { effort: 'low' },
    ...(system ? { system } : {}), messages: turns,
  }, fetcher)
  const text = textOf(j)
  if (!text) throw new Error('Claude: empty answer')
  return text
}

/** Ops assistant turn with tools. Returns { response, tool_calls: [{ name, arguments }] } like Workers AI. */
export async function claudeOps(env, messages, tools, fetcher) {
  const { system, messages: turns } = toClaude(messages)
  const j = await call(env, {
    model: env.CLAUDE_OPS_MODEL || CLAUDE_OPS_MODEL, max_tokens: 3000,
    // reads and short plans; low effort keeps the bot quick, tools still get checked
    output_config: { effort: 'low' },
    ...(system ? { system: [{ type: 'text', text: system }] } : {}),
    ...(tools?.length ? { tools: toClaudeTools(tools) } : {}),
    messages: turns,
  }, fetcher)
  const tool_calls = (j.content || []).filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name, arguments: b.input ?? {} }))
  return { response: textOf(j), tool_calls }
}
