import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Square,
  Play,
  Pause,
  Settings,
  FileText,
  Target,
  Copy,
  Check,
  Maximize2, MousePointer2,
  Minimize2,
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
  summarizeDocument,
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
import { BriefModal } from './components/BriefModal'
import { Brief, getStoredBrief, formatBriefPromptContext, hasBrief } from './services/brief'

const SCREEN_RE = /\b(screen|this|here|code|problem|diagram|slide|see|shown|following|below|above|function|error|bug|chart|table)\b/i

export const App: React.FC = () => {
  const [clickThrough, setClickThrough] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [modes, setModes] = useState<ModesMap>(getStoredModes)
  const [activeMode, setActiveMode] = useState<AppMode>(getStoredActiveMode)
  const [status, setStatus] = useState<AppStatus>('idle')
  // The conversation survives pausing, mode switches and restarts; only Clear wipes it.
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('ghost_conversation') || '{}')
    } catch {
      return {}
    }
  }, [])
  const [answer, setAnswer] = useState<string>(saved.answer || '')
  // Earlier answers stay above the newest one, chat-style.
  const [thread, setThread] = useState<{ id: number; q: string; a: string }[]>(saved.thread || [])
  const [currentQ, setCurrentQ] = useState<string>(saved.currentQ || '')
  const answerRef = useRef('')
  answerRef.current = answer
  const currentQRef = useRef('')
  currentQRef.current = currentQ
  const [, setLastHotkey] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState<boolean>(false)

  // Live Audio & Real-time Conversation State
  const [isListening, setIsListening] = useState<boolean>(true)
  const [autoAnswerEnabled, setAutoAnswerEnabled] = useState<boolean>(() => {
    return getStoredSTTConfig().autoAnswerOnQuestion ?? true
  })
  const [audioVolume, setAudioVolume] = useState<number>(0)
  const [recentTurns, setRecentTurns] = useState<TranscriptTurn[]>([])
  const [interimSpeech, setInterimSpeech] = useState<string>('')
  const [, setDetectedQuestion] = useState<string | null>(null)
  const [showConversationDrawer, setShowConversationDrawer] = useState<boolean>(false)

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [isDocsOpen, setIsDocsOpen] = useState<boolean>(false)
  const [isBriefOpen, setIsBriefOpen] = useState<boolean>(false)
  const [brief, setBrief] = useState<Brief>(getStoredBrief)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Documents
  const [documents, setDocuments] = useState<AttachedDocument[]>(() => getStoredDocuments())
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const answerBoxRef = useRef<HTMLDivElement>(null)
  const transcriberRef = useRef<LiveAudioTranscriber | null>(null)
  // Rolling memory: the last few Q/A pairs, replayed as chat turns so follow-ups make sense.
  const historyRef = useRef<{ q: string; a: string }[]>(
    (saved.thread || []).filter((t: any) => t.q).slice(-3).map((t: any) => ({ q: t.q, a: t.a.slice(0, 400) }))
  )
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
    if (!getStoredApiKey()) return
    fetchOpenRouterModels()
      .then(async () => {
        setModel(getStoredModel())
        // Condense any document that was added before a key/model existed.
        const docs = getStoredDocuments()
        let changed = false
        for (const d of docs) {
          if (!d.summary && d.active !== false && d.content.length > 400) {
            d.summary = await summarizeDocument(d.content)
            changed = changed || !!d.summary
          }
        }
        if (changed) {
          saveStoredDocuments(docs)
          setDocuments(docs)
        }
      })
      .catch(() => {})
  }, [])

  // Filter docs for current mode
  const activeModeDocs = useMemo(() => {
    return documents.filter((d) => d.active !== false) // a CV applies to every mode; several can be stored
  }, [documents])


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
    setCurrentQ('')
    setThread([])
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

  // Move the visible answer into the thread so the next one appears below it.
  const archiveAnswer = useCallback(() => {
    const a = answerRef.current
    if (!a.trim()) return
    const item = { id: Date.now(), q: currentQRef.current, a }
    setThread((prev) => [...prev, item].slice(-20))
    setAnswer('')
  }, [])

  // ASK: capture screen + interviewer question + attach CV documents + stream response
  const handleAsk = useCallback(
    async (
      customPromptExtension?: string,
      questionOverride?: string,
      turnsOverride?: TranscriptTurn[]
    ) => {

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
      if (!turnsOverride) archiveAnswer() // auto-answers leave the old answer in place until a real one starts
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
        const gated = !!turnsOverride
        // Kept identical between requests (and free of per-request text) so provider prompt caching applies.
        const combinedSystemPrompt = `${activeConfig.systemPrompt}${formatBriefPromptContext(getStoredBrief(), activeMode)}${docContext}`

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
        userPrompt += `Answer only the question above, concise enough to say aloud. Use the documents only where they genuinely fit. If the question is missing or unclear, say so in one line instead of guessing.`
        if (gated) {
          userPrompt += `\nYou are listening live: if the latest speech needs no answer (small talk, filler, the user talking, a statement with no question or request), reply with exactly NO_ANSWER.`
        }

        if (customPromptExtension) {
          userPrompt += `\nSPECIAL FORMATTING INSTRUCTION: ${customPromptExtension}`
        }

        if (!gated) setCurrentQ(targetQuestion)
        let full = ''
        let released = !gated
        let silent = false
        const remember = (q: string, a: string): void => {
          historyRef.current = [...historyRef.current, { q, a: a.slice(0, 400) }].slice(-3)
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
              archiveAnswer()
              setCurrentQ(targetQuestion)
            }
            if (silent) return
            setAnswer(full)
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
    [activeConfig.model, activeConfig.systemPrompt, activeConfig.maxScreenshotEdge, activeModeDocs, archiveAnswer, activeMode]
  )

  // A new answer starts at the top of the view, so the first words are readable while it streams.
  useEffect(() => {
    answerBoxRef.current?.querySelector('.thread-item.current')?.scrollIntoView({ block: 'start' })
  }, [thread.length, currentQ, answer === ''])

  useEffect(() => {
    if (status === 'streaming' || status === 'thinking') return
    localStorage.setItem('ghost_conversation', JSON.stringify({ thread, answer, currentQ }))
  }, [thread, answer, currentQ, status])

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
      onError: (message) => setErrorMessage(message),
      onInterimText: (interim) => {
        setInterimSpeech(interim)
      }
    })

    transcriberRef.current = transcriber

    if (isListening) {
      transcriber.startListening().catch((err) => {
        setErrorMessage(err?.message || 'Could not start audio capture')
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
            mode: 'all',
            content: text,
            summary: await summarizeDocument(text),
            addedAt: Date.now()
          })
        }
        const updated = [...getStoredDocuments(), ...newDocs]
        saveStoredDocuments(updated)
        refreshDocuments()
        setLastHotkey(`Attached ${newDocs[0].name}`)
      } catch (err) {
        console.error('Failed to parse dropped file onto HUD', err)
        setErrorMessage((err as Error)?.message || 'Could not read that file')
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

            <button
              className="model-tag-pill"
              onClick={() => setIsSettingsOpen(true)}
              title={`Active Model: ${activeConfig.model}. Click to swap.`}
            >
              <span>{activeConfig.model.split('/').pop() || activeConfig.model}</span>
              
            </button>
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
                ? 'Thinking'
                : status === 'streaming'
                ? 'Answering'
                : status === 'error'
                ? 'Error'
                : isPaused
                ? 'Paused'
                : ''}
            </span>


        </div>

        {/* Header Right Action Group */}
        <div className="header-right">
          {answer && (
            <button className="tool-icon-btn" onClick={handleCopyAll} title="Copy answer">
              {copiedAll ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}

          {/* Document Grounding Pill */}
          <button
            className={`tool-pill ${activeModeDocs.length > 0 ? 'highlight-doc' : ''}`}
            onClick={() => setIsDocsOpen(true)}
            title="Manage candidate documents (CV, notes)"
          >
            <FileText size={11} />
            <span>{activeModeDocs.length > 0 ? `${activeModeDocs.length} CV` : '+ CV'}</span>
          </button>

          <button
            className={`tool-pill ${hasBrief(brief) ? 'highlight-doc' : ''}`}
            onClick={() => setIsBriefOpen(true)}
            title={hasBrief(brief) ? `Target: ${[brief.role, brief.company].filter(Boolean).join(' at ') || 'notes set'}` : 'Set target role and company (optional)'}
          >
            <Target size={12} />
            {hasBrief(brief) && <span>{brief.role || brief.company || 'Target'}</span>}
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
          ) : answer || thread.length > 0 ? (
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
      {(interimSpeech || (latestTurn && !(answer && latestTurn.text === currentQ))) && (
      <div className="live-transcript-feed">
        <div className="transcript-meta-lane">
          <div className="transcript-live-tag">
            <span className="live-label">{latestTurn && !interimSpeech ? latestTurn.speaker : 'Heard'}</span>
          </div>

          <div className="transcript-content-text">
            {interimSpeech ? (
              <span className="interim-text">Transcribing…</span>
            ) : latestTurn ? (
              <span className={latestTurn.isQuestion ? 'question-text' : 'normal-text'}>
                "{latestTurn.text}"
              </span>
            ) : (
              <span className="transcript-empty-hint">{isListening ? '...' : 'Mic off'}</span>
            )}
          </div>

          {recentTurns.length > 0 && (
            <button
              className="drawer-toggle-btn"
              onClick={() => setShowConversationDrawer(!showConversationDrawer)}
              title="Toggle transcript history"
            >
              {showConversationDrawer ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              <span>{recentTurns.length}</span>
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

      )}

      {/* Overlay Body */}
      <div className="overlay-body">
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

          {thread.map((item) => (
            <div key={item.id} className="thread-item">
              {item.q && <div className="thread-q">{item.q}</div>}
              <FormattedAnswer content={item.a} isStreaming={false} />
            </div>
          ))}
          {answer ? (
            <div className="thread-item current">
              {currentQ && <div className="thread-q">{currentQ}</div>}
              <FormattedAnswer content={answer} isStreaming={status === 'streaming'} />
            </div>
          ) : (
            !errorMessage &&
            thread.length === 0 && <div className="empty-hint">{isLive ? 'Listening' : 'Paused'}</div>
          )}
        </div>

        {/* Typed question / follow-up: always available, even while paused */}
        {(
          <input
            className="followup-input"
            placeholder={answer || thread.length ? 'Follow-up… (Enter)' : 'Type a question… (Enter)'}
            onKeyDown={(e) => {
              const text = e.currentTarget.value.trim()
              if (e.key !== 'Enter' || !text) return
              e.currentTarget.value = ''
              handleAsk('This was typed by the user. Use the earlier conversation for context.', text)
            }}
          />
        )}

        {/* Quick Interview Format Chips */}
        {activeMode === 'interview' && (answer || thread.length > 0) && status === 'idle' && (
          <div className="interview-quick-bar">
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

      {/* Settings & Model Catalog Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        modes={modes}
        onSaveModes={handleSaveModes}
        activeMode={activeMode}
      />

      <BriefModal isOpen={isBriefOpen} onClose={() => setIsBriefOpen(false)} onSaved={setBrief} />

      {/* CV & Documents Modal */}
      <DocumentsModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
        onDocumentsUpdated={refreshDocuments}
      />
    </div>
  )
}

export default App
