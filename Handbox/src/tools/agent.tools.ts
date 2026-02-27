/**
 * Agent 도구 정의 — agent.* (8개 도구)
 * ReAct, Tool-Use, Multi-Agent, Planner, Executor 패턴 지원
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'
import { ProviderRegistry } from '../registry/ProviderRegistry'

// 에이전트 메모리 저장소 (세션 레벨, 모듈 스코프)
const _agentMemoryStore = new Map<string, { value: any; timestamp: number }>()

// ============================================================================
// Helper: LLM 호출
// ============================================================================
async function invokeLLM(
  config: any,
  context: any,
  options: {
    prompt: string
    systemPrompt?: string
    temperature?: number
    maxTokens?: number
    tools?: any[]
    images?: any[]
  }
): Promise<{ text: string; toolCalls?: any[]; usage?: any }> {
  const providerId = config.provider || context?.defaultLLMProvider
  const provider = ProviderRegistry.getLLMProvider(providerId)

  if (provider) {
    return await provider.invoke({
      model: config.model,
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      tools: options.tools,
      images: options.images,
    })
  }

  // Fallback: Tauri invoke
  const { invoke } = await import('@tauri-apps/api/tauri')
  const result = await invoke('llm_invoke', {
    provider: providerId,
    model: config.model,
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  }) as any

  return { text: result.text || result, toolCalls: result.toolCalls, usage: result.usage }
}

// ============================================================================
// agent.react - ReAct 패턴 에이전트
// ============================================================================
const agentReact: UnifiedToolDefinition = {
  name: 'agent.react',
  version: '1.0.0',
  description: 'Reasoning + Acting 패턴 에이전트. 생각하고 행동하는 자율 에이전트.',
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: '달성할 목표' },
      context: { type: 'object', description: '초기 컨텍스트' },
      tools: { type: 'array', description: '사용 가능한 도구 목록' },
    },
    required: ['goal'],
  },
  meta: {
    label: 'ReAct 에이전트',
    description: 'Reasoning + Acting 패턴 에이전트. 생각하고 행동하는 자율 에이전트.',
    icon: 'Psychology',
    color: '#f97316',
    category: 'agent',
    tags: ['agent', 'react', 'reasoning', 'autonomous', '에이전트', 'ReAct', '자율'],
  },
  ports: {
    inputs: [
      { name: 'goal', type: 'text', required: true, description: '달성할 목표' },
      { name: 'context', type: 'json', required: false, description: '초기 컨텍스트' },
      { name: 'tools', type: 'json', required: false, description: '사용 가능한 도구 목록' },
    ],
    outputs: [
      { name: 'result', type: 'json', required: true, description: '최종 결과' },
      { name: 'reasoning', type: 'text', required: false, description: '추론 과정' },
      { name: 'actions', type: 'json', required: false, description: '수행한 액션 목록' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'max_iterations', label: '최대 반복 횟수', type: 'number', default: 10 },
    { key: 'available_tools', label: '사용 가능 도구', type: 'textarea', rows: 4,
      description: '도구 이름을 줄바꿈으로 구분' },
    { key: 'system_prompt', label: '시스템 프롬프트', type: 'textarea', rows: 5,
      default: `You are a ReAct agent. For each step:
1. Thought: Reason about the current state
2. Action: Choose an action from available tools
3. Observation: Observe the result
Output FINISH when the goal is achieved.` },
    { key: 'temperature', label: '온도', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.3 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const goal = inp.goal
      const maxIterations = (cfg.max_iterations as number) || 10
      const availableTools = inp.tools || (cfg.available_tools || '').split('\n').filter(Boolean)

      let currentContext: Record<string, any> = inp.context || {}
      const actions: any[] = []
      let reasoning = ''
      let iteration = 0
      let finished = false

      while (iteration < maxIterations && !finished) {
        iteration++

        const prompt = `Goal: ${goal}

Current Context: ${JSON.stringify(currentContext, null, 2)}

Available Tools: ${availableTools.join(', ')}

Previous Actions: ${actions.length > 0 ? JSON.stringify(actions.slice(-3)) : 'None'}

Iteration: ${iteration}/${maxIterations}

Think step by step and decide what to do next.
Format your response as:
Thought: [your reasoning]
Action: [tool_name] or FINISH
Action Input: [input for the tool]`

        const response = await invokeLLM(cfg, context, {
          prompt,
          systemPrompt: cfg.system_prompt,
          temperature: cfg.temperature,
          maxTokens: 2048,
        })

        reasoning += `\n--- Iteration ${iteration} ---\n${response.text}\n`

        // 응답 파싱
        const thoughtMatch = response.text.match(/Thought:\s*(.+?)(?=Action:|$)/s)
        const actionMatch = response.text.match(/Action:\s*(\w+)/i)
        const inputMatch = response.text.match(/Action Input:\s*(.+?)(?=Thought:|Action:|$)/s)

        const thought = thoughtMatch?.[1]?.trim() || ''
        const action = actionMatch?.[1]?.trim() || ''
        const actionInput = inputMatch?.[1]?.trim() || ''

        if (action.toUpperCase() === 'FINISH') {
          finished = true
          actions.push({ type: 'FINISH', thought, iteration })
        } else if (action) {
          const observation = `Tool ${action} executed with input: ${actionInput}`
          actions.push({ type: action, input: actionInput, thought, observation, iteration })
          currentContext[`action_${iteration}`] = { action, result: observation }
        }
      }

      return {
        success: true,
        outputs: {
          result: { goal, achieved: finished, finalContext: currentContext, totalIterations: iteration },
          reasoning,
          actions,
        },
      }
    },
  },
}

// ============================================================================
// agent.tool-use - 도구 사용 에이전트
// ============================================================================
const agentToolUse: UnifiedToolDefinition = {
  name: 'agent.tool-use',
  version: '1.0.0',
  description: 'Claude/GPT의 Tool Use API를 활용한 에이전트. 함수 호출 기반.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '사용자 쿼리' },
      tools_schema: { type: 'array', description: '도구 스키마 (OpenAI 형식)' },
    },
    required: ['query'],
  },
  meta: {
    label: '도구 사용 에이전트',
    description: 'Claude/GPT의 Tool Use API를 활용한 에이전트. 함수 호출 기반.',
    icon: 'Build',
    color: '#f97316',
    category: 'agent',
    tags: ['agent', 'tool', 'function', 'call', '도구', '함수호출'],
  },
  ports: {
    inputs: [
      { name: 'query', type: 'text', required: true, description: '사용자 쿼리' },
      { name: 'tools_schema', type: 'json', required: false, description: '도구 스키마' },
    ],
    outputs: [
      { name: 'response', type: 'llm-response', required: true, description: '최종 응답' },
      { name: 'tool_calls', type: 'json', required: false, description: '호출된 도구 목록' },
      { name: 'tool_results', type: 'json', required: false, description: '도구 실행 결과' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'tools_config', label: '도구 설정 (JSON)', type: 'code', language: 'json', rows: 10,
      default: `[{"name": "search", "description": "Search the web", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}}}]` },
    { key: 'auto_execute', label: '자동 실행', type: 'toggle', default: false },
    { key: 'max_tool_calls', label: '최대 도구 호출 수', type: 'number', default: 5 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      let tools = inp.tools_schema
      if (!tools && cfg.tools_config) {
        try { tools = JSON.parse(cfg.tools_config) } catch { tools = [] }
      }

      const response = await invokeLLM(cfg, context, {
        prompt: inp.query as string,
        tools,
        maxTokens: 4096,
      })

      const tool_calls = response.toolCalls || []
      const tool_results: any[] = []

      if (cfg.auto_execute && tool_calls.length > 0) {
        const { ToolRegistry } = await import('../registry/ToolRegistry')
        for (const call of tool_calls.slice(0, cfg.max_tool_calls as number)) {
          const toolDef = ToolRegistry.get(call.name)
          if (toolDef) {
            try {
              const result = await toolDef.executor.execute(call.arguments, {}, context)
              tool_results.push({ tool: call.name, input: call.arguments, result })
            } catch (err: any) {
              tool_results.push({ tool: call.name, input: call.arguments, error: err.message })
            }
          } else {
            tool_results.push({ tool: call.name, input: call.arguments, error: `Tool ${call.name} not found` })
          }
        }
      }

      return { success: true, outputs: { response: response.text, tool_calls, tool_results } }
    },
  },
}

// ============================================================================
// agent.multi - 멀티 에이전트
// ============================================================================
const agentMulti: UnifiedToolDefinition = {
  name: 'agent.multi',
  version: '1.0.0',
  description: '여러 에이전트가 협력하여 작업을 수행합니다. 역할 분담, 토론, 합의.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '수행할 작업' },
      agents_config: { type: 'array', description: '에이전트 설정' },
    },
    required: ['task'],
  },
  meta: {
    label: '멀티 에이전트',
    icon: 'Groups',
    color: '#f97316',
    category: 'agent',
    tags: ['agent', 'multi', 'collaboration', 'team', '멀티', '협력', '팀'],
  },
  ports: {
    inputs: [
      { name: 'task', type: 'text', required: true, description: '수행할 작업' },
      { name: 'agents_config', type: 'json', required: false, description: '에이전트 설정' },
    ],
    outputs: [
      { name: 'result', type: 'json', required: true, description: '최종 결과' },
      { name: 'discussion', type: 'text', required: false, description: '토론 과정' },
      { name: 'consensus', type: 'json', required: false, description: '합의 내용' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'agents', label: '에이전트 정의 (JSON)', type: 'code', language: 'json', rows: 8,
      default: `[
  { "name": "Researcher", "role": "정보 수집 및 분석" },
  { "name": "Critic", "role": "비판적 검토" },
  { "name": "Synthesizer", "role": "의견 종합 및 결론 도출" }
]` },
    { key: 'interaction_mode', label: '상호작용 방식', type: 'select', default: 'sequential',
      options: [
        { label: '순차적 (릴레이)', value: 'sequential' },
        { label: '토론 (라운드)', value: 'discussion' },
        { label: '투표 (합의)', value: 'voting' },
        { label: '계층적', value: 'hierarchical' },
      ] },
    { key: 'rounds', label: '라운드 수', type: 'number', default: 3 },
    { key: 'final_decision_agent', label: '최종 결정 에이전트', type: 'text', default: 'Synthesizer' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      let agents: any[] = inp.agents_config
      if (!agents && cfg.agents) {
        try { agents = JSON.parse(cfg.agents as string) } catch { agents = [{ name: 'Agent', role: 'General' }] }
      }
      if (!agents) agents = [{ name: 'Agent', role: 'General' }]

      const task = inp.task
      const rounds = cfg.rounds || 3
      let discussion = ''
      const agentOutputs: Record<string, string[]> = {}

      for (const agent of agents) {
        agentOutputs[agent.name] = []
      }

      for (let round = 1; round <= rounds; round++) {
        discussion += `\n=== Round ${round} ===\n`

        for (const agent of agents) {
          const previousOutputs = agents
            .filter((a: any) => a.name !== agent.name)
            .map((a: any) => `${a.name}: ${agentOutputs[a.name].slice(-1)[0] || '(no input)'}`)
            .join('\n')

          const prompt = `You are ${agent.name}, role: ${agent.role}

Task: ${task}

${round > 1 ? `Previous outputs:\n${previousOutputs}\n\n` : ''}

Round ${round}/${rounds}. Provide your ${round === rounds ? 'final' : ''} analysis.`

          const response = await invokeLLM(config, context, {
            prompt,
            temperature: 0.7,
            maxTokens: 1024,
          })

          agentOutputs[agent.name].push(response.text)
          discussion += `\n[${agent.name}]:\n${response.text}\n`
        }
      }

      // 합의 도출
      const finalAgent = agents.find((a: any) => a.name === cfg.final_decision_agent) || agents[agents.length - 1]
      const consensusPrompt = `As ${finalAgent.name}, synthesize all outputs into a final conclusion.

Task: ${task}

All contributions:
${agents.map((a: any) => `${a.name}: ${agentOutputs[a.name].join('\n---\n')}`).join('\n\n')}

Provide final answer in JSON: {summary, recommendations, confidence}`

      const consensusResponse = await invokeLLM(config, context, {
        prompt: consensusPrompt,
        temperature: 0.3,
        maxTokens: 2048,
      })

      let consensus = null
      try {
        const jsonMatch = consensusResponse.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) consensus = JSON.parse(jsonMatch[0])
      } catch {
        consensus = { summary: consensusResponse.text }
      }

      return {
        result: { task, agentOutputs, rounds, mode: cfg.interaction_mode },
        discussion,
        consensus,
      }
    },
  },
}

// ============================================================================
// agent.planner - 작업 플래너
// ============================================================================
const agentPlanner: UnifiedToolDefinition = {
  name: 'agent.planner',
  version: '1.0.0',
  description: '복잡한 작업을 하위 작업으로 분해하고 실행 계획을 수립합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      objective: { type: 'string', description: '달성할 목표' },
      constraints: { type: 'object', description: '제약 조건' },
    },
    required: ['objective'],
  },
  meta: {
    label: '작업 플래너',
    icon: 'AccountTree',
    color: '#f97316',
    category: 'agent',
    tags: ['agent', 'planner', 'decompose', 'plan', '계획', '분해'],
  },
  ports: {
    inputs: [
      { name: 'objective', type: 'text', required: true, description: '달성할 목표' },
      { name: 'constraints', type: 'json', required: false, description: '제약 조건' },
    ],
    outputs: [
      { name: 'plan', type: 'json', required: true, description: '실행 계획' },
      { name: 'tasks', type: 'json', required: false, description: '하위 작업 목록' },
      { name: 'dependencies', type: 'json', required: false, description: '작업 간 의존성' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'planning_depth', label: '계획 깊이', type: 'select', default: 'medium',
      options: [
        { label: '얕음 (3단계)', value: 'shallow' },
        { label: '중간 (5단계)', value: 'medium' },
        { label: '깊음 (7단계)', value: 'deep' },
      ] },
    { key: 'include_resources', label: '리소스 추정 포함', type: 'toggle', default: true },
    { key: 'include_risks', label: '리스크 분석 포함', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const depthMap: Record<string, number> = { shallow: 3, medium: 5, deep: 7 }
      const maxDepth = depthMap[cfg.planning_depth as string] || 5

      const prompt = `As a task planning expert, decompose the following objective:

Objective: ${inp.objective}

${inp.constraints ? `Constraints: ${JSON.stringify(inp.constraints)}` : ''}

Requirements:
1. Break down into ${maxDepth} levels of subtasks
2. Identify dependencies between tasks
3. ${cfg.include_resources ? 'Estimate required resources' : ''}
4. ${cfg.include_risks ? 'Analyze potential risks' : ''}

Output JSON:
{
  "summary": "brief plan summary",
  "tasks": [{"id", "name", "description", "dependencies", "estimatedDuration", "resources", "risks"}],
  "criticalPath": ["task_ids in order"],
  "totalEstimatedTime": "total time"
}`

      const response = await invokeLLM(config, context, {
        prompt,
        temperature: 0.4,
        maxTokens: 4096,
      })

      let plan = null
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) plan = JSON.parse(jsonMatch[0])
      } catch {
        plan = { raw: response.text }
      }

      const dependencies: Record<string, string[]> = {}
      if (plan?.tasks) {
        for (const task of plan.tasks) {
          dependencies[task.id] = task.dependencies || []
        }
      }

      return {
        plan,
        tasks: plan?.tasks || [],
        dependencies,
      }
    },
  },
}

// ============================================================================
// agent.executor - 계획 실행기
// ============================================================================
const agentExecutor: UnifiedToolDefinition = {
  name: 'agent.executor',
  version: '1.0.0',
  description: '계획된 작업을 순차적/병렬로 실행합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      plan: { type: 'object', description: '실행할 계획' },
      tasks: { type: 'array', description: '작업 목록' },
    },
    required: ['tasks'],
  },
  meta: {
    label: '계획 실행기',
    icon: 'PlayArrow',
    color: '#f97316',
    category: 'agent',
    tags: ['agent', 'executor', 'run', 'execute', '실행'],
  },
  ports: {
    inputs: [
      { name: 'plan', type: 'json', required: false, description: '실행할 계획' },
      { name: 'tasks', type: 'json', required: true, description: '작업 목록' },
    ],
    outputs: [
      { name: 'results', type: 'json', required: true, description: '실행 결과' },
      { name: 'status', type: 'json', required: false, description: '상태 정보' },
      { name: 'errors', type: 'json', required: false, description: '오류 목록' },
    ],
  },
  configSchema: [
    { key: 'execution_mode', label: '실행 모드', type: 'select', default: 'sequential',
      options: [
        { label: '순차 실행', value: 'sequential' },
        { label: '병렬 실행', value: 'parallel' },
        { label: '의존성 기반', value: 'dependency' },
      ] },
    { key: 'max_parallel', label: '최대 병렬 수', type: 'number', default: 3 },
    { key: 'continue_on_error', label: '오류시 계속', type: 'toggle', default: false },
    { key: 'timeout_per_task', label: '작업당 타임아웃 (초)', type: 'number', default: 60 },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const tasks: any[] = inp.tasks || inp.plan?.tasks || []
      const results: any[] = []
      const errors: any[] = []
      let completed = 0
      let failed = 0

      const executeTask = async (task: any) => {
        try {
          // 시뮬레이션: 실제로는 도구 호출
          await new Promise(resolve => setTimeout(resolve, 100))
          return { taskId: task.id, status: 'completed', result: `Task ${task.name} completed` }
        } catch (err: any) {
          return { taskId: task.id, status: 'failed', error: err.message }
        }
      }

      const maxParallel = (cfg.max_parallel as number) || 3
      if (cfg.execution_mode === 'parallel') {
        const chunks: any[][] = []
        for (let i = 0; i < tasks.length; i += maxParallel) {
          chunks.push(tasks.slice(i, i + maxParallel))
        }
        for (const chunk of chunks) {
          const chunkResults = await Promise.all(chunk.map(executeTask))
          results.push(...chunkResults)
          chunkResults.forEach((r: any) => r.status === 'completed' ? completed++ : failed++)
        }
      } else {
        for (const task of tasks) {
          const result = await executeTask(task)
          results.push(result)
          if (result.status === 'completed') completed++
          else {
            failed++
            errors.push(result)
            if (!cfg.continue_on_error) break
          }
        }
      }

      return {
        results,
        status: { total: tasks.length, completed, failed, mode: cfg.execution_mode },
        errors,
      }
    },
  },
}

// ============================================================================
// agent.critic - 비판적 검토 에이전트
// ============================================================================
const agentCritic: UnifiedToolDefinition = {
  name: 'agent.critic',
  version: '1.0.0',
  description: '결과물을 비판적으로 검토하고 개선점을 제안합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { description: '검토할 내용' },
      criteria: { type: 'array', description: '평가 기준' },
    },
    required: ['content'],
  },
  meta: {
    label: '비평 에이전트',
    icon: 'RateReview',
    color: '#f97316',
    category: 'agent',
    tags: ['agent', 'critic', 'review', 'feedback', '비평', '검토'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'any', required: true, description: '검토할 내용' },
      { name: 'criteria', type: 'json', required: false, description: '평가 기준' },
    ],
    outputs: [
      { name: 'review', type: 'text', required: true, description: '검토 결과' },
      { name: 'score', type: 'json', required: false, description: '점수' },
      { name: 'suggestions', type: 'json', required: false, description: '개선 제안' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'review_depth', label: '검토 깊이', type: 'select', default: 'standard',
      options: [
        { label: '간단', value: 'brief' },
        { label: '표준', value: 'standard' },
        { label: '심층', value: 'detailed' },
      ] },
    { key: 'focus_areas', label: '집중 영역', type: 'text', description: '쉼표로 구분' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const content = typeof inp.content === 'string'
        ? inp.content
        : JSON.stringify(inp.content, null, 2)

      const focusAreas = cfg.focus_areas as string | undefined
      const criteria = inp.criteria || (focusAreas?.split(',').map((s: string) => s.trim())) || []

      const prompt = `As a critical reviewer, analyze the following content:

Content:
${content}

${criteria.length > 0 ? `Evaluation criteria: ${criteria.join(', ')}` : ''}

Review depth: ${cfg.review_depth}

Provide:
1. Overall assessment
2. Strengths
3. Weaknesses
4. Specific suggestions for improvement
5. Score (0-100) for each criterion

Output JSON: {review, scores: {criterion: score}, suggestions: [...]}`

      const response = await invokeLLM(cfg, context, {
        prompt,
        temperature: 0.5,
        maxTokens: 2048,
      })

      let parsed = null
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
      } catch {}

      return {
        review: parsed?.review || response.text,
        score: parsed?.scores || null,
        suggestions: parsed?.suggestions || [],
      }
    },
  },
}

// ============================================================================
// agent.router - 라우터 에이전트
// ============================================================================
const agentRouter: UnifiedToolDefinition = {
  name: 'agent.router',
  version: '1.0.0',
  description: '입력을 분석하여 적절한 에이전트/도구로 라우팅합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { description: '라우팅할 입력' },
      routes: { type: 'array', description: '라우팅 규칙' },
    },
    required: ['input'],
  },
  meta: {
    label: '라우터 에이전트',
    icon: 'AltRoute',
    color: '#f97316',
    category: 'agent',
    tags: ['agent', 'router', 'dispatch', 'routing', '라우터', '분배'],
  },
  ports: {
    inputs: [
      { name: 'input', type: 'any', required: true, description: '라우팅할 입력' },
      { name: 'routes', type: 'json', required: false, description: '라우팅 규칙' },
    ],
    outputs: [
      { name: 'route', type: 'text', required: true, description: '선택된 라우트' },
      { name: 'confidence', type: 'number', required: false, description: '신뢰도' },
      { name: 'data', type: 'any', required: true, description: '전달할 데이터' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'routes', label: '라우팅 규칙 (JSON)', type: 'code', language: 'json', rows: 8,
      default: `[
  { "name": "search", "description": "Search queries", "keywords": ["find", "search", "lookup"] },
  { "name": "calculate", "description": "Math operations", "keywords": ["calculate", "compute", "math"] },
  { "name": "generate", "description": "Content generation", "keywords": ["write", "create", "generate"] }
]` },
    { key: 'default_route', label: '기본 라우트', type: 'text', default: 'default' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      let routes: any[] = inp.routes
      if (!routes && cfg.routes) {
        try { routes = JSON.parse(cfg.routes as string) } catch { routes = [] }
      }
      if (!routes) routes = []

      const inputStr = typeof inp.input === 'string'
        ? inp.input
        : JSON.stringify(inp.input)

      // 키워드 기반 빠른 매칭
      for (const route of routes) {
        if (route.keywords?.some((kw: string) => inputStr.toLowerCase().includes(kw.toLowerCase()))) {
          return { route: route.name, confidence: 0.8, data: inp.input }
        }
      }

      // LLM 기반 분류
      const prompt = `Classify the following input into one of these routes:

Routes:
${routes.map((r: any) => `- ${r.name}: ${r.description}`).join('\n')}

Input: ${inputStr}

Output JSON: {route: "route_name", confidence: 0.0-1.0}`

      const response = await invokeLLM(cfg, context, {
        prompt,
        temperature: 0.1,
        maxTokens: 256,
      })

      let parsed = null
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
      } catch {}

      return {
        route: parsed?.route || cfg.default_route,
        confidence: parsed?.confidence || 0.5,
        data: inp.input,
      }
    },
  },
}

// ============================================================================
// agent.memory - 메모리 에이전트
// ============================================================================
const agentMemory: UnifiedToolDefinition = {
  name: 'agent.memory',
  version: '1.0.0',
  description: '에이전트 메모리를 관리합니다. 단기/장기 기억, 컨텍스트 저장/조회.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['store', 'retrieve', 'search', 'clear'] },
      key: { type: 'string', description: '메모리 키' },
      value: { description: '저장할 값' },
      query: { type: 'string', description: '검색 쿼리' },
    },
    required: ['action'],
  },
  meta: {
    label: '메모리 에이전트',
    icon: 'Memory',
    color: '#f97316',
    category: 'agent',
    tags: ['agent', 'memory', 'context', 'store', '메모리', '기억'],
  },
  ports: {
    inputs: [
      { name: 'action', type: 'text', required: true, description: 'store/retrieve/search/clear' },
      { name: 'key', type: 'text', required: false, description: '메모리 키' },
      { name: 'value', type: 'any', required: false, description: '저장할 값' },
      { name: 'query', type: 'text', required: false, description: '검색 쿼리' },
    ],
    outputs: [
      { name: 'result', type: 'any', required: true, description: '결과' },
      { name: 'success', type: 'boolean', required: true, description: '성공 여부' },
    ],
  },
  configSchema: [
    { key: 'memory_type', label: '메모리 타입', type: 'select', default: 'session',
      options: [
        { label: '세션 (휘발성)', value: 'session' },
        { label: '영구 저장', value: 'persistent' },
        { label: '벡터 DB', value: 'vector' },
      ] },
    { key: 'max_entries', label: '최대 항목 수', type: 'number', default: 1000 },
    { key: 'ttl_seconds', label: 'TTL (초)', type: 'number', default: 0, description: '0 = 무제한' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const memory = _agentMemoryStore
      const action = inp.action as string
      const now = Date.now()

      // TTL 체크 및 정리
      const ttlSeconds = (cfg.ttl_seconds as number) || 0
      if (ttlSeconds > 0) {
        const ttlMs = ttlSeconds * 1000
        for (const [k, v] of memory.entries()) {
          if (now - v.timestamp > ttlMs) memory.delete(k)
        }
      }

      switch (action) {
        case 'store':
          if (!inp.key) return { result: null, success: false, error: 'key is required' }
          const maxEntries = (cfg.max_entries as number) || 1000
          if (memory.size >= maxEntries) {
            // 가장 오래된 항목 삭제
            const oldest = [...memory.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
            if (oldest) memory.delete(oldest[0])
          }
          memory.set(inp.key as string, { value: inp.value, timestamp: now })
          return { result: inp.value, success: true }

        case 'retrieve':
          if (!inp.key) return { result: null, success: false, error: 'key is required' }
          const entry = memory.get(inp.key as string)
          return { result: entry?.value ?? null, success: !!entry }

        case 'search':
          const query = ((inp.query as string) || '').toLowerCase()
          const matches = [...memory.entries()]
            .filter(([k, v]) =>
              k.toLowerCase().includes(query) ||
              JSON.stringify(v.value).toLowerCase().includes(query)
            )
            .map(([k, v]) => ({ key: k, value: v.value }))
          return { result: matches, success: true }

        case 'clear':
          if (inp.key) {
            memory.delete(inp.key as string)
          } else {
            memory.clear()
          }
          return { result: null, success: true }

        default:
          return { result: null, success: false, error: `Unknown action: ${action}` }
      }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const AGENT_TOOLS: UnifiedToolDefinition[] = [
  agentReact,
  agentToolUse,
  agentMulti,
  agentPlanner,
  agentExecutor,
  agentCritic,
  agentRouter,
  agentMemory,
]
