import { AppMode } from '../../../shared/types'

export interface SessionItem {
  q: string
  a: string
}

export interface Session {
  id: number
  startedAt: number
  endedAt: number
  mode: AppMode
  items: SessionItem[]
}

const KEY = 'ghost_history'
const MAX_SESSIONS = 50

export function getSessions(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

function save(sessions: Session[]): void {
  localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
}

/** Store a finished conversation, newest first. Empty conversations are ignored. */
export function addSession(items: SessionItem[], mode: AppMode, startedAt: number): void {
  const kept = items.filter((i) => i.a.trim())
  if (kept.length === 0) return
  save([{ id: Date.now(), startedAt, endedAt: Date.now(), mode, items: kept }, ...getSessions()])
}

export function deleteSession(id: number): void {
  save(getSessions().filter((s) => s.id !== id))
}

export function sessionTitle(s: Session): string {
  return (s.items.find((i) => i.q)?.q || s.items[0].a).replace(/\s+/g, ' ').slice(0, 70)
}
