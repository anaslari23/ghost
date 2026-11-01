import React, { useState, useEffect } from 'react'
import { Brief, getStoredBrief, setStoredBrief } from '../services/brief'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved: (b: Brief) => void
}

export const BriefModal: React.FC<Props> = ({ isOpen, onClose, onSaved }) => {
  const [brief, setBrief] = useState<Brief>(getStoredBrief)
  useEffect(() => {
    if (isOpen) setBrief(getStoredBrief())
  }, [isOpen])
  if (!isOpen) return null

  const field = (key: keyof Brief) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
    setBrief((prev) => ({ ...prev, [key]: e.target.value }))
  const save = (b: Brief): void => {
    setStoredBrief(b)
    onSaved(b)
    onClose()
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title">
            <span>Target</span>
            <span className="settings-badge">Optional</span>
          </div>
          <button className="settings-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-body">
          <div className="hint-text">
            Answers are tailored to your CV already. Add the role and company to shape them for that interviewer.
          </div>
          <div className="field-group">
            <label className="field-label">Role</label>
            <input className="input-field" placeholder="e.g. SWE II" value={brief.role} onChange={field('role')} />
          </div>
          <div className="field-group">
            <label className="field-label">Company</label>
            <input className="input-field" placeholder="e.g. Google" value={brief.company} onChange={field('company')} />
          </div>
          <div className="field-group">
            <label className="field-label">Anything else</label>
            <textarea
              className="textarea-field"
              rows={3}
              placeholder="Round type, team, topics to emphasise, job description highlights..."
              value={brief.notes}
              onChange={field('notes')}
            />
          </div>
        </div>
        <div className="settings-footer">
          <button className="secondary-btn" onClick={() => save({ role: '', company: '', notes: '' })}>
            Clear
          </button>
          <button className="primary-btn" onClick={() => save(brief)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
