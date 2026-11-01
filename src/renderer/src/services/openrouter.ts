import { AppMode, ModesMap } from '../../../shared/types'

export interface OpenRouterModel {
  id: string
  name: string
  description?: string
  promptPricePerMillion: number
  completionPricePerMillion: number
  contextLength: number
  isVision: boolean
  isFree: boolean
}

export const DEFAULT_MODES: ModesMap = {
  interview: {
    name: 'Interview',
    systemPrompt: `You are the user's live interview coach. Write exactly what they should say next, in first person, in their voice.
- Understand the question's intent, then build the answer from the user's background below. Never paste or list the CV: pick the 1-2 most relevant experiences, retell them naturally with their key numbers, and tie them to what is being asked (and to the target role: the one given below, otherwise the role the CV points to).
- Open with a 1-2 sentence direct answer they can say immediately, then at most 3 short supporting bullets.
- Behavioral question: a tight STAR story (about 120 words). Technical or system design: the approach and key trade-offs, citing real experience only where it genuinely fits. Coding: approach, complexity, clean code, edge cases.
- If the background has nothing relevant, answer well in general terms and say so briefly. Never invent employers, titles, degrees or metrics.`,
    model: '',
    maxScreenshotEdge: 1280
  },
  meeting: {
    name: 'Meeting',
    systemPrompt: `You are the user's real-time meeting assistant. Work out what is being asked of the user or what just happened, and give what they should say or know, as short bullets.
- A question to the user: a ready-to-say reply, using the user's notes below for facts.
- Decisions, owners, deadlines or action items you hear: list them.
- No more than 5 bullets, no padding. Never invent facts that are not in the notes or the conversation.`,
    model: '',
    maxScreenshotEdge: 1280
  },
  sales: {
    name: 'Sales',
    systemPrompt: `You are the user's live sales coach on a call. Identify the prospect's intent (question, objection or buying signal) and give the next thing to say.
- Objection: acknowledge it, reframe around value, add one proof point from the product notes below, then ask a question that moves the deal forward.
- Product or pricing questions: answer only from the notes below; if it is not there, say what to promise to follow up on.
- At most 4 short bullets plus one suggested question. Never invent features, prices or customers.`,
    model: '',
    maxScreenshotEdge: 1280
  },
  custom: {
    name: 'Custom',
    systemPrompt:
      "You are a real-time assistant. Work out what is being asked from the speech and the screen, and give a concise, directly usable answer. Use the user's documents when relevant. Never invent facts.",
    model: '',
    maxScreenshotEdge: 1280
  }
}

// Bump when DEFAULT_MODES prompts change so stale saved prompts don't override them.
const PROMPTS_VERSION = '3'

const STORAGE_KEYS = {
  API_KEY: 'cluely_openrouter_api_key',
  MODES: 'cluely_modes_config',
  ACTIVE_MODE: 'cluely_active_mode',
  CACHED_MODELS: 'cluely_cached_models',
  MODEL: 'ghost_model',
  PROMPTS_VERSION: 'ghost_prompts_version'
}

export function getStoredApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.API_KEY) || ''
  } catch {
    return ''
  }
}

export function setStoredApiKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.API_KEY, key.trim())
  } catch (e) {
    console.error('Failed to save API key to localStorage', e)
  }
}

export function getStoredModes(): ModesMap {
  try {
    if (localStorage.getItem(STORAGE_KEYS.PROMPTS_VERSION) !== PROMPTS_VERSION) {
      localStorage.removeItem(STORAGE_KEYS.MODES)
      localStorage.setItem(STORAGE_KEYS.PROMPTS_VERSION, PROMPTS_VERSION)
    }
    const raw = localStorage.getItem(STORAGE_KEYS.MODES)
    if (raw) {
      return { ...DEFAULT_MODES, ...JSON.parse(raw) }
    }
  } catch (e) {
    console.error('Failed to load modes from localStorage', e)
  }
  return DEFAULT_MODES
}

export function setStoredModes(modes: ModesMap): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MODES, JSON.stringify(modes))
  } catch (e) {
    console.error('Failed to save modes to localStorage', e)
  }
}

