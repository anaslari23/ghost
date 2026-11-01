import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import {
  toggleOverlayVisibility,
  getOverlayWindow,
  setWindowClickThrough,
  isWindowClickThrough,
  moveOverlayWindow
} from './window'

let tray: Tray | null = null

export function updateTrayMenu(): void {
  if (!tray) return

  const win = getOverlayWindow()
  const isVisible = win ? win.isVisible() : false
  const clickThrough = isWindowClickThrough()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ghost Overlay',
      enabled: false
    },
    { type: 'separator' },
    {
      label: isVisible ? 'Hide Overlay (⌘⇧Space)' : 'Show Overlay (⌘⇧Space)',
      click: () => {
        toggleOverlayVisibility()
        updateTrayMenu()
      }
    },
    {
      label: `Click-Through: ${clickThrough ? 'ON' : 'OFF'}`,
      type: 'checkbox',
      checked: clickThrough,
      click: () => {
        setWindowClickThrough(!clickThrough)
        updateTrayMenu()
      }
    },
    {
      label: 'Move Overlay',
      submenu: [
        { label: 'Up (⌘↑)', click: () => moveOverlayWindow(0, -40) },
        { label: 'Down (⌘↓)', click: () => moveOverlayWindow(0, 40) },
        { label: 'Left (⌘←)', click: () => moveOverlayWindow(-40, 0) },
        { label: 'Right (⌘→)', click: () => moveOverlayWindow(40, 0) }
      ]
    },
    { type: 'separator' },
    {
      label: 'Quit Ghost',
      accelerator: 'CommandOrControl+Q',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

export function createTray(): Tray {
  const iconPath = join(__dirname, '../../resources/icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    icon = nativeImage.createFromBuffer(Buffer.alloc(16 * 16 * 4, 0))
  } else {
    icon = icon.resize({ width: 18, height: 18 })
  }

  tray = new Tray(icon)
  tray.setToolTip('Ghost Overlay')
  updateTrayMenu()

  tray.on('click', () => {
    toggleOverlayVisibility()
    updateTrayMenu()
  })

  return tray
}

