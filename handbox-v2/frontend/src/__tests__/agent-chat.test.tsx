/**
 * AgentChatPanel integration tests
 * Tests: rendering, user input, message display, streaming state, mode selection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgentChatPanel } from '@/components/agent/AgentChatPanel'

// Mock safeInvoke and safeListen
vi.mock('@/utils/tauri', () => ({
  safeInvoke: vi.fn().mockResolvedValue(null),
  safeListen: vi.fn().mockResolvedValue(() => {}),
}))

import { safeInvoke, safeListen } from '@/utils/tauri'

const mockSafeInvoke = vi.mocked(safeInvoke)
const mockSafeListen = vi.mocked(safeListen)

describe('AgentChatPanel', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSafeInvoke.mockResolvedValue(null)
    mockSafeListen.mockResolvedValue(() => {})
  })

  // --- Rendering ---

  it('renders the panel with header and input', () => {
    render(<AgentChatPanel onClose={onClose} />)
    expect(screen.getByText('AI Agent')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/에이전트에게 작업을 요청하세요/)).toBeInTheDocument()
  })

  it('renders example prompts when no messages', () => {
    render(<AgentChatPanel onClose={onClose} />)
    expect(screen.getByText('프로젝트 구조를 분석해줘')).toBeInTheDocument()
    expect(screen.getByText('TODO가 있는 코드를 찾아줘')).toBeInTheDocument()
    expect(screen.getByText('Handbox AI Agent')).toBeInTheDocument()
  })

  it('renders mode selector with three modes', () => {
    render(<AgentChatPanel onClose={onClose} />)
    expect(screen.getByText('Auto')).toBeInTheDocument()
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('Execute')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    render(<AgentChatPanel onClose={onClose} />)
    const buttons = screen.getAllByRole('button')
    const closeBtn = buttons.find(b => b.querySelector('.lucide-x'))
    if (closeBtn) {
      await userEvent.click(closeBtn)
      expect(onClose).toHaveBeenCalled()
    }
  })

  // --- Input behavior ---

  it('send button is disabled when input is empty', () => {
    render(<AgentChatPanel onClose={onClose} />)
    // Find the violet send button (has disabled attribute when empty)
    const buttons = screen.getAllByRole('button')
    const sendBtn = buttons.find(b => b.classList.contains('bg-violet-600'))
    expect(sendBtn).toBeDefined()
    expect(sendBtn).toBeDisabled()
  })

  it('clicking example prompt fills input', async () => {
    render(<AgentChatPanel onClose={onClose} />)
    const prompt = screen.getByText('프로젝트 구조를 분석해줘')
    await userEvent.click(prompt)
    const textarea = screen.getByPlaceholderText(/에이전트에게 작업을 요청하세요/)
    expect(textarea).toHaveValue('프로젝트 구조를 분석해줘')
  })

  // --- Mode switching ---

  it('changes placeholder on mode switch', async () => {
    render(<AgentChatPanel onClose={onClose} />)
    const planBtn = screen.getByText('Plan')
    await userEvent.click(planBtn)
    expect(screen.getByPlaceholderText(/계획을 세울 작업을 설명하세요/)).toBeInTheDocument()

    const execBtn = screen.getByText('Execute')
    await userEvent.click(execBtn)
    expect(screen.getByPlaceholderText(/실행할 작업을 지시하세요/)).toBeInTheDocument()

    const autoBtn = screen.getByText('Auto')
    await userEvent.click(autoBtn)
    expect(screen.getByPlaceholderText(/에이전트에게 작업을 요청하세요/)).toBeInTheDocument()
  })

  // --- Message submission ---

  it('sends message and shows user message', async () => {
    mockSafeInvoke.mockResolvedValue({
      conversation_id: 'test-conv-1',
      final_answer: 'Hello from agent',
      steps: [],
      usage: { total_input_tokens: 100, total_output_tokens: 50, tool_calls: 0 },
    })

    render(<AgentChatPanel onClose={onClose} />)
    const textarea = screen.getByPlaceholderText(/에이전트에게 작업을 요청하세요/)
    await userEvent.type(textarea, '테스트 메시지')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText('테스트 메시지')).toBeInTheDocument()
    })
  })

  it('invokes agent_run_loop with correct params', async () => {
    mockSafeInvoke.mockResolvedValue({
      conversation_id: 'test-conv-2',
      final_answer: 'Done',
      steps: [],
      usage: { total_input_tokens: 10, total_output_tokens: 5, tool_calls: 0 },
    })

    render(<AgentChatPanel onClose={onClose} />)
    const textarea = screen.getByPlaceholderText(/에이전트에게 작업을 요청하세요/)
    await userEvent.type(textarea, '프로젝트 분석')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith('agent_run_loop', expect.objectContaining({
        request: expect.objectContaining({
          task: '프로젝트 분석',
          max_iterations: 25,
        }),
      }))
    })
  })

  it('shows error message on failure', async () => {
    // Mock based on command name — Windows working dir detection uses 2 calls
    mockSafeInvoke.mockImplementation(async (command: string) => {
      if (command === 'agent_run_loop') {
        throw new Error('LLM connection failed')
      }
      return null
    })

    render(<AgentChatPanel onClose={onClose} />)
    const textarea = screen.getByPlaceholderText(/에이전트에게 작업을 요청하세요/)
    await userEvent.type(textarea, '실패 테스트')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/LLM connection failed/)).toBeInTheDocument()
    })
  })

  // --- Event listeners ---

  it('sets up agent-stream event listener on mount', async () => {
    render(<AgentChatPanel onClose={onClose} />)
    // safeListen is called asynchronously in useEffect, wait for it
    await waitFor(() => {
      expect(mockSafeListen).toHaveBeenCalledWith('agent-stream', expect.any(Function))
    })
  })

  it('sets up all four event listeners', async () => {
    render(<AgentChatPanel onClose={onClose} />)
    await waitFor(() => {
      const calls = mockSafeListen.mock.calls.map(c => c[0])
      expect(calls).toContain('agent-stream')
      expect(calls).toContain('agent-step')
      expect(calls).toContain('agent-complete')
      expect(calls).toContain('llm-stream')
    })
  })

  // --- Settings panel ---

  it('toggles settings panel', async () => {
    render(<AgentChatPanel onClose={onClose} />)
    expect(screen.queryByText('Max iterations:')).not.toBeInTheDocument()

    const buttons = screen.getAllByRole('button')
    const settingsBtn = buttons.find(b => b.getAttribute('title') === '설정')
    if (settingsBtn) {
      await userEvent.click(settingsBtn)
      expect(screen.getByText('Max iterations:')).toBeInTheDocument()
    }
  })
})
