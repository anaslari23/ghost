import { describe, it, expect } from 'vitest'
import { retrieveExcerpts, AttachedDocument } from '../src/renderer/src/services/documents'

const doc = (content: string): AttachedDocument => ({
  id: '1', name: 'cv.txt', size: content.length, type: 'text/plain', mode: 'all', content, addedAt: 0
})

describe('retrieveExcerpts', () => {
  const cv = doc(
    'Education: BSc Computer Science. ' + 'Filler sentence about hobbies. '.repeat(30) +
      'At Northwind I led the Kafka migration of the checkout microservices, cutting p99 latency by 62 percent. ' +
      'Filler sentence about travel. '.repeat(30)
  )
  it('returns the passage that matches the question', () => {
    const out = retrieveExcerpts([cv], 'Tell me about a time you led a migration')
    expect(out).toContain('Kafka migration')
    expect(out).toContain('62 percent')
  })
  it('returns nothing when no words match', () => {
    expect(retrieveExcerpts([cv], 'zzzz qqqq')).toBe('')
  })
  it('stays within the size budget', () => {
    expect(retrieveExcerpts([cv], 'migration checkout latency hobbies travel', 500).length).toBeLessThan(700)
  })
})
