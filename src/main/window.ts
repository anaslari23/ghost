import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let overlayWindow: BrowserWindow | null = null
let isClickThrough = false

export function createOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize

  const windowWidth = 480
  const windowHeight = 360
  const initialX = Math.round(screenWidth - windowWidth - 40)
  const initialY = Math.round(80)

  overlayWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: initialX,
    y: initialY,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  // F2: Exclude from screen capture (NSWindow sharingType = none)
  overlayWindow.setContentProtection(true)

  // F1: Keep on top across workspaces and fullscreen spaces
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // By default, start with click-through off so user sees the initial window,
  // but support toggling and hover pass-through
  overlayWindow.setIgnoreMouseEvents(false)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function toggleOverlayVisibility(): boolean {
  if (!overlayWindow) return false

  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
    return false
  } else {
    overlayWindow.show()
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    return true
  }
}

export function setWindowClickThrough(ignore: boolean, forward = true): void {
  if (!overlayWindow) return
  isClickThrough = ignore
  overlayWindow.setIgnoreMouseEvents(ignore, { forward })
}

export function isWindowClickThrough(): boolean {
  return isClickThrough
}

export function moveOverlayWindow(dx: number, dy: number): void {
  if (!overlayWindow) return
  const [currentX, currentY] = overlayWindow.getPosition()
  overlayWindow.setPosition(currentX + dx, currentY + dy)
}

let isExpanded = false
export function toggleOverlayWindowSize(): boolean {
  if (!overlayWindow) return false
  const [currentWidth] = overlayWindow.getSize()
  isExpanded = !isExpanded
  const newHeight = isExpanded ? 560 : 360
  const newWidth = isExpanded ? Math.max(540, currentWidth) : 480
  overlayWindow.setSize(newWidth, newHeight, true)
  return isExpanded
}
