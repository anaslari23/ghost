import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Square,
  Play,
  Pause,
  Settings,
  FileText,
  Copy,
  Check,
  Maximize2, MousePointer2,
  Minimize2,
  Shield,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { AppMode, AppStatus, HotkeyAction, ModesMap } from '../../shared/types'
import {
  getStoredApiKey,
  getStoredModes,
  setStoredModes,
  getStoredActiveMode,
  setStoredActiveMode,
  getStoredModel,
  fetchOpenRouterModels,
  streamOpenRouterChat
} from './services/openrouter'
import {
  AttachedDocument,
  getStoredDocuments,
  saveStoredDocuments,
  parseFileToText,
  formatDocumentsPromptContext
} from './services/documents'
import {
  LiveAudioTranscriber,
  TranscriptTurn,
  getStoredSTTConfig,
  saveStoredSTTConfig
} from './services/transcription'
import { FormattedAnswer } from './components/FormattedAnswer'
import { SettingsModal } from './components/SettingsModal'
import { DocumentsModal } from './components/DocumentsModal'

const SCREEN_RE = /\b(screen|this|here|code|problem|diagram|slide|see|shown|following|below|above|function|error|bug|chart|table)\b/i

export const App: React.FC = () => {
  const [clickThrough, setClickThrough] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [modes, setModes] = useState<ModesMap>(getStoredModes)
  const [activeMode, setActiveMode] = useState<AppMode>(getStoredActiveMode)
  const [status, setStatus] = useState<AppStatus>('idle')
  const [answer, setAnswer] = useState<string>('')
  const [lastHotkey, setLastHotkey] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState<boolean>(false)

  // Live Audio & Real-time Conversation State
  const [isListening, setIsListening] = useState<boolean>(true)
  const [autoAnswerEnabled, setAutoAnswerEnabled] = useState<boolean>(() => {
    return getStoredSTTConfig().autoAnswerOnQuestion ?? true
  })
  const [audioVolume, setAudioVolume] = useState<number>(0)
  const [recentTurns, setRecentTurns] = useState<TranscriptTurn[]>([])
  const [interimSpeech, setInterimSpeech] = useState<string>('')
  const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null)
  const [showConversationDrawer, setShowConversationDrawer] = useState<boolean>(false)

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [isDocsOpen, setIsDocsOpen] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Documents
  const [documents, setDocuments] = useState<AttachedDocument[]>(() => getStoredDocuments())
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const answerBoxRef = useRef<HTMLDivElement>(null)
  const transcriberRef = useRef<LiveAudioTranscriber | null>(null)
  // Rolling memory: the last few Q/A pairs, replayed as chat turns so follow-ups make sense.
  const historyRef = useRef<{ q: string; a: string }[]>([])
  const recentTurnsRef = useRef<TranscriptTurn[]>([])
  recentTurnsRef.current = recentTurns
  const lastAutoAnswerTimeRef = useRef<number>(0)

  // Keep refs in sync for callback closures
  const isPausedRef = useRef(isPaused)
  isPausedRef.current = isPaused
  const autoAnswerRef = useRef(autoAnswerEnabled)
  autoAnswerRef.current = autoAnswerEnabled
  const statusRef = useRef(status)
  statusRef.current = status

  const [model, setModel] = useState<string>(getStoredModel)
  const activeConfig = { ...modes[activeMode], model }

  // Models come from the user's key, never hardcoded: refresh on launch and re-read the pick after Settings.
  useEffect(() => {
    if (!isSettingsOpen) setModel(getStoredModel())
  }, [isSettingsOpen])
  useEffect(() => {
    if (getStoredApiKey()) fetchOpenRouterModels().then(() => setModel(getStoredModel())).catch(() => {})
  }, [])

  // Filter docs for current mode
  const activeModeDocs = useMemo(() => {
    return documents.filter((d) => d.mode === 'all' || d.mode === activeMode)
  }, [documents, activeMode])


  // Hover management for click-through
  const handleMouseEnter = useCallback(() => {
    if (window.api) {
      window.api.setIgnoreMouseEvents(false)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (window.api && clickThrough && !isSettingsOpen && !isDocsOpen) {
      window.api.setIgnoreMouseEvents(true, true)
    }
  }, [clickThrough, isSettingsOpen, isDocsOpen])

  const toggleClickThrough = useCallback(() => {
    setClickThrough((prev) => {
      const next = !prev
      if (window.api) {
        window.api.setIgnoreMouseEvents(next, true)
      }
      return next
    })
  }, [])

  const toggleSize = useCallback(async () => {
    if (window.api?.toggleWindowSize) {
      const nextExpanded = await window.api.toggleWindowSize()
      setIsExpanded(nextExpanded)
    }
  }, [])

  // STOP generation immediately (keeps generated tokens intact!)
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setStatus('idle')
    setLastHotkey('Stopped')
  }, [])

  // CLEAR answer completely
  const handleClear = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setAnswer('')
    setErrorMessage(null)
    setStatus('idle')
    setLastHotkey('Cleared')
  }, [])

  const handleCopyAll = useCallback(() => {
    if (!answer) return
    navigator.clipboard.writeText(answer)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }, [answer])

  // ASK: capture screen + interviewer question + attach CV documents + stream response
  const handleAsk = useCallback(
    async (
      customPromptExtension?: string,
      questionOverride?: string,
      turnsOverride?: TranscriptTurn[]
    ) => {
      if (isPausedRef.current && !customPromptExtension && !questionOverride) {
        setErrorMessage('AI is paused. Click Active to resume.')
        return
      }

      const apiKey = getStoredApiKey()
      if (!apiKey) {
        setIsSettingsOpen(true)
        setErrorMessage('Please enter your OpenRouter API Key in Settings to begin.')
        return
      }

      // Stop any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      setStatus('thinking')
      setDetectedQuestion(null)
      setErrorMessage(null)
      if (!turnsOverride) setAnswer('') // auto-answers keep the old answer on screen until a real one starts
      setLastHotkey('Generating')

      try {
        // 1. Capture primary display screenshot
        let screenshotBase64: string | undefined
        // Images are the costliest part of a request: skip them for spoken questions that don't point at the screen.
        const needsScreen = !questionOverride || SCREEN_RE.test(questionOverride)
        try {
          if (needsScreen) screenshotBase64 = await window.api.captureScreen(Math.min(activeConfig.maxScreenshotEdge, 1280))
        } catch (err: any) {
          console.warn('Screen capture error:', err)
        }

        setStatus('streaming')

        // 2. Prepare system prompt enhanced with candidate's uploaded CV / docs
        const docContext = formatDocumentsPromptContext(activeModeDocs)
        const combinedSystemPrompt = `${activeConfig.systemPrompt}
${docContext}
Answer in the first person, concise enough to speak aloud. Ground any claim about the user's background strictly in the documents above; never invent employers, degrees or metrics.${
          turnsOverride
            ? '\nYou are listening live. If the latest speech does not need an answer (small talk, filler, the user talking, a statement with no question or request), reply with exactly NO_ANSWER and nothing else.'
            : ''
        }`

        // 3. Prepare user prompt: only fresh speech, only the question being answered
        const now = Date.now()
        const live = (turnsOverride || recentTurnsRef.current).filter((t) => now - t.timestamp < 120_000)
        const targetQuestion =
          questionOverride || live.slice().reverse().find((t) => t.isQuestion)?.text || ''
        const context = live.filter((t) => !targetQuestion.includes(t.text)).slice(-3)

        let userPrompt = ''
        if (context.length > 0) {
          userPrompt += `RECENT SPEECH (speech-to-text, may contain errors; background only):\n${context.map((t) => t.text).join('\n')}\n\n`
        }
        userPrompt += targetQuestion
          ? `QUESTION TO ANSWER:\n"${targetQuestion}"\n\n`
          : `No question was detected in the last two minutes.\n\n`
        if (screenshotBase64) {
          userPrompt += `A screenshot of the screen is attached. Use it only if the question refers to it.\n\n`
        }
        userPrompt += `Answer only the question above. Use the documents only for facts about the user's own background, and only when relevant; with no documents, never invent personal experience, answer in general terms. If the question is missing or unclear, say so in one line and ask what to answer instead of guessing.`

        if (customPromptExtension) {
          userPrompt += `\nSPECIAL FORMATTING INSTRUCTION: ${customPromptExtension}`
        }

        const gated = !!turnsOverride
        let full = ''
        let released = !gated
        let silent = false
        const remember = (q: string, a: string): void => {
          historyRef.current = [...historyRef.current, { q, a: a.slice(0, 700) }].slice(-4)
        }

        // 4. Stream answer directly from OpenRouter in frontend
        await streamOpenRouterChat({
          apiKey,
          model: activeConfig.model,
          systemPrompt: combinedSystemPrompt,
          userPrompt,
          screenshotBase64,
          history: historyRef.current.flatMap((h) => [
            { role: 'user' as const, content: h.q },
            { role: 'assistant' as const, content: h.a }
          ]),
          onDelta: (token: string) => {
            full += token
            if (gated && !released) {
              const t = full.trim()
              if (t.length < 9 && 'NO_ANSWER'.startsWith(t)) return // might still turn into NO_ANSWER
              if (t.startsWith('NO_ANSWER')) {
                silent = true
                return
              }
              released = true
            }
            if (silent) return
            setAnswer(full)
            if (answerBoxRef.current) {
              answerBoxRef.current.scrollTop = answerBoxRef.current.scrollHeight
            }
          },
          signal: abortController.signal
        })

        if (!silent && full.trim()) remember(targetQuestion || customPromptExtension || 'Answer from the screen', full)

        setStatus('idle')
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          setStatus('idle')
          return
        }
        console.error('Ask error:', e)
        setStatus('error')
        setErrorMessage(e?.message || 'Failed to complete request via OpenRouter')
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
        }
      }
    },
    [activeConfig.model, activeConfig.systemPrompt, activeConfig.maxScreenshotEdge, activeModeDocs]
  )

  const handleAskRef = useRef(handleAsk)
  handleAskRef.current = handleAsk

  // Initialize Live Audio Transcriber and auto-answer loop
  useEffect(() => {
    const transcriber = new LiveAudioTranscriber({
      onTurnTranscribed: (turn) => {
        setRecentTurns((prev) => [...prev.slice(-20), turn])
        if (turn.isQuestion) {
          setDetectedQuestion(turn.text)
        }
      },
      onQuestionDetected: (question, turns) => {
        setDetectedQuestion(question)
        if (autoAnswerRef.current && !isPausedRef.current && statusRef.current === 'idle') {
          const now = Date.now()
          if (now - lastAutoAnswerTimeRef.current > 8000) {
            lastAutoAnswerTimeRef.current = now
            handleAskRef.current(undefined, question, turns)
          }
        }
      },
      onVolumeChange: (vol) => {
        setAudioVolume(vol)
      },
      onInterimText: (interim) => {
        setInterimSpeech(interim)
      }
    })

    transcriberRef.current = transcriber

    if (isListening) {
      transcriber.startListening().catch((err) => {
        console.warn('Live audio capture init warning:', err)
      })
    }

    return () => {
      transcriber.stopListening()
      transcriberRef.current = null
    }
  }, [isListening])

  // One switch: Start = listen + auto-answer on; Pause = mic off, nothing fires.
  const isLive = isListening && autoAnswerEnabled && !isPaused
  const toggleLive = useCallback(() => {
    const next = !(isListening && autoAnswerRef.current && !isPausedRef.current)
    setIsPaused(!next)
    setIsListening(next)
    setAutoAnswerEnabled(next)
    const cfg = getStoredSTTConfig()
    cfg.autoAnswerOnQuestion = next
    saveStoredSTTConfig(cfg)
    if (!next) handleStop()
  }, [isListening, handleStop])

  const handleSelectMode = useCallback((mode: AppMode) => {
    historyRef.current = []
    setActiveMode(mode)
    setStoredActiveMode(mode)
  }, [])

  const handleSaveModes = useCallback((newModes: ModesMap) => {
    setModes(newModes)
    setStoredModes(newModes)
  }, [])

  const refreshDocuments = useCallback(() => {
    setDocuments(getStoredDocuments())
  }, [])

  // Drag and drop files directly onto HUD
  const handleOverlayDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDraggingFile(false)
      const files = e.dataTransfer.files
      if (!files || files.length === 0) return

      try {
        const newDocs: AttachedDocument[] = []
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const text = await parseFileToText(file)
          newDocs.push({
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'text/plain',
            mode: activeMode,
            content: text,
            addedAt: Date.now()
          })
        }
        const updated = [...getStoredDocuments(), ...newDocs]
        saveStoredDocuments(updated)
        refreshDocuments()
        setLastHotkey(`Attached ${newDocs[0].name}`)
      } catch (err) {
        console.error('Failed to parse dropped file onto HUD', err)
      }
    },
    [activeMode, refreshDocuments]
  )

  useEffect(() => {
    if (!window.api) return

    const cleanup = window.api.onHotkey((action: HotkeyAction) => {
      switch (action) {
        case 'ask':
          handleAsk()
          break
        case 'clear':
          handleClear()
          break
        case 'toggle':
          setLastHotkey('Toggle')
          break
        case 'move-up':
        case 'move-down':
        case 'move-left':
        case 'move-right':
          setLastHotkey(`Move (${action.replace('move-', '')})`)
          break
      }
    })

    return cleanup
  }, [handleAsk, handleClear])

  // Keyboard shortcut listener inside window for Esc to Stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && (status === 'thinking' || status === 'streaming')) {
        handleStop()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [status, handleStop])

  const modesList: AppMode[] = ['interview', 'meeting', 'sales', 'custom']

  // Most recent speech line for live conversation feed
  const latestTurn = recentTurns[recentTurns.length - 1]

  return (
    <div
      className={`overlay-container ${!clickThrough ? 'interactive' : ''} ${
        isDraggingFile ? 'file-drag-over' : ''
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDraggingFile(true)
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleOverlayDrop}
    >
      {/* File Drop Visual Feedback */}
      {isDraggingFile && (
        <div className="file-drop-overlay">
          <div className="file-drop-card">
            <div className="file-drop-title">Drop Document to Attach</div>
            <div className="file-drop-subtitle">
              Strictly bounding <b>{activeConfig.name.toUpperCase()}</b> responses to this document
            </div>
          </div>
        </div>
      )}

      {/* Refined Header - Stageshow Restraint */}
      <div className="overlay-header">
        <div className="header-left">
          <div className="app-brand">
            <span
              className={`brand-beacon ${
                status === 'streaming'
                  ? 'beacon-streaming'
                  : status === 'thinking'
                  ? 'beacon-thinking'
                  : isPaused
                  ? 'beacon-paused'
                  : isListening
                  ? 'beacon-listening'
                  : 'beacon-idle'
              }`}
            />
            <span className="brand-name">GHOST</span>
          </div>

          <div className="shield-tag" title="Hidden from screen recording & video calls">
            <Shield size={10} className="shield-icon" />
          </div>

        </div>

        {/* Header Right Action Group */}
        <div className="header-right">
          {/* Document Grounding Pill */}
          <button
            className={`tool-pill ${activeModeDocs.length > 0 ? 'highlight-doc' : ''}`}
            onClick={() => setIsDocsOpen(true)}
            title="Manage candidate documents (CV, notes)"
          >
            <FileText size={11} />
            <span>{activeModeDocs.length > 0 ? `${activeModeDocs.length} CV` : '+ CV'}</span>
          </button>

          {/* Click Through Toggle */}
          <button
            className={`tool-pill ${clickThrough ? 'active-tool' : ''}`}
            onClick={toggleClickThrough}
            title={clickThrough ? 'Pass-through enabled' : 'Clickable mode'}
          >
            <MousePointer2 size={11} />
          </button>

          {/* Settings Button */}
          <button
            className="tool-icon-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Open Settings & Model Catalog"
          >
            <Settings size={12} />
          </button>

          {/* Expand / Minimize Window */}
          <button
            className="tool-icon-btn"
            onClick={toggleSize}
            title={isExpanded ? 'Collapse HUD height' : 'Expand HUD height'}
          >
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>

        </div>
      </div>

      <div className="mode-row">
        {/* Segmented Mode Selector */}
        <div className="segmented-modes-bar">
          {modesList.map((m) => (
            <button
              key={m}
              className={`segmented-mode-btn ${activeMode === m ? 'active' : ''}`}
              onClick={() => handleSelectMode(m)}
            >
              {modes[m].name}
            </button>
          ))}
        </div>

          <button
            className={`live-btn ${isLive ? 'live' : ''}`}
            onClick={toggleLive}
            title={isLive ? 'Listening and answering questions. Click to pause.' : 'Start listening and auto-answering'}
          >
            {isLive ? <Pause size={11} /> : <Play size={11} />}
            <span>{isLive ? 'Pause' : 'Start'}</span>
            {isLive && audioVolume > 5 && (
              <span className="volume-indicator-bar" style={{ width: `${Math.min(14, audioVolume / 4)}px` }} />
            )}
          </button>

          {/* Primary Action Button (Stop or Clear or Ask) */}
          {status === 'thinking' || status === 'streaming' ? (
            <button className="primary-action-btn stop-state" onClick={handleStop} title="Stop generation (Esc)">
              <Square size={10} fill="currentColor" />
              <span>Stop</span>
            </button>
          ) : answer ? (
            <button className="primary-action-btn clear-state" onClick={handleClear} title="Clear overlay (⌘⇧⌫)">
              <Trash2 size={10} />
              <span>Clear</span>
            </button>
          ) : (
            <button className="primary-action-btn ask-state" onClick={() => handleAsk()} title="Capture Screen & Spoken Context (⌘↵)">
              <span>Ask now</span>
            </button>
          )}
      </div>

      {/* Live Conversation Transcript Feed */}
      <div className="live-transcript-feed">
        <div className="transcript-meta-lane">
          <div className="transcript-live-tag">
            <span className={`live-mic-dot ${isListening ? 'active' : ''}`} />
            <span className="live-label">
              {interimSpeech ? 'Speaking' : latestTurn ? latestTurn.speaker : 'Listening'}
            </span>
          </div>

          <div className="transcript-content-text">
            {interimSpeech ? (
              <span className="interim-text">"{interimSpeech}..."</span>
            ) : latestTurn ? (
              <span className={latestTurn.isQuestion ? 'question-text' : 'normal-text'}>
                "{latestTurn.text}"
              </span>
            ) : isListening ? (
              <span className="transcript-empty-hint">
                Listening to conversation... Answers auto-generate when questions are asked.
              </span>
            ) : (
              <span className="transcript-empty-hint">Microphone monitoring paused.</span>
            )}
          </div>

          {detectedQuestion && (
            <div className="question-detected-pill" onClick={() => handleAsk(undefined, detectedQuestion)}>
              <span>Question Detected</span>
            </div>
          )}

          {recentTurns.length > 0 && (
            <button
              className="drawer-toggle-btn"
              onClick={() => setShowConversationDrawer(!showConversationDrawer)}
              title="Toggle transcript history"
            >
              {showConversationDrawer ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              <span>{recentTurns.length} turns</span>
            </button>
          )}
        </div>

        {/* Collapsible Transcript History Drawer */}
        {showConversationDrawer && recentTurns.length > 0 && (
          <div className="transcript-drawer">
            {recentTurns.slice(-8).map((turn) => (
              <div key={turn.id} className={`transcript-drawer-row ${turn.isQuestion ? 'is-question' : ''}`}>
                <span className="drawer-speaker">{turn.speaker}:</span>
                <span className="drawer-text">{turn.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Overlay Body */}
      <div className="overlay-body">
        {/* Status & Model Bar */}
        <div className="status-ribbon">
          <div className="status-info">
            <span
              className={`status-pill-state ${
                status === 'error'
                  ? 'error'
                  : status === 'streaming'
                  ? 'streaming'
                  : status === 'thinking'
                  ? 'thinking'
                  : isPaused
                  ? 'paused'
                  : 'ready'
              }`}
            >
              {status === 'thinking'
                ? 'Snapping screen & synthesizing...'
                : status === 'streaming'
                ? 'Streaming answer...'
                : status === 'error'
                ? 'Provider Error'
                : isPaused
                ? 'Paused'
                : 'Ready'}
            </span>
          </div>

          <div className="status-actions">
            {activeModeDocs.length > 0 ? (
              <span
                className="cv-grounded-pill"
                onClick={() => setIsDocsOpen(true)}
                title={activeModeDocs.map((d) => d.name).join(', ')}
              >
                <Check size={10} />
                <span>Strictly Bounded: {activeModeDocs[0].name}</span>
              </span>
            ) : (
              <span className="cv-unattached-pill" onClick={() => setIsDocsOpen(true)}>
                <span>No CV Attached (Drop here)</span>
              </span>
            )}

            <button
              className="model-tag-pill"
              onClick={() => setIsSettingsOpen(true)}
              title={`Active Model: ${activeConfig.model}. Click to swap.`}
            >
              <span>{activeConfig.model.split('/').pop() || activeConfig.model}</span>
              <span className="arrow-down">▾</span>
            </button>

            {answer && (
              <button
                className="copy-answer-pill"
                onClick={handleCopyAll}
                title="Copy entire answer to clipboard"
              >
                {copiedAll ? <Check size={11} /> : <Copy size={11} />}
                <span>{copiedAll ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Box */}
        <div className="content-box" ref={answerBoxRef}>
          {errorMessage && (
            <div className="error-banner">
              <div className="error-text">{errorMessage}</div>
              <button
                className="inline-settings-btn"
                onClick={() => setIsSettingsOpen(true)}
              >
                Change Model
              </button>
            </div>
          )}

          {answer ? (
            <FormattedAnswer content={answer} isStreaming={status === 'streaming'} />
          ) : (
            !errorMessage && (
              <div className="welcome-placeholder">
                <div className="placeholder-headline">
                  <span>Listening to interview audio & observing screen.</span>
                </div>
                <div className="placeholder-feature-grid">
                  <div className="feature-item">
                    <div className="feature-title">Real-time Audio Alignment</div>
                    <div className="feature-desc">
                      Automatically detects when the interviewer asks a question and generates an immediate response.
                    </div>
                  </div>
                  <div className="feature-item">
                    <div className="feature-title">Strict Document Grounding</div>
                    <div className="feature-desc">
                      {activeModeDocs.length > 0
                        ? `Bounded by ${activeModeDocs[0].name}. Personal answers stay 100% faithful to your resume.`
                        : 'Drop your CV or prep notes here to enforce strict resume boundaries.'}
                    </div>
                  </div>
                  <div className="feature-item">
                    <div className="feature-title">Invisible & Secure</div>
                    <div className="feature-desc">
                      Protected from screen shares, recording software, and window captures.
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Typed follow-up on the current answer */}
        {answer && status !== 'thinking' && status !== 'streaming' && (
          <input
            className="followup-input"
            placeholder="Follow-up… (Enter)"
            onKeyDown={(e) => {
              const text = e.currentTarget.value.trim()
              if (e.key !== 'Enter' || !text) return
              e.currentTarget.value = ''
              handleAsk(`The user is asking a follow-up about your previous answer. Previous answer:\n${answer.slice(0, 1500)}`, text)
            }}
          />
        )}

        {/* Quick Interview Format Chips */}
        {activeMode === 'interview' && (
          <div className="interview-quick-bar">
            <span className="quick-label">Format:</span>
            <button
              className="quick-chip"
              onClick={() => handleAsk('Provide only the direct 1-2 sentence core answer first.')}
            >
              Direct Answer
            </button>
            <button
              className="quick-chip"
              onClick={() =>
                handleAsk('Format response as a concise STAR story using candidate CV metrics.')
              }
            >
              STAR Story
            </button>
            <button
              className="quick-chip"
              onClick={() =>
                handleAsk('Provide optimal clean code with Time/Space complexity and edge cases.')
              }
            >
              Code & Complexity
            </button>
            <button
              className="quick-chip"
              onClick={() =>
                handleAsk('Provide 2 natural, high-confidence talking points to say to the interviewer.')
              }
            >
              Talking Points
            </button>
          </div>
        )}
      </div>

      {/* Overlay Footer */}
      <div className="overlay-footer">
        <div className="shortcut-group">
          <div className="shortcut-item" onClick={() => handleAsk()} style={{ cursor: 'pointer' }}>
            <span className="kbd">⌘↵</span>
            <span>Ask Screen & Audio</span>
          </div>
          {status === 'streaming' || status === 'thinking' ? (
            <div className="shortcut-item stop-item" onClick={handleStop} style={{ cursor: 'pointer' }}>
              <span className="kbd stop">Esc</span>
              <span className="stop-text">Stop</span>
            </div>
          ) : (
            <div className="shortcut-item" onClick={handleClear} style={{ cursor: 'pointer' }}>
              <span className="kbd">⌘⇧⌫</span>
              <span>Clear</span>
            </div>
          )}
          <div className="shortcut-item" onClick={() => setIsDocsOpen(true)} style={{ cursor: 'pointer' }}>
            <span className="kbd">CV</span>
            <span>Documents</span>
          </div>
          <div className="shortcut-item">
            <span className="kbd">⌘↑↓←→</span>
            <span>Move</span>
          </div>
        </div>
        {lastHotkey && <div className="last-hotkey-badge">{lastHotkey}</div>}
      </div>

      {/* Settings & Model Catalog Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        modes={modes}
        onSaveModes={handleSaveModes}
        activeMode={activeMode}
      />

      {/* CV & Documents Modal */}
      <DocumentsModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
        activeMode={activeMode}
        onDocumentsUpdated={refreshDocuments}
      />
    </div>
  )
}

export default App
