import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS, HotkeyAction, OverlayState } from '../shared/types'

export const api = {
  setIgnoreMouseEvents: (ignore: boolean, forward = true): void => {
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore, forward)
  },
  getState: (): Promise<OverlayState> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_STATE)
  },
  toggleVisibility: (): void => {
    ipcRenderer.send(IPC_CHANNELS.TOGGLE_VISIBILITY)
  },
  toggleClickThrough: (): void => {
    ipcRenderer.send(IPC_CHANNELS.TOGGLE_CLICK_THROUGH)
  },
  moveWindow: (dx: number, dy: number): void => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, dx, dy)
  },
  onHotkey: (callback: (action: HotkeyAction) => void): (() => void) => {
    const listener = (_: unknown, action: HotkeyAction): void => callback(action)
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_TRIGGERED, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.HOTKEY_TRIGGERED, listener)
    }
  },
  logAction: (message: string): void => {
    ipcRenderer.send(IPC_CHANNELS.LOG_ACTION, message)
  },
  captureScreen: (maxEdge?: number): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREEN, maxEdge)
  },
  toggleWindowSize: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_SIZE)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback)
  window.electron = electronAPI
  // @ts-ignore (fallback)
  window.api = api
}