export function getStoredActiveMode(): AppMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_MODE) as AppMode
    if (raw && DEFAULT_MODES[raw]) return raw
  } catch {}
  return 'interview'
}

export function setStoredActiveMode(mode: AppMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, mode)
  } catch {}
}

export function getStoredModel(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.MODEL) || ''
  } catch {
    return ''
  }
}

export function setStoredModel(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MODEL, id)
  } catch {}
}

// Not real chat models: routers (negative price), summarizers, extractors.
const JUNK = /router|auto|summar|extract|embed|guard|moderation/i
const usable = (m: any): boolean =>
  parseFloat(m?.pricing?.prompt || '0') >= 0 && parseFloat(m?.pricing?.completion || '0') >= 0 && !JUNK.test(m.id)

// First preference that matches wins; within a preference the newest model. Falls back to the cheapest real paid model.
function pickBest(list: any[], prefs: RegExp[]): string {
  const ok = list.filter((m) => usable(m) && (m.context_length || 0) >= 32000)
  const newest = (a: any, b: any): number => (b.created || 0) - (a.created || 0)
  for (const re of prefs) {
    const hit = ok.filter((m) => re.test(m.id) && !/image|lite|thinking|:free/i.test(m.id)).sort(newest)[0]
    if (hit) return hit.id
  }
  const paid = ok.filter((m) => parseFloat(m.pricing.prompt) > 0 && parseFloat(m.pricing.completion) > 0)
  paid.sort((a, b) => parseFloat(a.pricing.prompt) - parseFloat(b.pricing.prompt))
  return (paid[0] || ok[0])?.id || ''
}

export function getCachedModels(): OpenRouterModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHED_MODELS)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {}
  return []
}

export function setCachedModels(models: OpenRouterModel[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CACHED_MODELS, JSON.stringify(models))
  } catch {}
}

export async function fetchOpenRouterModels(apiKey?: string): Promise<OpenRouterModel[]> {
  const key = (apiKey || getStoredApiKey()).trim()
  if (!key) {
    setCachedModels([])
    return []
  }
  const headers: Record<string, string> = {
    'HTTP-Referer': 'http://localhost',
    'X-Title': 'ghost'
  }

  if (key && key.trim()) {
    headers['Authorization'] = `Bearer ${key.trim()}`
  }

  const response = await fetch('https://openrouter.ai/api/v1/models', { headers })
  if (!response.ok) {
    let errorDetail = `${response.status} ${response.statusText}`
    try {
      const errJson = await response.json()
      if (errJson?.error?.message) errorDetail = errJson.error.message
    } catch {}
    throw new Error(`Failed to fetch models from OpenRouter: ${errorDetail}`)
  }

  const data = await response.json()
  const rawList = Array.isArray(data?.data) ? data.data : []

  // Speech-to-text model: audio-input, text-output; a fast Flash-class model by default.
  const audio = rawList.filter(
    (m: any) => (m?.architecture?.input_modalities || []).includes('audio') && (m?.architecture?.output_modalities || ['text']).includes('text')
  )
  try {
    localStorage.setItem('ghost_stt_model', pickBest(audio, [/gemini.*flash/i, /gpt.*audio.*mini|gpt.*mini/i, /voxtral/i]))
  } catch {}

  // Eligible = takes text + screenshot in, streams text out, and has room for a CV + transcript.
  const eligible = rawList.filter((m: any) => {
    if (!usable(m)) return false
    const input: string[] = m?.architecture?.input_modalities || []
    const output: string[] = m?.architecture?.output_modalities || ['text']
    return (
      input.includes('image') &&
      input.includes('text') &&
      output.includes('text') &&
      !output.includes('image') &&
      (m?.context_length || 0) >= 16000
    )
  })

  const parsed = eligible.map((m: any): OpenRouterModel => {
    const promptUSD = parseFloat(m?.pricing?.prompt || '0')
    const completionUSD = parseFloat(m?.pricing?.completion || '0')
    const isFree = m?.id?.endsWith(':free') || (promptUSD === 0 && completionUSD === 0)

    const architecture = m?.architecture || {}
    const modalities: string[] = architecture.input_modalities || m?.modalities || []
    const isVision = modalities.includes('image')

    return {
      id: m?.id || '',
      name: m?.name || m?.id || '',
      description: m?.description,
      promptPricePerMillion: promptUSD * 1_000_000,
      completionPricePerMillion: completionUSD * 1_000_000,
      contextLength: m?.context_length || 0,
      isVision: !!isVision,
      isFree: !!isFree
    }
  })

  // Cache models locally for instant offline loading
  setCachedModels(parsed)
  const stored = getStoredModel()
  const storedRaw = eligible.find((m: any) => m.id === stored)
  if (!storedRaw || !usable(storedRaw)) {
    setStoredModel(pickBest(eligible, [/claude.*haiku/i, /gemini.*flash/i, /gpt.*mini/i, /claude.*sonnet/i]))
  }

  return parsed
}

