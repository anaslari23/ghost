import { describe, it, expect } from 'vitest'
import { formatBriefPromptContext } from '../src/renderer/src/services/brief'

describe('formatBriefPromptContext', () => {
  it('is empty when nothing is set', () => {
    expect(formatBriefPromptContext({ role: '', company: ' ', notes: '' }, 'interview')).toBe('')
  })
  it('tailors interview answers to role and company', () => {
    const out = formatBriefPromptContext({ role: 'SWE II', company: 'Google', notes: '' }, 'interview')
    expect(out).toContain('Role: SWE II')
    expect(out).toContain('Google interviewer for SWE II')
  })
  it('uses generic guidance outside interview mode', () => {
    expect(formatBriefPromptContext({ role: '', company: 'Acme', notes: '' }, 'sales')).toContain('Tailor your answers')
  })
})
