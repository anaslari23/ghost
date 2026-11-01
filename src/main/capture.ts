import { desktopCapturer, screen, systemPreferences } from 'electron'

export async function capturePrimaryScreen(maxEdge = 1600): Promise<string> {
  if (process.platform === 'darwin') {
    const screenAccess = systemPreferences.getMediaAccessStatus('screen')
    if (screenAccess !== 'granted') {
      console.warn('[Capture] Screen recording access status is:', screenAccess)
    }
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size

  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const thumbnailSize = {
    width: Math.max(320, Math.round(width * scale)),
    height: Math.max(240, Math.round(height * scale))
  }

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize
  })

  if (!sources || sources.length === 0) {
    throw new Error('No screen capture source available')
  }

  // Pick the primary display source or the first one
  const primarySource =
    sources.find((s) => s.display_id === `${primaryDisplay.id}`) || sources[0]

  const jpegBuffer = primarySource.thumbnail.toJPEG(80)
  const base64Data = jpegBuffer.toString('base64')

  return `data:image/jpeg;base64,${base64Data}`
}

