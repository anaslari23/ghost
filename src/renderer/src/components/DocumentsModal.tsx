
import React, { useState, useRef, useCallback } from 'react'
import { AppMode } from '../../../shared/types'
import {
  AttachedDocument,
  getStoredDocuments,
  saveStoredDocuments,
  deleteStoredDocument,
  parseFileToText
} from '../services/documents'

interface DocumentsModalProps {
  isOpen: boolean
  onClose: () => void
  activeMode: AppMode
  onDocumentsUpdated: () => void
}

export const DocumentsModal: React.FC<DocumentsModalProps> = ({
  isOpen,
  onClose,
  activeMode,
  onDocumentsUpdated
}) => {
  const [targetMode, setTargetMode] = useState<AppMode | 'all'>(activeMode)
  const [isDragging, setIsDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [selectedPreview, setSelectedPreview] = useState<AttachedDocument | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const documents = getStoredDocuments()
  const modeDocuments = documents.filter((d) => d.mode === 'all' || d.mode === targetMode)

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return

      setParsing(true)
      try {
        const newDocs: AttachedDocument[] = []

        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i]
          const text = await parseFileToText(file)

          newDocs.push({
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'text/plain',
            mode: targetMode,
            content: text,
            addedAt: Date.now()
          })
        }

        saveStoredDocuments([...documents, ...newDocs])
        onDocumentsUpdated()
      } catch (err) {
        console.error('Failed to parse dropped files', err)
      } finally {
        setParsing(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [documents, targetMode, onDocumentsUpdated]
  )

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleDelete = (id: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    deleteStoredDocument(id)
    if (selectedPreview?.id === id) {
      setSelectedPreview(null)
    }
    onDocumentsUpdated()
  }

  if (!isOpen) return null

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal docs-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <div className="settings-title">
            <span>📄 Resume & Context Documents</span>
            <span className="settings-badge">Grounding & Personalization</span>
          </div>
          <button className="settings-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* Target Mode Selector */}
          <div className="docs-mode-selector">
            <span className="field-label">Attach Document To:</span>
            <div className="modes-tab-bar mini">
              {(['interview', 'meeting', 'sales', 'custom', 'all'] as const).map((m) => (
                <button
                  key={m}
                  className={`mode-tab-btn ${targetMode === m ? 'active' : ''}`}
                  onClick={() => setTargetMode(m)}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              accept=".pdf,.txt,.md,.json,.docx"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="drop-icon">📎</div>
            <div className="drop-title">
              {parsing ? 'Parsing document text...' : 'Drop your CV, Resume, or Job Prep docs here'}
            </div>
            <div className="drop-subtext">
              Supports <b>PDF, TXT, Markdown</b> • Click to browse files
            </div>
            <div className="drop-target-pill">
              Target: <b>{targetMode.toUpperCase()} MODE</b>
            </div>
          </div>

          {/* Documents List */}
          <div className="docs-list-section">
            <div className="section-label">
              Attached Documents ({modeDocuments.length})
            </div>

            {modeDocuments.length === 0 ? (
              <div className="empty-message docs-empty">
                No documents uploaded for {targetMode.toUpperCase()} mode yet. Drop your CV above so the AI answers interview questions using your actual career experience!
              </div>
            ) : (
              <div className="docs-scroll-list">
                {modeDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className={`doc-card ${selectedPreview?.id === doc.id ? 'active' : ''}`}
                    onClick={() => setSelectedPreview(doc)}
                  >
                    <div className="doc-icon">📄</div>
                    <div className="doc-details">
                      <div className="doc-name">{doc.name}</div>
                      <div className="doc-meta">
                        <span>{(doc.size / 1024).toFixed(1)} KB</span>
                        <span>•</span>
                        <span className="doc-mode-tag">{doc.mode.toUpperCase()}</span>
                        <span>•</span>
                        <span>{doc.content.slice(0, 45).replace(/\n/g, ' ')}...</span>
                      </div>
                    </div>
                    <button
                      className="doc-delete-btn"
                      onClick={(e) => handleDelete(doc.id, e)}
                      title="Remove document"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview Box */}
          {selectedPreview && (
            <div className="doc-preview-box">
              <div className="doc-preview-header">
                <span>Preview: {selectedPreview.name}</span>
                <button
                  className="settings-close-btn"
                  onClick={() => setSelectedPreview(null)}
                >
                  ✕
                </button>
              </div>
              <div className="doc-preview-text">
                {selectedPreview.content.slice(0, 3000)}
                {selectedPreview.content.length > 3000 && '\n\n[... Remaining content truncated in preview ...]'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="primary-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
