import { AppMode } from '../../../shared/types'

export interface Brief {
  role: string
  company: string
  notes: string
}

const KEY = 'ghost_brief'

export function getStoredBrief(): Brief {
  try {
    return { role: '', company: '', notes: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { role: '', company: '', notes: '' }
  }
}

export function setStoredBrief(brief: Brief): void {
  localStorage.setItem(KEY, JSON.stringify(brief))
}

export const hasBrief = (b: Brief): boolean => !!(b.role.trim() || b.company.trim() || b.notes.trim())

/** Optional target context, appended to the (cached) system prompt. Empty when the user set nothing. */
export function formatBriefPromptContext(b: Brief, mode: AppMode): string {
  if (!hasBrief(b)) return ''
  const lines = [
    b.role.trim() && `Role: ${b.role.trim()}`,
    b.company.trim() && `Company: ${b.company.trim()}`,
    b.notes.trim() && `Notes: ${b.notes.trim()}`
  ].filter(Boolean)
  const guidance =
    mode === 'interview'
      ? `Tailor every answer to what a ${b.company.trim() || 'hiring'} interviewer for ${b.role.trim() || 'this role'} rewards: the company's known values and interview style, the expectations for that level, and its vocabulary. Choose the CV evidence that best proves fit for that role and level, and frame it the way that company's interviewers favor (structured, metric-driven, ownership). Claim nothing that is not in the CV.`
      : 'Tailor your answers to this context.'
  return `\n\n=== TARGET ===\n${lines.join('\n')}\n${guidance}\n`
}
