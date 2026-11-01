
import React, { useState, useRef, useCallback } from 'react'
import {
  AttachedDocument,
  getStoredDocuments,
  saveStoredDocuments,
  deleteStoredDocument,
  parseFileToText, summarizeDocument
} from '../services/documents'

interface DocumentsModalProps {
  isOpen: boolean
  onClose: () => void
  onDocumentsUpdated: () => void
}

export const DocumentsModal: React.FC<DocumentsModalProps> = ({
  isOpen,
  onClose,
  onDocumentsUpdated
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [selectedPreview, setSelectedPreview] = useState<AttachedDocument | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const documents = getStoredDocuments()
  const modeDocuments = documents

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
            mode: 'all',
            content: text,
            summary: await summarizeDocument(text),
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
    [documents, onDocumentsUpdated]
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
            <span>Documents</span>
          </div>
          <button className="settings-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-body">
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
          </div>

          {/* Documents List */}
          <div className="docs-list-section">
            <div className="section-label">
              Attached Documents ({modeDocuments.length})
            </div>

            {modeDocuments.length === 0 ? (
              <div className="empty-message docs-empty">
                No documents yet. Drop a CV, job description or notes above. Add several and switch each on or off.
              </div>
            ) : (
              <div className="docs-scroll-list">
                {modeDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className={`doc-card ${selectedPreview?.id === doc.id ? 'active' : ''}`}
                    onClick={() => setSelectedPreview(doc)}
                  >
                                        <div className="doc-details">
                      <div className="doc-name">{doc.name}</div>
                      <div className="doc-meta">
                        <span>{(doc.size / 1024).toFixed(1)} KB</span>
                        <span>•</span>
                        <span>{doc.summary ? 'condensed' : 'not condensed yet'}</span>
                      </div>
                    </div>
                    <button
                      className={`tool-pill ${doc.active === false ? '' : 'auto-active'}`}
                      style={{ width: 'auto', padding: '0 10px', fontSize: 10, height: 24 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        saveStoredDocuments(documents.map((x) => (x.id === doc.id ? { ...x, active: doc.active === false } : x)))
                        onDocumentsUpdated()
                      }}
                      title="Use this document in answers"
                    >
                      <span style={{ display: 'inline' }}>{doc.active === false ? 'Off' : 'In use'}</span>
                    </button>
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
