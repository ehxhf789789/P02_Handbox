/**
 * ReAct Agent Engine
 *
 * AWS Bedrock Agents 수준의 멀티스텝 에이전트 엔진
 *
 * ReAct 패턴: Thought → Action → Observation → ... → Final Answer
 *
 * 기능:
 * 1. 멀티스텝 추론 루프
 * 2. MCP 도구 실제 호출
 * 3. 컨텍스트 누적
 * 4. 최대 반복 제한
 * 5. 실행 추적 (XAI)
 */

import { LocalLLMProvider, configureOllama } from './LocalLLMProvider'
import { LocalMCPRegistry } from './LocalMCPRegistry'

// ============================================================
// Types
// ============================================================

export interface AgentConfig {
  name: string
  description?: string
  systemPrompt?: string
  tools?: string[]  // 사용 가능한 도구 이름 목록
  maxIterations?: number
  temperature?: number
}

export interface AgentStep {
  step: number
  type: 'thought' | 'action' | 'observation' | 'final'
  content: string
  tool?: string
  toolInput?: Record<string, any>
  toolOutput?: any
  timestamp: string
}

export interface AgentResult {
  success: boolean
  response: string
  steps: AgentStep[]
  tokensUsed: number
  processingTime: number
  iterationsUsed: number
}

export interface AgentSession {
  id: string
  agentName: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  createdAt: string
}

// ============================================================
// ReAct Agent Engine
// ============================================================

class ReActAgentEngine {
  private sessions: Map<string, AgentSession> = new Map()

  /**
   * 도구 스키마를 LLM에게 설명하는 텍스트 생성
   */
  private formatToolsForPrompt(toolNames?: string[]): string {
    const allTools = LocalMCPRegistry.listTools()
    const availableTools = toolNames
      ? allTools.filter(t => toolNames.includes(t.name))
      : allTools

    if (availableTools.length === 0) {
      return '사용 가능한 도구가 없습니다.'
    }

    const toolDescriptions = availableTools.map(tool => {
      const params = Object.entries(tool.inputSchema.properties || {})
        .map(([name, schema]: [string, any]) => `  - ${name}: ${schema.description || schema.type}`)
        .join('\n')

      return `### ${tool.name}
설명: ${tool.description}
파라미터:
${params || '  (없음)'}`
    }).join('\n\n')

    return toolDescriptions
  }

  /**
   * ReAct 시스템 프롬프트 생성
   */
  private buildSystemPrompt(config: AgentConfig): string {
    const toolsDescription = this.formatToolsForPrompt(config.tools)

    return `당신은 "${config.name}" AI 에이전트입니다.
${config.description || ''}

사용자의 요청을 처리하기 위해 단계적으로 사고하고 도구를 사용할 수 있습니다.

## 사용 가능한 도구:
${toolsDescription}

## 응답 형식:
각 단계에서 다음 형식 중 하나로 응답하세요:

1. 생각할 때:
\`\`\`
[THOUGHT]
(요청 분석 및 다음 행동 계획)
\`\`\`

2. 도구를 사용할 때:
\`\`\`
[ACTION]
tool: 도구이름
input: {"param1": "value1", "param2": "value2"}
\`\`\`

3. 최종 답변을 제공할 때:
\`\`\`
[FINAL]
(사용자에게 전달할 최종 답변)
\`\`\`

## 중요:
- 한 번에 하나의 [THOUGHT], [ACTION], 또는 [FINAL]만 출력하세요.
- 도구 실행 결과는 [OBSERVATION]으로 제공됩니다.
- 충분한 정보가 모이면 [FINAL]로 답변하세요.
- 최대 ${config.maxIterations || 5}회 반복 후 반드시 [FINAL]을 출력하세요.

${config.systemPrompt || ''}`
  }

  /**
   * LLM 응답 파싱
   */
  private parseResponse(response: string): {
    type: 'thought' | 'action' | 'final' | 'unknown'
    content: string
    tool?: string
    toolInput?: Record<string, any>
  } {
    // [THOUGHT] 파싱
    const thoughtMatch = response.match(/\[THOUGHT\]\s*([\s\S]*?)(?=\[ACTION\]|\[FINAL\]|$)/i)
    if (thoughtMatch && !response.includes('[ACTION]') && !response.includes('[FINAL]')) {
      return { type: 'thought', content: thoughtMatch[1].trim() }
    }

    // [ACTION] 파싱
    const actionMatch = response.match(/\[ACTION\]\s*([\s\S]*?)(?=\[THOUGHT\]|\[FINAL\]|$)/i)
    if (actionMatch) {
      const actionContent = actionMatch[1].trim()

      // tool과 input 추출
      const toolMatch = actionContent.match(/tool:\s*(\S+)/i)
      const inputMatch = actionContent.match(/input:\s*(\{[\s\S]*\})/i)

      if (toolMatch) {
        let toolInput: Record<string, any> = {}
        if (inputMatch) {
          try {
            toolInput = JSON.parse(inputMatch[1])
          } catch {
            // JSON 파싱 실패 시 빈 객체
          }
        }

        return {
          type: 'action',
          content: actionContent,
          tool: toolMatch[1],
          toolInput,
        }
      }
    }

    // [FINAL] 파싱
    const finalMatch = response.match(/\[FINAL\]\s*([\s\S]*?)$/i)
    if (finalMatch) {
      return { type: 'final', content: finalMatch[1].trim() }
    }

    // 파싱 실패 시 전체를 thought로 처리
    return { type: 'unknown', content: response }
  }

