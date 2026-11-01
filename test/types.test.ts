import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../src/shared/types'

describe('IPC Channels and types', () => {
  it('defines all required overlay channels', () => {
    expect(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS).toBe('overlay:set-ignore-mouse-events')
    expect(IPC_CHANNELS.GET_STATE).toBe('overlay:get-state')
    expect(IPC_CHANNELS.HOTKEY_TRIGGERED).toBe('overlay:hotkey-triggered')
    expect(IPC_CHANNELS.TOGGLE_VISIBILITY).toBe('overlay:toggle-visibility')
    expect(IPC_CHANNELS.TOGGLE_CLICK_THROUGH).toBe('overlay:toggle-click-through')
    expect(IPC_CHANNELS.MOVE_WINDOW).toBe('overlay:move-window')
  })
})

