import { describe, it, expect } from 'vitest'
import { formatDocumentsPromptContext, AttachedDocument } from '../src/renderer/src/services/documents'

describe('Document formatting and context injection', () => {
  it('formats candidate documents context with resume details', () => {
    const mockDocs: AttachedDocument[] = [
      {
        id: '1',
        name: 'Senior_Engineer_CV.pdf',
        size: 24000,
        type: 'application/pdf',
        mode: 'interview',
        content: 'Staff Software Engineer at Acme Corp. Led migration of microservices handling 2M QPS.',
        addedAt: Date.now()
      }
    ]

    const promptContext = formatDocumentsPromptContext(mockDocs)
    expect(promptContext).toContain('USER DOCUMENTS')
    expect(promptContext).toContain('Senior_Engineer_CV.pdf')
    expect(promptContext).toContain('Staff Software Engineer at Acme Corp')
    expect(promptContext).toContain('2M QPS')
  })

  it('returns empty string when no documents are attached', () => {
    expect(formatDocumentsPromptContext([])).toBe('')
  })
})

