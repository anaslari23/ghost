export interface TranscriptTurn {
  id: string
  speaker: 'Interviewer' | 'Candidate'
  text: string
  timestamp: number
  isQuestion?: boolean
}

export type STTProvider = 'browser' | 'groq' | 'openai' | 'local'

export interface STTConfig {
  provider: STTProvider
  groqApiKey?: string
  openaiApiKey?: string
  localEndpoint?: string
  autoAnswerOnQuestion: boolean
  minSilenceMs: number
  audioDeviceId?: string
}

const STORAGE_KEY_STT = 'ghost_stt_config'

export const DEFAULT_STT_CONFIG: STTConfig = {
  provider: 'browser',
  groqApiKey: '',
  openaiApiKey: '',
  localEndpoint: 'http://127.0.0.1:8178/inference',
  autoAnswerOnQuestion: true,
  minSilenceMs: 1200
}

export function getStoredSTTConfig(): STTConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STT)
    if (raw) {
      return { ...DEFAULT_STT_CONFIG, ...JSON.parse(raw) }
    }
  } catch {}
  return DEFAULT_STT_CONFIG
}

export function saveStoredSTTConfig(config: STTConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_STT, JSON.stringify(config))
  } catch {}
}

// Question & Interview Intent Heuristics
export function isLikelyQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 5) return false

  if (trimmed.endsWith('?')) return true

  const lower = trimmed.toLowerCase()
  const questionStarters = [
    'how ',
    'how would',
    'how do you',
    'how did you',
    'how do we',
    'how does',
    'what ',
    'what is',
    'what are',
    'what was',
    'what would',
    'what do you think',
    'why ',
    'why did',
    'why would',
    'can you',
    'could you',
    'would you',
    'tell me about',
    'walk me through',
    'give me an example',
    'explain ',
    'describe ',
    'have you ever',
    'what was your',
    'write a',
    'implement ',
    'optimize ',
    'design a',
    'solve ',
    'do you know',
    'suppose ',
    'imagine ',
    'assume ',
    'which one would',
    'difference between',
    'trade-off',
    'pros and cons',
    'time complexity',
    'space complexity'
  ]

  return questionStarters.some((prefix) => lower.includes(prefix))
}

export class LiveAudioTranscriber {
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaRecorder: MediaRecorder | null = null
  private recordedChunks: Blob[] = []
  private speechRecognition: any = null

  private isListening = false
  private isSpeaking = false
  private silenceTimer: any = null
  private volumeCheckInterval: any = null

  private onTurnTranscribed: (turn: TranscriptTurn) => void
  private onQuestionDetected: (question: string, recentTurns: TranscriptTurn[]) => void
  private onVolumeChange: (volumeLevel: number) => void
  private onInterimText?: (interim: string) => void

  private rollingTurns: TranscriptTurn[] = []

  constructor(callbacks: {
    onTurnTranscribed: (turn: TranscriptTurn) => void
    onQuestionDetected: (question: string, recentTurns: TranscriptTurn[]) => void
    onVolumeChange: (volumeLevel: number) => void
    onInterimText?: (interim: string) => void
  }) {
    this.onTurnTranscribed = callbacks.onTurnTranscribed
    this.onQuestionDetected = callbacks.onQuestionDetected
    this.onVolumeChange = callbacks.onVolumeChange
    this.onInterimText = callbacks.onInterimText
  }

  public async startListening(): Promise<void> {
    if (this.isListening) return

    const config = getStoredSTTConfig()

    try {
      // 1. If using Web Speech API in browser/Electron
      if (
        config.provider === 'browser' &&
        typeof ((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition) !==
          'undefined'
      ) {
        this.setupBrowserRecognition()
      }

      // 2. Setup Audio Stream for VAD analysis and Whisper fallback
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
      if (config.audioDeviceId) {
        audioConstraints.deviceId = { exact: config.audioDeviceId }
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      })

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 512
      source.connect(this.analyser)

      this.isListening = true

      // If not browser recognition, run VAD + MediaRecorder loop for Groq/OpenAI
      if (config.provider !== 'browser') {
        this.setupRecorder()
      }
      this.startVADLoop()
    } catch (err) {
      console.error('Failed to initialize audio capture:', err)
      throw new Error(
        'Could not access audio stream. Please grant Microphone permissions in macOS System Settings.'
      )
    }
  }

