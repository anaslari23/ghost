import { describe, it, expect } from 'vitest'

// Helper to simulate the exact SSE parser loop in src/renderer/src/services/openrouter.ts
function parseSSEChunks(chunks: string[]): { tokens: string[]; error?: string; done: boolean } {
  let buffer = ''
  const tokens: string[] = []
  let done = false
  let error: string | undefined

  for (const chunk of chunks) {
    buffer += chunk
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
          done = true
          return { tokens, done }
        }

        try {
          const parsed = JSON.parse(payload)
          if (parsed.error) {
            error = parsed.error.message || 'Stream error from OpenRouter'
            return { tokens, error, done }
          }
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            tokens.push(delta)
          }
        } catch {
          // ignore incomplete or malformed json
        }
      }
    }
  }

  return { tokens, error, done }
}

describe('OpenRouter SSE Streaming Parser', () => {
  it('parses tokens from standard data lines', () => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world!"}}]}\n\n',
      'data: [DONE]\n\n'
    ]
    const result = parseSSEChunks(stream)
    expect(result.tokens.join('')).toBe('Hello world!')
    expect(result.done).toBe(true)
  })

  it('skips comment lines like : OPENROUTER PROCESSING', () => {
    const stream = [
      ': OPENROUTER PROCESSING\n',
      'data: {"choices":[{"delta":{"content":"Answer:"}}]}\n\n',
      ': ping comment\n',
      'data: {"choices":[{"delta":{"content":" 42"}}]}\n\n',
      'data: [DONE]\n'
    ]
    const result = parseSSEChunks(stream)
    expect(result.tokens.join('')).toBe('Answer: 42')
    expect(result.done).toBe(true)
  })

  it('handles split chunks across buffer boundaries', () => {
    const stream = [
      'data: {"choices":[{"del',
      'ta":{"content":"Part1"}}]}\n',
      'data: {"choices":[{"delta":{"content":"Part2"}}]}\n',
      'data: [DO',
      'NE]\n'
    ]
    const result = parseSSEChunks(stream)
    expect(result.tokens.join('')).toBe('Part1Part2')
    expect(result.done).toBe(true)
  })

  it('catches and reports mid-stream errors', () => {
    const stream = [
      'data: {"choices":[{"delta":{"content":"Starting..."}}]}\n',
      'data: {"error":{"message":"Rate limit exceeded"}}\n'
    ]
    const result = parseSSEChunks(stream)
    expect(result.tokens.join('')).toBe('Starting...')
    expect(result.error).toBe('Rate limit exceeded')
  })
})