  /**
   * 도구 실행
   */
  private async executeTool(toolName: string, input: Record<string, any>): Promise<string> {
    try {
      // 기본 실행 컨텍스트 생성
      const context = {
        sessionId: `react_${Date.now()}`,
        userId: 'system',
        xaiEnabled: false,
      }
      const result = await LocalMCPRegistry.executeTool(toolName, input, context)

      if (result.success) {
        // 결과를 문자열로 변환
        const content = result.content[0]
        if (content && content.type === 'json') {
          return JSON.stringify((content as any).data, null, 2)
        } else if (content && content.type === 'text') {
          return (content as any).text
        }
        return JSON.stringify(content)
      } else {
        return `도구 실행 실패: ${result.error || '알 수 없는 오류'}`
      }
    } catch (error) {
      return `도구 실행 오류: ${String(error)}`
    }
  }

  /**
   * 에이전트 실행 (멀티스텝 ReAct 루프)
   */
  async invoke(
    prompt: string,
    config: AgentConfig,
    sessionId?: string,
  ): Promise<AgentResult> {
    const startTime = Date.now()
    const steps: AgentStep[] = []
    let totalTokens = 0
    const maxIterations = config.maxIterations || 5

    // LLM 설정 확인
    if (!LocalLLMProvider.getConfig()) {
      configureOllama()
    }

    // 시스템 프롬프트
    const systemPrompt = this.buildSystemPrompt(config)

    // 세션 히스토리
    let session = sessionId ? this.sessions.get(sessionId) : null
    if (!session) {
      session = {
        id: sessionId || `session_${Date.now()}`,
        agentName: config.name,
        history: [],
        createdAt: new Date().toISOString(),
      }
      this.sessions.set(session.id, session)
    }

    // 대화 컨텍스트 구성
    let conversationContext = session.history
      .map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
      .join('\n\n')

    conversationContext += `\n\nUser: ${prompt}\n\nAssistant:`

    // ReAct 루프
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // LLM 호출
      const llmResponse = await LocalLLMProvider.generate({
        prompt: conversationContext,
        systemPrompt,
        temperature: config.temperature || 0.7,
        maxTokens: 1024,
      })

      totalTokens += llmResponse.tokensUsed.total

      // 응답 파싱
      const parsed = this.parseResponse(llmResponse.content)

      if (parsed.type === 'thought') {
        // Thought 기록
        steps.push({
          step: steps.length + 1,
          type: 'thought',
          content: parsed.content,
          timestamp: new Date().toISOString(),
        })

        conversationContext += `\n[THOUGHT]\n${parsed.content}\n\nAssistant:`

      } else if (parsed.type === 'action' && parsed.tool) {
        // Action 기록
        steps.push({
          step: steps.length + 1,
          type: 'action',
          content: `도구 호출: ${parsed.tool}`,
          tool: parsed.tool,
          toolInput: parsed.toolInput,
          timestamp: new Date().toISOString(),
        })

        // 도구 실행
        const toolOutput = await this.executeTool(parsed.tool, parsed.toolInput || {})

        // Observation 기록
        steps.push({
          step: steps.length + 1,
          type: 'observation',
          content: toolOutput,
          tool: parsed.tool,
          toolOutput,
          timestamp: new Date().toISOString(),
        })

        conversationContext += `\n[ACTION]\ntool: ${parsed.tool}\ninput: ${JSON.stringify(parsed.toolInput)}\n\n[OBSERVATION]\n${toolOutput}\n\nAssistant:`

      } else if (parsed.type === 'final') {
        // Final Answer
        steps.push({
          step: steps.length + 1,
          type: 'final',
          content: parsed.content,
          timestamp: new Date().toISOString(),
        })

        // 세션 히스토리 업데이트
        session.history.push({ role: 'user', content: prompt })
        session.history.push({ role: 'assistant', content: parsed.content })

        return {
          success: true,
          response: parsed.content,
          steps,
          tokensUsed: totalTokens,
          processingTime: Date.now() - startTime,
          iterationsUsed: iteration + 1,
        }

      } else {
        // 파싱 실패 - thought로 처리하고 계속
        steps.push({
          step: steps.length + 1,
          type: 'thought',
          content: parsed.content,
          timestamp: new Date().toISOString(),
        })

        conversationContext += `\n${parsed.content}\n\nAssistant:`
      }
    }

    // 최대 반복 초과 - 강제 종료
    const lastStep = steps[steps.length - 1]
    const fallbackResponse = lastStep?.content || '요청을 완료하지 못했습니다.'

    steps.push({
      step: steps.length + 1,
      type: 'final',
      content: `[최대 반복 도달] ${fallbackResponse}`,
      timestamp: new Date().toISOString(),
    })

    return {
      success: true,
      response: fallbackResponse,
      steps,
      tokensUsed: totalTokens,
      processingTime: Date.now() - startTime,
      iterationsUsed: maxIterations,
    }
  }

  /**
   * 세션 가져오기
   */
  getSession(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * 세션 삭제
   */
  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId)
  }

  /**
   * 모든 세션 삭제
   */
  clearAllSessions(): void {
    this.sessions.clear()
  }
}

// 싱글톤 인스턴스
export const ReActAgent = new ReActAgentEngine()

// ============================================================
// 편의 함수
// ============================================================

/**
 * 간단한 에이전트 호출
 */
export async function invokeAgent(
  agentName: string,
  prompt: string,
  options?: {
    tools?: string[]
    maxIterations?: number
    sessionId?: string
  },
): Promise<AgentResult> {
  return ReActAgent.invoke(prompt, {
    name: agentName,
    tools: options?.tools,
    maxIterations: options?.maxIterations || 5,
  }, options?.sessionId)
}
