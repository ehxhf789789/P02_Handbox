/**
 * Tauri API utilities — safe wrappers for Tauri APIs that work in both
 * Tauri native and browser environments.
 */

// Check if we're running in Tauri environment
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Cached invoke function
let cachedInvoke: typeof import('@tauri-apps/api/core').invoke | null = null

/**
 * Get the Tauri invoke function.
 * Returns null if not in Tauri environment.
 */
export const getInvoke = async (): Promise<typeof import('@tauri-apps/api/core').invoke | null> => {
  if (!isTauri()) {
    return null
  }
  if (cachedInvoke) {
    return cachedInvoke
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    cachedInvoke = invoke
    return invoke
  } catch {
    return null
  }
}

/**
 * Safe invoke wrapper that returns null if not in Tauri environment.
 */
export const safeInvoke = async <T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T | null> => {
  const invoke = await getInvoke()
  if (!invoke) {
    console.warn(`[safeInvoke] Not in Tauri environment, skipping: ${cmd}`)
    return null
  }
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    console.error(`[safeInvoke] Failed to invoke ${cmd}:`, e)
    throw e
  }
}

// Cached event API
let cachedEventApi: typeof import('@tauri-apps/api/event') | null = null

/**
 * Get the Tauri event API.
 * Returns null if not in Tauri environment.
 */
export const getEventApi = async (): Promise<typeof import('@tauri-apps/api/event') | null> => {
  if (!isTauri()) {
    return null
  }
  if (cachedEventApi) {
    return cachedEventApi
  }
  try {
    const eventApi = await import('@tauri-apps/api/event')
    cachedEventApi = eventApi
    return eventApi
  } catch {
    return null
  }
}

/**
 * Safe listen wrapper that returns a no-op unlisten if not in Tauri environment.
 */
export const safeListen = async <T>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> => {
  const eventApi = await getEventApi()
  if (!eventApi) {
    console.warn(`[safeListen] Not in Tauri environment, skipping: ${event}`)
    return () => {} // Return no-op unlisten
  }
  return eventApi.listen<T>(event, handler)
}
