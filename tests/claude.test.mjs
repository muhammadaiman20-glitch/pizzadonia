import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toClaude, toClaudeTools, claudeOps, claudeGenerate, CLAUDE_OPS_MODEL, CLAUDE_CHAT_MODEL } from '../claude.js'
import { OPS_TOOLS, aiCalls } from '../ops-assistant.js'

const fake = (content, status = 200, stop = 'end_turn', seen = {}) => async (url, init) => {
  seen.url = url; seen.body = JSON.parse(init.body); seen.key = init.headers['x-api-key']
  return new Response(JSON.stringify(status === 200 ? { stop_reason: stop, content } : { error: { message: 'down' } }), { status })
}

test('history becomes alternating Messages API turns that start with the user', () => {
  const { system, messages } = toClaude([{ role: 'system', content: 'S' }, { role: 'assistant', content: 'old' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }])
  assert.equal(system, 'S'); assert.deepEqual(messages, [{ role: 'user', content: 'a\n\nb' }, { role: 'assistant', content: 'c' }])
  const tools = toClaudeTools(OPS_TOOLS); assert.equal(tools.length, OPS_TOOLS.length); assert.ok(tools.at(-1).cache_control); assert.ok(tools[0].input_schema)
})

test('ops: Claude tool calls come back in the shape ops-assistant reads', async () => {
  const seen = {}
  const r = await claudeOps({ ANTHROPIC_API_KEY: 'k' }, [{ role: 'system', content: 'S' }, { role: 'user', content: 'kenapa telegram tak masuk?' }], OPS_TOOLS,
    fake([{ type: 'text', text: 'Saya semak.' }, { type: 'tool_use', id: 't1', name: 'check_health', input: {} }], 200, 'tool_use', seen))
  assert.equal(seen.body.model, CLAUDE_OPS_MODEL); assert.equal(seen.body.output_config.effort, 'low'); assert.equal(seen.key, 'k')
  assert.deepEqual(aiCalls(r), [{ name: 'check_health', args: {} }]); assert.equal(r.response, 'Saya semak.')
})

test('customer chat: short text answer; errors throw so the backend falls back to Workers AI', async () => {
  const seen = {}
  assert.equal(await claudeGenerate({ ANTHROPIC_API_KEY: 'k' }, [{ role: 'user', content: 'buka pukul berapa?' }], fake([{ type: 'text', text: 'Kami buka 5 petang.' }], 200, 'end_turn', seen)), 'Kami buka 5 petang.')
  assert.equal(seen.body.model, CLAUDE_CHAT_MODEL)
  await assert.rejects(claudeGenerate({ ANTHROPIC_API_KEY: 'k' }, [{ role: 'user', content: 'x' }], fake([], 529)), /Claude 529/)
  await assert.rejects(claudeOps({ ANTHROPIC_API_KEY: 'k' }, [{ role: 'user', content: 'x' }], OPS_TOOLS, fake([], 200, 'refusal')), /refused/)
})
