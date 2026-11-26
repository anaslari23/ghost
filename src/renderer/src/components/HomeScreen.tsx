import React, { useState } from 'react'
import { AppMode } from '../../../shared/types'
import { Session, getSessions, deleteSession, sessionTitle } from '../services/history'
import { FormattedAnswer } from './FormattedAnswer'

interface Props {
  names: Record<AppMode, string>
  resume: { mode: AppMode; title: string } | null
  onNew: (mode: AppMode) => void
  onResume: () => void
}

const MODES: { id: AppMode; hint: string }[] = [
  { id: 'interview', hint: 'Answers drawn from your CV' },
  { id: 'meeting', hint: 'Points, replies, action items' },
  { id: 'sales', hint: 'Objections and next steps' },
  { id: 'custom', hint: 'Your own instructions' }
]

const when = (t: number): string => {
  const d = new Date(t)
  const days = Math.floor((Date.now() - t) / 86400000)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days < 1 && d.getDate() === new Date().getDate()) return `Today, ${time}`
  if (days <= 1) return `Yesterday, ${time}`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + `, ${time}`
}

export const HomeScreen: React.FC<Props> = ({ names, resume, onNew, onResume }) => {
  const [sessions, setSessions] = useState<Session[]>(getSessions)
  const [open, setOpen] = useState<Session | null>(null)
  const [picking, setPicking] = useState(false)

  if (open) {
    return (
      <div className="home">
        <button className="home-back" onClick={() => setOpen(null)}>
          ← All chats <span className="home-when">{when(open.startedAt)} · {names[open.mode]}</span>
        </button>
        <div className="home-scroll">
          {open.items.map((it, i) => (
            <div key={i} className="thread-item">
              {it.q && <div className="thread-q">{it.q}</div>}
              <FormattedAnswer content={it.a} isStreaming={false} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (picking) {
    return (
      <div className="home">
        <button className="home-back" onClick={() => setPicking(false)}>
          ← Back
        </button>
        <div className="home-title">What's this for?</div>
        <div className="home-scroll">
          {MODES.map((m) => (
            <button key={m.id} className="home-pick" onClick={() => onNew(m.id)}>
              <span className="home-mode-name">{names[m.id]}</span>
              <span className="home-mode-hint">{m.hint}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="home">
      <div className="home-top">
        <div className="home-title">Chats</div>
        <button className="home-new" onClick={() => setPicking(true)}>
          + New
        </button>
      </div>
      <div className="home-scroll">
        {resume && (
          <button className="home-resume" onClick={onResume}>
            <span className="home-dot" />
            <span className="home-row-title">{resume.title}</span>
            <span className="home-when">In progress</span>
          </button>
        )}
        {sessions.length === 0 && !resume && (
          <div className="empty-hint">No chats yet. Press + New to start one.</div>
        )}
        {sessions.map((s) => (
          <div key={s.id} className="home-row" onClick={() => setOpen(s)}>
            <div className="home-row-main">
              <div className="home-row-title">{sessionTitle(s)}</div>
              <div className="home-when">
                {when(s.startedAt)} · {names[s.mode]} · {s.items.length} {s.items.length === 1 ? 'answer' : 'answers'}
              </div>
            </div>
            <button
              className="doc-delete-btn"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                deleteSession(s.id)
                setSessions(getSessions())
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
