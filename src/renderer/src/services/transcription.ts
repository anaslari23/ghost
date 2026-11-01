import { getStoredApiKey } from './openrouter'

export interface TranscriptTurn {
  id: string
  speaker: 'Interviewer' | 'You'
  text: string
  timestamp: number
  isQuestion?: boolean
}

export type STTProvider = 'openrouter' | 'groq' | 'openai' | 'local'

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
  provider: 'openrouter',
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
      const cfg = { ...DEFAULT_STT_CONFIG, ...JSON.parse(raw) }
      // The old browser engine never worked in Electron (no speech backend); move everyone to OpenRouter.
      if ((cfg.provider as string) === 'browser') cfg.provider = 'openrouter'
      return cfg
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

  // Only a question if it *starts* like one; substring matches fired on any statement containing "what ", "time complexity", etc.
  const lower = trimmed.toLowerCase().replace(/^((so|okay|ok|alright|right|and|now|well|um|uh|yeah)[, ]+)+/, '')
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

  return questionStarters.some((prefix) => lower.startsWith(prefix))
}

const STT_MODEL_KEY = 'ghost_stt_model'
export const getStoredSTTModel = (): string => localStorage.getItem(STT_MODEL_KEY) || ''
export const setStoredSTTModel = (id: string): void => localStorage.setItem(STT_MODEL_KEY, id)

/** Decode a recorded blob and re-encode as 16 kHz mono 16-bit WAV (the format audio-input models accept). */
async function blobToWavBase64(blob: Blob): Promise<string> {
  const ctx = new AudioContext({ sampleRate: 16000 })
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer())
  await ctx.close()
  const pcm = audio.getChannelData(0)
  const buf = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(buf)
  const str = (o: number, t: string): void => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

type Speaker = TranscriptTurn['speaker']

/** One audio source (mic or system output): voice-activity detection + one recording per utterance. */
class AudioLane {
  private ctx = new AudioContext()
  private analyser = this.ctx.createAnalyser()
  private recorder: MediaRecorder
  private chunks: Blob[] = []
  private speaking = false
  private speechStart = 0
  private silenceTimer: any = null
  private timer: any = null

  constructor(
    stream: MediaStream,
    private speaker: Speaker,
    private onBlob: (blob: Blob, speaker: Speaker) => void,
    private onVolume: (v: number) => void,
    private minSilenceMs: number
  ) {
    const audioOnly = new MediaStream(stream.getAudioTracks())
    this.ctx.createMediaStreamSource(audioOnly).connect(this.analyser)
    this.analyser.fftSize = 512
    this.recorder = new MediaRecorder(audioOnly, { mimeType: 'audio/webm;codecs=opus' })
    this.recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data)
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'audio/webm' })
      this.chunks = []
      if (blob.size > 8000) this.onBlob(blob, this.speaker)
    }
    const bins = new Uint8Array(this.analyser.frequencyBinCount)
    this.timer = setInterval(() => {
      this.analyser.getByteFrequencyData(bins)
      const avg = bins.reduce((a, b) => a + b, 0) / bins.length
      this.onVolume(Math.min(100, Math.round(avg * 2)))
      const now = Date.now()
      if (avg > 20) {
        if (!this.speaking) {
          this.speaking = true
          this.speechStart = now
          if (this.recorder.state === 'inactive') this.recorder.start(250)
        }
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer)
          this.silenceTimer = null
        }
        // Long monologue: cut it so the first part gets transcribed without waiting for a pause.
        if (now - this.speechStart > 15000) this.finish()
      } else if (this.speaking && !this.silenceTimer) {
        this.silenceTimer = setTimeout(() => this.finish(), this.minSilenceMs)
      }
    }, 100)
  }

  private finish(): void {
    this.speaking = false
    this.silenceTimer = null
    if (this.recorder.state === 'recording') this.recorder.stop()
  }

  stop(): void {
    clearInterval(this.timer)
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    if (this.recorder.state !== 'inactive') {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.ctx.close()
  }
}

export class LiveAudioTranscriber {
  private streams: MediaStream[] = []
  private lanes: AudioLane[] = []
  private isListening = false
  private volumes = [0, 0]

  private onTurnTranscribed: (turn: TranscriptTurn) => void
  private onQuestionDetected: (question: string, recentTurns: TranscriptTurn[]) => void
  private onVolumeChange: (volumeLevel: number) => void
  private onInterimText?: (interim: string) => void
  private onError?: (message: string) => void

  private rollingTurns: TranscriptTurn[] = []
  private pendingQuestion: string[] = []
  private questionTimer: any = null

  constructor(callbacks: {
    onTurnTranscribed: (turn: TranscriptTurn) => void
    onQuestionDetected: (question: string, recentTurns: TranscriptTurn[]) => void
    onVolumeChange: (volumeLevel: number) => void
    onInterimText?: (interim: string) => void
    onError?: (message: string) => void
  }) {
    this.onTurnTranscribed = callbacks.onTurnTranscribed
    this.onQuestionDetected = callbacks.onQuestionDetected
    this.onVolumeChange = callbacks.onVolumeChange
    this.onInterimText = callbacks.onInterimText
    this.onError = callbacks.onError
  }

