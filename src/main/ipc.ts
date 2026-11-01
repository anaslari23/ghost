import { ipcMain } from 'electron'
import { IPC_CHANNELS, OverlayState } from '../shared/types'
import {
  getOverlayWindow,
  setWindowClickThrough,
  isWindowClickThrough,
  toggleOverlayVisibility,
  moveOverlayWindow,
  toggleOverlayWindowSize
} from './window'
import { updateTrayMenu } from './tray'
import { capturePrimaryScreen } from './capture'

export function setupIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TOGGLE_SIZE, () => {
    return toggleOverlayWindowSize()
  })
  ipcMain.handle(IPC_CHANNELS.CAPTURE_SCREEN, async (_, maxEdge?: number) => {
    return await capturePrimaryScreen(maxEdge)
  })
  ipcMain.on(
    IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS,
    (_, ignore: boolean, forward = true) => {
      setWindowClickThrough(ignore, forward)
      updateTrayMenu()
    }
  )

  ipcMain.handle(IPC_CHANNELS.GET_STATE, (): OverlayState => {
    const win = getOverlayWindow()
    return {
      visible: win ? win.isVisible() : false,
      clickThrough: isWindowClickThrough(),
      status: 'idle',
      activeMode: 'interview',
      activeModel: 'anthropic/claude-haiku-5.5',
      contentProtection: true
    }
  })

  ipcMain.on(IPC_CHANNELS.TOGGLE_VISIBILITY, () => {
    toggleOverlayVisibility()
    updateTrayMenu()
  })

  ipcMain.on(IPC_CHANNELS.TOGGLE_CLICK_THROUGH, () => {
    const current = isWindowClickThrough()
    setWindowClickThrough(!current)
    updateTrayMenu()
  })

  ipcMain.on(IPC_CHANNELS.MOVE_WINDOW, (_, dx: number, dy: number) => {
    moveOverlayWindow(dx, dy)
  })

  ipcMain.on(IPC_CHANNELS.LOG_ACTION, (_, message: string) => {
    console.log(`[Renderer] ${message}`)
  })
}