export interface StreamChatOptions {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  screenshotBase64?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
  onDelta: (token: string) => void
  signal?: AbortSignal
}

export async function streamOpenRouterChat(options: StreamChatOptions): Promise<void> {
  const { apiKey, model, systemPrompt, userPrompt, screenshotBase64, history = [], onDelta, signal } = options

  if (!apiKey) {
    throw new Error('Please set your OpenRouter API key in Settings first.')
  }
  if (!model) {
    throw new Error('No model selected. Open Settings and pick one.')
  }

  const userContentParts: any[] = [{ type: 'text', text: userPrompt }]

  // Only attach screenshot if screenshot is present and model supports vision
  if (screenshotBase64) {
    userContentParts.push({
      type: 'image_url',
      image_url: {
        url: screenshotBase64
      }
    })
  }

  const messages = [
    {
      role: 'system',
      // Stable prefix (instructions + condensed CV): cached by Anthropic/Gemini, ~90% cheaper on repeat requests.
      content: /^(anthropic|google)\//.test(model)
        ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
        : systemPrompt
    },
    ...history,
    { role: 'user', content: userContentParts }
  ]

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost',
      'X-Title': 'ghost'
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: 900, // answers are spoken aloud; also caps reasoning-model spend
      reasoning: { effort: 'low' },
      provider: {
        allow_fallbacks: true
      },
      messages
    }),
    signal
  })

  if (!response.ok) {
    let errMessage = `OpenRouter error (${response.status}): ${response.statusText}`
    try {
      const errJson = await response.json()
      if (errJson?.error) {
        const msg = errJson.error.message || response.statusText
        const raw =
          typeof errJson.error.metadata?.raw === 'string'
            ? errJson.error.metadata.raw
            : errJson.error.metadata?.raw
            ? JSON.stringify(errJson.error.metadata.raw)
            : ''
        const providerName = errJson.error.metadata?.provider_name
          ? ` [${errJson.error.metadata.provider_name}]`
          : ''
        errMessage = `${msg}${providerName}${raw ? `: ${raw}` : ''}`
      }
    } catch {}
    throw new Error(errMessage)
  }

  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      // Ignore comments (e.g., ": OPENROUTER PROCESSING")
      if (line.startsWith(':')) continue

      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') {
          return
        }

        try {
          const parsed = JSON.parse(payload)
          if (parsed.error) {
            const raw = parsed.error.metadata?.raw ? ` (${parsed.error.metadata.raw})` : ''
            throw new Error((parsed.error.message || 'Stream error from provider') + raw)
          }
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            onDelta(delta)
          }
        } catch (e: any) {
          if (e.message && (e.message.includes('Stream error') || e.message.includes('error'))) {
            throw e
          }
          // Non-JSON SSE line or chunking edge case; continue
        }
      }
    }
  }
}

/** One-shot, non-streaming completion (used to condense documents). */
export async function completeOpenRouterChat(opts: {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
}): Promise<string> {
  let out = ''
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey.trim()}`, 'Content-Type': 'application/json', 'X-Title': 'ghost' },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 900,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt }
      ]
    })
  })
  if (!response.ok) throw new Error(`OpenRouter error (${response.status})`)
  const data = await response.json()
  out = data.choices?.[0]?.message?.content || ''
  return out.trim()
}
