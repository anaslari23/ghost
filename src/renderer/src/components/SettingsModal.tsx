import React, { useState, useEffect, useMemo } from 'react'
import { AppMode, ModesMap } from '../../../shared/types'
import {
  OpenRouterModel,
  fetchOpenRouterModels,
  getStoredApiKey,
  setStoredApiKey,
  getCachedModels,
  getStoredModel,
  setStoredModel
} from '../services/openrouter'
import {
  STTConfig,
  getStoredSTTConfig,
  saveStoredSTTConfig,
  DEFAULT_STT_CONFIG
} from '../services/transcription'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  modes: ModesMap
  onSaveModes: (modes: ModesMap) => void
  activeMode: AppMode
}

type SettingsTab = 'models' | 'audio'
type ModelCategory = 'all' | 'free'

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  modes,
  onSaveModes,
  activeMode
}) => {
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('models')

  // LLM Config
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  const [models, setModels] = useState<OpenRouterModel[]>(getCachedModels)
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const [selectedModeTab, setSelectedModeTab] = useState<AppMode>(activeMode)
  const [currentModes, setCurrentModes] = useState<ModesMap>(modes)

  // Filters
  const [category, setCategory] = useState<ModelCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState(getStoredModel)

  // STT / Auto-Answer Config
  const [sttConfig, setSttConfig] = useState<STTConfig>(DEFAULT_STT_CONFIG)
  const [sttSaved, setSttSaved] = useState(false)

  const loadModels = async (keyToUse?: string): Promise<void> => {
    setLoadingModels(true)
    setModelsError(null)
    try {
      const list = await fetchOpenRouterModels(keyToUse ?? apiKey)
      setModels(list)
      setSelectedModel(getStoredModel())
    } catch (e: any) {
      setModelsError(e?.message || 'Failed to load OpenRouter models')
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      const storedKey = getStoredApiKey()
      setApiKey(storedKey)
      setCurrentModes(modes)
      setSelectedModeTab(activeMode)
      setSttConfig(getStoredSTTConfig())
      loadModels(storedKey)
    }
  }, [isOpen, activeMode, modes])

  const handleSaveApiKey = (): void => {
    setStoredApiKey(apiKey)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
    loadModels(apiKey)
  }

  const handleSaveSTT = (): void => {
    saveStoredSTTConfig(sttConfig)
    setSttSaved(true)
    setTimeout(() => setSttSaved(false), 2000)
  }

  const handleUpdatePrompt = (prompt: string): void => {
    setCurrentModes((prev) => ({
      ...prev,
      [selectedModeTab]: {
        ...prev[selectedModeTab],
        systemPrompt: prompt
      }
    }))
  }

  const handleSelectModel = (modelId: string): void => {
    setSelectedModel(modelId)
    setStoredModel(modelId)
  }

  const handleSaveAll = (): void => {
    setStoredApiKey(apiKey)
    saveStoredSTTConfig(sttConfig)
    onSaveModes(currentModes)
    onClose()
  }

  const filteredModels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return models.filter(
      (m) =>
        (category !== 'free' || m.isFree) &&
        (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    )
  }, [models, category, searchQuery])

  if (!isOpen) return null

  const activeModeConfig = currentModes[selectedModeTab]

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="settings-header">
          <div className="settings-title">
            <span>Settings</span>
            <div className="settings-top-tabs">
              <button
                className={`top-tab-btn ${activeSettingsTab === 'models' ? 'active' : ''}`}
                onClick={() => setActiveSettingsTab('models')}
              >
                Model & Modes
              </button>
              <button
                className={`top-tab-btn ${activeSettingsTab === 'audio' ? 'active' : ''}`}
                onClick={() => setActiveSettingsTab('audio')}
              >
                Live Audio & Auto-Answer
              </button>
            </div>
          </div>
          <button className="settings-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-body">
          {activeSettingsTab === 'models' ? (
            <>
              {/* Section 1: API Key */}
              <div className="settings-section">
                <label className="section-label">OpenRouter API Key</label>
                <div className="api-key-row">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="input-field"
                    placeholder="sk-or-v1-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    className="secondary-btn"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                  <button className="primary-btn" onClick={handleSaveApiKey}>
                    {keySaved ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
                <div className="hint-text">
                  {models.length > 0 ? (
                    <span>
                      ✓ <b>{models.length} models</b> can read your screen and answer. One is used for every mode.
                    </span>
                  ) : (
                    <span>Add your key to load the models available to you.</span>
                  )}
                </div>
              </div>

              {/* Section 2: Model (one for all modes) */}
              <div className="settings-section">
                <div className="model-picker-container">
                  <div className="model-picker-header">
                    <span className="field-label">
                      Model{selectedModel ? `: ${selectedModel}` : ''} ({filteredModels.length} of {models.length})
                    </span>
                    <button
                      className="secondary-btn small"
                      onClick={() => loadModels(apiKey)}
                      disabled={loadingModels}
                    >
                      {loadingModels ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>

                  <div className="category-pills-row">
                    <button
                      className={`cat-pill ${category === 'all' ? 'active' : ''}`}
                      onClick={() => setCategory('all')}
                    >
                      All
                    </button>
                    <button
                      className={`cat-pill ${category === 'free' ? 'active' : ''}`}
                      onClick={() => setCategory('free')}
                    >
                      Free
                    </button>
                  </div>

                  <div className="search-bar-row">
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Search models..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                        ✕
                      </button>
                    )}
                  </div>

                  {modelsError && <div className="error-box">{modelsError}</div>}

                  <div className="models-scroll-list">
                    {loadingModels ? (
                      <div className="empty-message">Fetching models from OpenRouter...</div>
                    ) : models.length === 0 ? (
                      <div className="empty-message">Save your OpenRouter key to load models.</div>
                    ) : filteredModels.length === 0 ? (
                      <div className="empty-message">No models match.</div>
                    ) : (
                      filteredModels.slice(0, 100).map((m) => {
                        const isSelected = selectedModel === m.id
                        return (
                          <div
                            key={m.id}
                            className={`model-item-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelectModel(m.id)}
                          >
                            <div className="model-info-left">
                              <div className="model-title-row">
                                <span className="model-item-name">{m.name}</span>
                                <span className="model-item-id">{m.id}</span>
                              </div>
                              <div className="model-badges-row">
                                {m.isFree && <span className="badge-free">FREE</span>}
                                <span className="badge-pricing">
                                  {m.isFree
                                    ? '$0.00'
                                    : `$${m.promptPricePerMillion.toFixed(2)} in / $${m.completionPricePerMillion.toFixed(2)} out`}
                                </span>
                                {m.contextLength > 0 && (
                                  <span className="badge-context">{Math.round(m.contextLength / 1000)}k ctx</span>
                                )}
                              </div>
                            </div>
                            <button className={`select-model-btn ${isSelected ? 'active' : ''}`}>
                              {isSelected ? 'Active ✓' : 'Select'}
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Section 3: Per-mode instructions */}
              <div className="settings-section">
                <div className="modes-tab-bar">
                  {(['interview', 'meeting', 'sales', 'custom'] as AppMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`mode-tab-btn ${selectedModeTab === mode ? 'active' : ''}`}
                      onClick={() => setSelectedModeTab(mode)}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="mode-config-box">
                  <div className="field-group">
                    <label className="field-label">System Directive</label>
                    <textarea
                      className="textarea-field"
                      rows={4}
                      value={activeModeConfig.systemPrompt}
                      onChange={(e) => handleUpdatePrompt(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ==================== AUDIO & AUTO-ANSWER SETTINGS ==================== */
            <div className="settings-section">
              <label className="section-label">Live Speech Transcription & Auto-Trigger</label>
              <div className="audio-settings-box">
                <div className="setting-toggle-row">
                  <div>
                    <div className="setting-title">Auto-Generate Answers on Questions</div>
                    <div className="setting-desc">
                      Automatically snaps the screen, aligns with the interviewer's words, and streams the answer when a question is detected.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-checkbox"
                    checked={sttConfig.autoAnswerOnQuestion}
                    onChange={(e) =>
                      setSttConfig((prev) => ({
                        ...prev,
                        autoAnswerOnQuestion: e.target.checked
                      }))
                    }
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Speech-to-Text Engine</label>
                  <div className="modes-tab-bar mini">
                    <button
                      className={`mode-tab-btn ${sttConfig.provider === 'openrouter' ? 'active' : ''}`}
                      onClick={() => setSttConfig((prev) => ({ ...prev, provider: 'openrouter' }))}
                    >
                      OpenRouter (no extra key)
                    </button>
                    <button
                      className={`mode-tab-btn ${sttConfig.provider === 'groq' ? 'active' : ''}`}
                      onClick={() => setSttConfig((prev) => ({ ...prev, provider: 'groq' }))}
                    >
                      Groq Whisper (Fastest, Free)
                    </button>
                    <button
                      className={`mode-tab-btn ${sttConfig.provider === 'openai' ? 'active' : ''}`}
                      onClick={() => setSttConfig((prev) => ({ ...prev, provider: 'openai' }))}
                    >
                      OpenAI Whisper
                    </button>
                    <button
                      className={`mode-tab-btn ${sttConfig.provider === 'local' ? 'active' : ''}`}
                      onClick={() => setSttConfig((prev) => ({ ...prev, provider: 'local' }))}
                    >
                      Local Sidecar
                    </button>
                  </div>
                </div>

                {sttConfig.provider === 'openrouter' && (
                  <div className="field-group">
                    <span className="hint-text">
                      Uses an audio-capable model from your OpenRouter account, so no extra key. Groq is faster and free if you want lower latency.
                    </span>
                  </div>
                )}

                {sttConfig.provider === 'groq' && (
                  <div className="field-group">
                    <label className="field-label">Groq API Key (whisper-large-v3-turbo)</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="gsk_..."
                      value={sttConfig.groqApiKey || ''}
                      onChange={(e) =>
                        setSttConfig((prev) => ({ ...prev, groqApiKey: e.target.value }))
                      }
                    />
                    <span className="hint-text">
                      Free tier available at console.groq.com. Transcribes meeting audio in ~250ms.
                    </span>
                  </div>
                )}

                {sttConfig.provider === 'openai' && (
                  <div className="field-group">
                    <label className="field-label">OpenAI API Key (whisper-1)</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="sk-..."
                      value={sttConfig.openaiApiKey || ''}
                      onChange={(e) =>
                        setSttConfig((prev) => ({ ...prev, openaiApiKey: e.target.value }))
                      }
                    />
                  </div>
                )}

                {sttConfig.provider === 'local' && (
                  <div className="field-group">
                    <label className="field-label">Local Sidecar Endpoint</label>
                    <input
                      type="text"
                      className="input-field mono"
                      value={sttConfig.localEndpoint || 'http://127.0.0.1:8178/inference'}
                      onChange={(e) =>
                        setSttConfig((prev) => ({ ...prev, localEndpoint: e.target.value }))
                      }
                    />
                  </div>
                )}

                <div className="field-group">
                  <label className="field-label">Question Pause Silence Detection</label>
                  <div className="silence-slider-row">
                    <input
                      type="range"
                      min={600}
                      max={2500}
                      step={100}
                      value={sttConfig.minSilenceMs || 1200}
                      onChange={(e) =>
                        setSttConfig((prev) => ({ ...prev, minSilenceMs: Number(e.target.value) }))
                      }
                    />
                    <span className="silence-val-label">{sttConfig.minSilenceMs || 1200} ms</span>
                  </div>
                  <span className="hint-text">
                    Time after the interviewer finishes speaking before Auto-Answer triggers.
                  </span>
                </div>

                <div className="save-row">
                  <button className="primary-btn" onClick={handleSaveSTT}>
                    {sttSaved ? 'STT Saved ✓' : 'Save Audio Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="settings-footer">
          <button className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" onClick={handleSaveAll}>
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  )
}
