/**
 * Tests for Tauri utility functions (safeInvoke, safeListen)
 * Tests the safety wrappers around Tauri IPC
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safeInvoke, safeListen, isTauri } from '@/utils/tauri'

describe('isTauri', () => {
  it('returns true when __TAURI_INTERNALS__ exists', () => {
    // __TAURI_INTERNALS__ is set in setup.ts
    expect(isTauri()).toBe(true)
  })
})

describe('safeInvoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the Tauri invoke function', async () => {
    // The mock should be used since __TAURI_INTERNALS__ exists
    const result = await safeInvoke('test_command', { arg: 'value' })
    // With our mock, it resolves to null (the default mock return)
    expect(result).toBeNull()
  })

  it('handles invoke errors by rethrowing', async () => {
    // Import the mocked core module to set up rejection
    const core = await import('@tauri-apps/api/core')
    vi.mocked(core.invoke).mockRejectedValueOnce(new Error('Test error'))

    await expect(safeInvoke('failing_command')).rejects.toThrow('Test error')
  })
})

describe('safeListen', () => {
  it('returns an unlisten function', async () => {
    const handler = vi.fn()
    const unlisten = await safeListen('test-event', handler)
    expect(typeof unlisten).toBe('function')
    // Calling unlisten should not throw
    unlisten()
  })

  it('calls the Tauri listen function', async () => {
    const eventApi = await import('@tauri-apps/api/event')
    const handler = vi.fn()
    await safeListen('my-event', handler)
    expect(eventApi.listen).toHaveBeenCalledWith('my-event', handler)
  })
})
