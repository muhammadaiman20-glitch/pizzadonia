// Cloudflare Workers AI models the support chat may use (checked against the catalog 2026-10-18 with a Malay
// shop question). Shared by the server (validation), the cloud backend (env.AI.run) and the seller dashboard.
export const AI_MODELS = [
  { id: '@cf/aisingapore/gemma-sea-lion-v4-27b-it', label: 'SEA-LION', note: 'Made for Southeast Asian languages - most natural Malay' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B', note: 'Careful and quick, sticks closely to shop facts' },
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', note: 'Balanced' },
  { id: '@cf/meta/llama-3.1-8b-instruct-fp8', label: 'Llama 3.1 8B', note: 'Smallest and cheapest' },
]
export const DEFAULT_AI_MODEL = AI_MODELS[0].id
export const aiModel = (id) => (AI_MODELS.some((m) => m.id === id) ? id : DEFAULT_AI_MODEL)

/** Workers AI answers come in two shapes: { response } (older models) or OpenAI-style choices */
export const aiText = (r) => String(r?.response ?? r?.choices?.[0]?.message?.content ?? '').trim()