  public async startListening(): Promise<void> {
    if (this.isListening) return
    const config = getStoredSTTConfig()
    this.isListening = true

    // System audio = the interviewer (macOS loopback, handled by the main process). Mic = you.
    let system: MediaStream | null = null
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      display.getVideoTracks().forEach((t) => t.stop())
      if (display.getAudioTracks().length > 0) system = display
    } catch (e) {
      console.warn('System audio capture unavailable:', e)
    }

    let mic: MediaStream | null = null
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(config.audioDeviceId ? { deviceId: { exact: config.audioDeviceId } } : {})
        }
      })
    } catch (e) {
      console.warn('Mic unavailable:', e)
    }

    if (!system && !mic) {
      this.isListening = false
      throw new Error('No audio source. Allow Microphone and Screen Recording for Ghost in macOS System Settings.')
    }
    if (!system) {
      this.onError?.('Interviewer audio not captured (allow Screen Recording). Listening to the mic only.')
    }

    const onBlob = (blob: Blob, speaker: Speaker): void => void this.processSpeechAudio(blob, speaker)
    const vol = (i: number) => (v: number) => {
      this.volumes[i] = v
      this.onVolumeChange(Math.max(...this.volumes))
    }
    const silence = Math.min(config.minSilenceMs || 800, 800)
    if (system) {
      this.streams.push(system)
      this.lanes.push(new AudioLane(system, 'Interviewer', onBlob, vol(0), silence))
    }
    // With system audio we hear the interviewer directly, so the mic is not transcribed (saves cost and
    // stops your own voice and room noise reaching the model). Without it, the mic is the only source.
    if (mic && !system) {
      this.streams.push(mic)
      this.lanes.push(new AudioLane(mic, 'Interviewer', onBlob, vol(1), silence))
    } else {
      mic?.getTracks().forEach((t) => t.stop())
    }
  }

  public stopListening(): void {
    this.isListening = false
    if (this.questionTimer) clearTimeout(this.questionTimer)
    this.questionTimer = null
    this.pendingQuestion = []
    this.lanes.forEach((l) => l.stop())
    this.lanes = []
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    this.streams = []
  }

  private handleFinalTranscript(cleanText: string, speaker: Speaker): void {
    // Ignore common low-energy hallucinations
    const junk = ['thank you', 'thanks for watching', 'you', 'subscribe', 'bye', 'amara.org', 'no speech', 'silence']
    const norm = cleanText.toLowerCase().replace(/[.,!\[\]()]/g, '').trim()
    if (junk.includes(norm) || /^\[.*\]$/.test(cleanText.trim())) return

    const config = getStoredSTTConfig()
    const isQuestion = speaker === 'Interviewer' && isLikelyQuestion(cleanText)

    const turn: TranscriptTurn = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      speaker,
      text: cleanText,
      timestamp: Date.now(),
      isQuestion
    }
    this.rollingTurns.push(turn)
    if (this.rollingTurns.length > 25) this.rollingTurns.shift()
    this.onTurnTranscribed(turn)

    // Only the interviewer's speech can trigger an answer.
    if (speaker !== 'Interviewer' || !config.autoAnswerOnQuestion) return

    // Speech engines split one question into several finals; wait for a pause and answer the whole thing once.
    if (isQuestion || /\b(let'?s|i'?d like you|i want you|next up|moving on)\b/i.test(cleanText)) {
      this.pendingQuestion.push(cleanText)
      if (this.questionTimer) clearTimeout(this.questionTimer)
      this.questionTimer = setTimeout(() => {
        const question = this.pendingQuestion.join(' ')
        this.pendingQuestion = []
        this.questionTimer = null
        this.onQuestionDetected(question, [...this.rollingTurns])
      }, 400)
    } else if (this.questionTimer) {
      this.pendingQuestion.push(cleanText)
    }
  }

  private async processSpeechAudio(blob: Blob, speaker: Speaker): Promise<void> {
    const config = getStoredSTTConfig()
    let text = ''
    this.onInterimText?.('transcribing')
    try {
      if (config.provider === 'groq' && config.groqApiKey) {
        text = await this.transcribeWithGroq(blob, config.groqApiKey)
      } else if (config.provider === 'openai' && config.openaiApiKey) {
        text = await this.transcribeWithOpenAI(blob, config.openaiApiKey)
      } else if (config.provider === 'local') {
        text = await this.transcribeWithLocal(blob, config.localEndpoint)
      } else {
        text = await this.transcribeWithOpenRouter(blob)
      }
      const cleanText = text.trim()
      if (cleanText.length >= 3) this.handleFinalTranscript(cleanText, speaker)
    } catch (e: any) {
      console.error('Transcription error:', e)
      this.onError?.(`Speech-to-text failed: ${e?.message || e}`)
    } finally {
      this.onInterimText?.('')
    }
  }

  private async transcribeWithOpenRouter(blob: Blob): Promise<string> {
    const apiKey = getStoredApiKey()
    const model = getStoredSTTModel()
    if (!apiKey) throw new Error('add your OpenRouter key in Settings')
    if (!model) throw new Error('no audio-capable model found on your OpenRouter account; pick Groq or OpenAI in Settings > Audio')
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json', 'X-Title': 'ghost' },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcribe the clearly spoken human speech in this audio verbatim. Output only the words. If it is music, noise, a notification sound or unclear, output nothing.' },
              { type: 'input_audio', input_audio: { data: await blobToWavBase64(blob), format: 'wav' } }
            ]
          }
        ]
      })
    })
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 160)}`)
    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
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
