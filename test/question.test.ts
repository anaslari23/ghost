import { describe, it, expect } from 'vitest'
import { isLikelyQuestion } from '../src/renderer/src/services/transcription'

describe('isLikelyQuestion', () => {
  it('detects real questions', () => {
    expect(isLikelyQuestion('So, tell me about a time you led a project')).toBe(true)
    expect(isLikelyQuestion('what is the time complexity of this')).toBe(true)
    expect(isLikelyQuestion('Does that make sense?')).toBe(true)
  })
  it('ignores statements that merely contain question words', () => {
    expect(isLikelyQuestion('I know what you mean about the time complexity')).toBe(false)
    expect(isLikelyQuestion('The space complexity is linear in practice')).toBe(false)
  })
})
