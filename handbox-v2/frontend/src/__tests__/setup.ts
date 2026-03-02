import '@testing-library/jest-dom'

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()

// Mock window.__TAURI_INTERNALS__ to prevent Tauri detection issues
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {
    invoke: vi.fn().mockResolvedValue(null),
    transformCallback: vi.fn(),
    metadata: { currentWindow: { label: 'test' } },
  },
  writable: true,
  configurable: true,
})
