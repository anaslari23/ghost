import React, { useState, useEffect } from 'react'
import { Session, getSessions, deleteSession, sessionTitle } from '../services/history'
import { FormattedAnswer } from './FormattedAnswer'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const when = (t: number): string =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const HistoryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [sessions, setSessions] = useState<Session[]>([])
  const [open, setOpen] = useState<Session | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSessions(getSessions())
      setOpen(null)
    }
  }, [isOpen])
  if (!isOpen) return null

  const remove = (id: number, e: React.MouseEvent): void => {
    e.stopPropagation()
    deleteSession(id)
    setSessions(getSessions())
    if (open?.id === id) setOpen(null)
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title">
            {open ? (
              <button className="top-tab-btn" onClick={() => setOpen(null)}>
                ← History
              </button>
            ) : (
              <span>History</span>
            )}
            {open && <span className="settings-badge">{when(open.startedAt)}</span>}
          </div>
          <button className="settings-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-body">
          {open ? (
            open.items.map((item, i) => (
              <div key={i} className="thread-item current">
                {item.q && <div className="thread-q">{item.q}</div>}
                <FormattedAnswer content={item.a} isStreaming={false} />
              </div>
            ))
          ) : sessions.length === 0 ? (
            <div className="empty-message">
              No past conversations yet. Press Clear to save the current one here and start fresh.
            </div>
          ) : (
            <div className="docs-scroll-list">
              {sessions.map((s) => (
                <div key={s.id} className="doc-card" onClick={() => setOpen(s)}>
                  <div className="doc-details">
                    <div className="doc-name">{sessionTitle(s)}</div>
                    <div className="doc-meta">
                      <span>{when(s.startedAt)}</span>
                      <span>•</span>
                      <span>{s.mode}</span>
                      <span>•</span>
                      <span>{s.items.length} {s.items.length === 1 ? "answer" : "answers"}</span>
                    </div>
                  </div>
                  <button className="doc-delete-btn" onClick={(e) => remove(s.id, e)} title="Delete">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="settings-footer">
          <button className="primary-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
