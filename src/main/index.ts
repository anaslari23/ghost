import { app, BrowserWindow, session, desktopCapturer } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow } from './window'
import { registerGlobalHotkeys, unregisterGlobalHotkeys } from './hotkeys'
import { createTray } from './tray'
import { setupIpcHandlers } from './ipc'

// F4: Accessory app (hide from Dock and App Switcher)
if (process.platform === 'darwin') {
  app.dock?.hide()
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ghost.overlay')

  // Auto-grant permissions for audio capture, display media, and speech
  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'screen', 'display-capture']
    if (allowed.includes(permission)) {
      callback(true)
      return
    }
    callback(false)
  })

  // System audio loopback for macOS ScreenCaptureKit
  session.defaultSession.setDisplayMediaRequestHandler((_, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' })
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Set up IPC, Window, Tray, and Hotkeys
  setupIpcHandlers()
  createOverlayWindow()
  createTray()
  registerGlobalHotkeys()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow()
    }
  })
})

app.on('will-quit', () => {
  unregisterGlobalHotkeys()
})

app.on('window-all-closed', () => {
  // Don't quit when windows are closed (runs as accessory in tray)
})
