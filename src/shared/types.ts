export type AppMode = 'interview' | 'meeting' | 'sales' | 'custom'

export type AppStatus = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'streaming' | 'error'

export interface OverlayState {
  visible: boolean
  clickThrough: boolean
  status: AppStatus
  activeMode: AppMode
  activeModel: string
  contentProtection: boolean
}

export type HotkeyAction = 'toggle' | 'ask' | 'clear' | 'move-up' | 'move-down' | 'move-left' | 'move-right'

export interface ModeConfig {
  name: string
  systemPrompt: string
  model: string
  maxScreenshotEdge: number
}

export type ModesMap = Record<AppMode, ModeConfig>

export const IPC_CHANNELS = {
  SET_IGNORE_MOUSE_EVENTS: 'overlay:set-ignore-mouse-events',
  GET_STATE: 'overlay:get-state',
  HOTKEY_TRIGGERED: 'overlay:hotkey-triggered',
  TOGGLE_VISIBILITY: 'overlay:toggle-visibility',
  TOGGLE_CLICK_THROUGH: 'overlay:toggle-click-through',
  MOVE_WINDOW: 'overlay:move-window',
  LOG_ACTION: 'overlay:log-action',
  CAPTURE_SCREEN: 'overlay:capture-screen',
  TOGGLE_SIZE: 'overlay:toggle-size'
} as const