  public stopListening(): void {
    this.isListening = false

    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop()
      } catch {}
      this.speechRecognition = null
    }

    if (this.volumeCheckInterval) {
      clearInterval(this.volumeCheckInterval)
      this.volumeCheckInterval = null
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch {}
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  private setupBrowserRecognition(): void {
    const SpeechClass =
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SpeechClass) return

    try {
      this.speechRecognition = new SpeechClass()
      this.speechRecognition.continuous = true
      this.speechRecognition.interimResults = true
      this.speechRecognition.lang = 'en-US'

      this.speechRecognition.onresult = (event: any) => {
        let interimText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i]
          const transcript = res[0].transcript
          if (res.isFinal) {
            const cleanText = transcript.trim()
            if (cleanText.length > 2) {
              this.handleFinalTranscript(cleanText)
            }
          } else {
            interimText += transcript
          }
        }
        if (interimText && this.onInterimText) {
          this.onInterimText(interimText.trim())
        }
      }

      this.speechRecognition.onerror = (e: any) => {
        console.warn('SpeechRecognition error:', e.error)
        // If network error in electron offline, can fallback to Groq if key exists
        if (e.error === 'network') {
          console.log('Web speech network unavailable, fallback to Groq/VAD')
        }
      }

      this.speechRecognition.onend = () => {
        // Auto restart if still listening
        if (this.isListening) {
          try {
            this.speechRecognition.start()
          } catch {}
        }
      }

      this.speechRecognition.start()
    } catch (e) {
      console.warn('Could not start webkitSpeechRecognition:', e)
    }
  }

  private setupRecorder(): void {
    if (!this.mediaStream) return

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      })

      this.recordedChunks = []
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data)
        }
      }

      this.mediaRecorder.onstop = async () => {
        if (this.recordedChunks.length === 0) return
        const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' })
        this.recordedChunks = []

        // Transcribe speech chunk
        await this.processSpeechAudio(audioBlob)
      }
    } catch (e) {
      console.warn('MediaRecorder setup error:', e)
    }
  }

  private startVADLoop(): void {
    const dataArray = new Uint8Array(this.analyser?.frequencyBinCount || 256)
    const SPEECH_THRESHOLD = 16 // RMS volume threshold
    const config = getStoredSTTConfig()

    this.volumeCheckInterval = setInterval(() => {
      if (!this.analyser || !this.isListening) return

      this.analyser.getByteFrequencyData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i]
      }
      const avgVolume = sum / dataArray.length
      this.onVolumeChange(Math.min(100, Math.round(avgVolume * 2)))

      if (config.provider === 'browser') {
        // Handled by webkitSpeechRecognition
        return
      }

      if (avgVolume > SPEECH_THRESHOLD) {
        // Speech detected
        if (!this.isSpeaking) {
          this.isSpeaking = true
          if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            this.recordedChunks = []
            this.mediaRecorder.start(250)
          }
        }

        // Reset silence countdown timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer)
          this.silenceTimer = null
        }
      } else if (this.isSpeaking && !this.silenceTimer) {
        // Speaker paused: start silence timer
        this.silenceTimer = setTimeout(() => {
          this.isSpeaking = false
          this.silenceTimer = null

          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop()
          }
        }, config.minSilenceMs || 1200)
      }
    }, 100)
  }

  private handleFinalTranscript(cleanText: string): void {
    // Ignore common low-energy hallucinations
    const junkStrings = ['thank you', 'thanks for watching', 'you', 'subscribe', 'bye', 'amara.org']
    if (junkStrings.includes(cleanText.toLowerCase().replace(/[.,!]/g, ''))) {
      return
    }

    const config = getStoredSTTConfig()
    const isQuestion = isLikelyQuestion(cleanText)

    const turn: TranscriptTurn = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      speaker: 'Interviewer',
      text: cleanText,
      timestamp: Date.now(),
      isQuestion
    }

    this.rollingTurns.push(turn)
    if (this.rollingTurns.length > 25) {
      this.rollingTurns.shift()
    }

    this.onTurnTranscribed(turn)

    // Clear interim text
    if (this.onInterimText) {
      this.onInterimText('')
    }

    // AUTO-ANSWER TRIGGER: If interviewer asked a question and autoAnswer is ON
    if (config.autoAnswerOnQuestion && isQuestion) {
      this.onQuestionDetected(cleanText, [...this.rollingTurns])
    }
  }

  private async processSpeechAudio(blob: Blob): Promise<void> {
    if (blob.size < 1200) return // Skip tiny clicks/coughs

    const config = getStoredSTTConfig()
    let text = ''

    try {
      if (config.provider === 'groq' && config.groqApiKey) {
        text = await this.transcribeWithGroq(blob, config.groqApiKey)
      } else if (config.provider === 'openai' && config.openaiApiKey) {
        text = await this.transcribeWithOpenAI(blob, config.openaiApiKey)
      } else if (config.provider === 'local') {
        text = await this.transcribeWithLocal(blob, config.localEndpoint)
      } else {
        return
      }

      const cleanText = text.trim()
      if (!cleanText || cleanText.length < 3) return

      this.handleFinalTranscript(cleanText)
    } catch (e) {
      console.error('Transcription error:', e)
    }
  }

  private async transcribeWithGroq(blob: Blob, apiKey: string): Promise<string> {
    const formData = new FormData()
    formData.append('file', blob, 'audio.webm')
    formData.append('model', 'whisper-large-v3-turbo')
    formData.append('response_format', 'json')
    formData.append('language', 'en')

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: formData
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Groq Whisper error (${response.status}): ${err}`)
    }

    const data = await response.json()
    return data.text || ''
  }

  private async transcribeWithOpenAI(blob: Blob, apiKey: string): Promise<string> {
    const formData = new FormData()
    formData.append('file', blob, 'audio.webm')
    formData.append('model', 'whisper-1')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: formData
    })

    if (!response.ok) {
      throw new Error(`OpenAI Whisper error: ${response.status}`)
    }

    const data = await response.json()
    return data.text || ''
  }

  private async transcribeWithLocal(blob: Blob, endpoint = 'http://127.0.0.1:8178/inference'): Promise<string> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/webm'
      },
      body: blob
    })

    if (!response.ok) {
      throw new Error(`Local STT error: ${response.status}`)
    }

    const data = await response.json()
    return data.text || ''
  }
}
