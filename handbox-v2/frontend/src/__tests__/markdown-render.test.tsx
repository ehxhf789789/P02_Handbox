/**
 * Markdown rendering tests for AgentChatPanel.
 * Tests markdown rendering by sending a message and checking rendered DOM.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock Tauri
vi.mock('@/utils/tauri', () => ({
  safeInvoke: vi.fn().mockResolvedValue(null),
  safeListen: vi.fn().mockResolvedValue(() => {}),
}))

import { AgentChatPanel } from '@/components/agent/AgentChatPanel'
import { safeInvoke, safeListen } from '@/utils/tauri'

const mockSafeInvoke = vi.mocked(safeInvoke)
const mockSafeListen = vi.mocked(safeListen)

describe('Markdown Rendering via AgentChatPanel', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSafeInvoke.mockResolvedValue(null)
    mockSafeListen.mockResolvedValue(() => {})
  })

  async function sendAndGetResponse(content: string) {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'agent_run_loop') {
        return {
          conversation_id: 'md-test',
          final_answer: content,
          steps: [],
          usage: { total_input_tokens: 10, total_output_tokens: 5, tool_calls: 0 },
        }
      }
      return null
    })

    const result = render(<AgentChatPanel onClose={onClose} />)
    const textarea = screen.getByPlaceholderText(/에이전트에게 작업을 요청하세요/)
    await userEvent.type(textarea, 'test')
    await userEvent.keyboard('{Enter}')

    // Wait for the response text to appear (the agent's final_answer should be in the DOM)
    await waitFor(() => {
      // Look for "Handbox Agent" label which appears in assistant messages
      const agentLabels = screen.getAllByText('Handbox Agent')
      expect(agentLabels.length).toBeGreaterThan(0)
    }, { timeout: 5000 })

    // Small delay for React to finish rendering
    await new Promise(r => setTimeout(r, 100))

    return result.container
  }

  it('renders bold text with **markers**', async () => {
    const container = await sendAndGetResponse('This is **important** text')
    const boldEl = container.querySelector('b')
    expect(boldEl).toBeTruthy()
    expect(boldEl?.textContent).toBe('important')
  })

  it('renders inline code', async () => {
    const container = await sendAndGetResponse('Use `npm install` command')
    const codeEls = container.querySelectorAll('code')
    const inlineCode = Array.from(codeEls).find(el => !el.closest('pre'))
    expect(inlineCode).toBeTruthy()
    expect(inlineCode?.textContent).toContain('npm install')
  })

  it('renders code blocks', async () => {
    const container = await sendAndGetResponse('```typescript\nconst x = 1\n```')
    expect(container.querySelector('pre')).toBeTruthy()
    expect(container.textContent).toContain('const x = 1')
  })

  it('renders markdown tables', async () => {
    const container = await sendAndGetResponse('| A | B |\n|---|---|\n| 1 | 2 |')
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelector('th')).toBeTruthy()
    expect(container.querySelector('td')).toBeTruthy()
  })

  it('renders headers', async () => {
    const container = await sendAndGetResponse('# Big Title')
    expect(container.querySelector('h3')).toBeTruthy()
    expect(container.textContent).toContain('Big Title')
  })

  it('renders blockquotes', async () => {
    const container = await sendAndGetResponse('> A quoted line')
    expect(container.querySelector('.border-l-2')).toBeTruthy()
    expect(container.textContent).toContain('A quoted line')
  })

  it('prevents XSS — no script execution', async () => {
    const container = await sendAndGetResponse('test <script>alert(1)</script> end')
    expect(container.querySelector('script')).toBeNull()
  })
})
