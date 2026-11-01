import { globalShortcut } from 'electron'
import {
  toggleOverlayVisibility,
  moveOverlayWindow,
  getOverlayWindow
} from './window'
import { IPC_CHANNELS, HotkeyAction } from '../shared/types'

const MOVE_STEP_PX = 40

function notifyRenderer(action: HotkeyAction): void {
  const win = getOverlayWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.HOTKEY_TRIGGERED, action)
  }
}

export function registerGlobalHotkeys(): void {
  const shortcuts: { accelerator: string; action: HotkeyAction; handler: () => void }[] = [
    {
      accelerator: 'CommandOrControl+Shift+Space',
      action: 'toggle',
      handler: () => {
        toggleOverlayVisibility()
        notifyRenderer('toggle')
      }
    },
    {
      accelerator: 'CommandOrControl+Enter',
      action: 'ask',
      handler: () => {
        const win = getOverlayWindow()
        if (win && !win.isVisible()) {
          win.show()
        }
        notifyRenderer('ask')
      }
    },
    {
      accelerator: 'CommandOrControl+Shift+Backspace',
      action: 'clear',
      handler: () => {
        notifyRenderer('clear')
      }
    },
    {
      accelerator: 'CommandOrControl+Up',
      action: 'move-up',
      handler: () => {
        moveOverlayWindow(0, -MOVE_STEP_PX)
        notifyRenderer('move-up')
      }
    },
    {
      accelerator: 'CommandOrControl+Down',
      action: 'move-down',
      handler: () => {
        moveOverlayWindow(0, MOVE_STEP_PX)
        notifyRenderer('move-down')
      }
    },
    {
      accelerator: 'CommandOrControl+Left',
      action: 'move-left',
      handler: () => {
        moveOverlayWindow(-MOVE_STEP_PX, 0)
        notifyRenderer('move-left')
      }
    },
    {
      accelerator: 'CommandOrControl+Right',
      action: 'move-right',
      handler: () => {
        moveOverlayWindow(MOVE_STEP_PX, 0)
        notifyRenderer('move-right')
      }
    }
  ]

  for (const item of shortcuts) {
    const success = globalShortcut.register(item.accelerator, item.handler)
    if (!success) {
      console.warn(`[Hotkeys] Failed to register global shortcut: ${item.accelerator} (may be reserved or occupied by another app)`)
    } else {
      console.log(`[Hotkeys] Registered global shortcut: ${item.accelerator}`)
    }
  }
}

export function unregisterGlobalHotkeys(): void {
  globalShortcut.unregisterAll()
}

