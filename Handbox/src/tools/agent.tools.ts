/**
 * Agent 도구 노드 정의
 * ReAct, Tool-Use, Multi-Agent 패턴 지원
 */
import type { NodeDefinition } from '../registry/NodeDefinition'
import { ProviderRegistry } from '../registry/ProviderRegistry'
import { NodeRegistry } from '../registry/NodeRegistry'

export const AgentReactDefinition: NodeDefinition = {
  type: 'agent.react',
  category: 'ai',
  meta: {
    label: 'ReAct 에이전트',
    description: 'Reasoning + Acting 패턴 에이전트. 추론하고 행동하는 자율 에이전트.',
    icon: 'Psychology',
    color: '#f97316',
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
      { name: 'iterations', type: 'json', required: false, description: '반복 횟수' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'max_iterations', label: '최대 반복 횟수', type: 'number', default: 10,
      description: '무한 루프 방지' },
    { key: 'available_tools', label: '사용 가능 도구', type: 'textarea', rows: 4,
      description: '도구 이름을 줄바꿈으로 구분. 예:\nsearch\ncalculate\nread_file' },
    { key: 'system_prompt', label: '시스템 프롬프트', type: 'textarea', rows: 5,
      default: `You are a ReAct agent. For each step:
1. Thought: Reason about the current state and what to do next
2. Action: Choose an action from available tools
3. Observation: Observe the result
Repeat until the goal is achieved. Output FINISH when done.` },
    { key: 'temperature', label: '온도', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.3 },
    { key: 'verbose', label: '상세 로그', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const provider = ProviderRegistry.getLLMProvider(config.provider || context.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      const goal = input.goal
      const maxIterations = config.max_iterations || 10
      const availableTools = input.tools || (config.available_tools || '').split('\n').filter(Boolean)

      let currentContext = input.context || {}
      const actions: any[] = []
      let reasoning = ''
      let iteration = 0
      let finished = false

      // ReAct 루프
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
Action Input: [input for the tool if any]`

        const response = await provider.invoke({
          model: config.model,
          prompt,
          systemPrompt: config.system_prompt,
          temperature: config.temperature,
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
          // 도구 실행 시뮬레이션 (실제로는 도구 호출)
          const observation = `Tool ${action} executed with input: ${actionInput}`
          actions.push({
            type: action,
            input: actionInput,
            thought,
            observation,
            iteration,
          })
          currentContext[`action_${iteration}`] = { action, result: observation }
        }
      }

      return {
        result: {
          goal,
          achieved: finished,
          finalContext: currentContext,
          totalIterations: iteration,
        },
        reasoning,
        actions,
        iterations: iteration,
      }
    },
  },
}

export const AgentToolUseDefinition: NodeDefinition = {
  type: 'agent.tool-use',
  category: 'ai',
  meta: {
    label: '도구 사용 에이전트',
    description: 'Claude/GPT의 Tool Use 기능을 활용한 에이전트. 함수 호출 기반.',
    icon: 'Build',
    color: '#f97316',
    tags: ['agent', 'tool', 'function', 'call', '도구', '함수호출'],
  },
  ports: {
    inputs: [
      { name: 'query', type: 'text', required: true, description: '사용자 쿼리' },
      { name: 'tools_schema', type: 'json', required: false, description: '도구 스키마 (OpenAI 형식)' },
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
      description: 'OpenAI function calling 형식의 도구 정의',
      default: `[
  {
    "name": "search",
    "description": "Search the web",
    "parameters": {
      "type": "object",
      "properties": {
        "query": { "type": "string" }
      }
    }
  }
]` },
    { key: 'auto_execute', label: '자동 실행', type: 'toggle', default: false,
      description: '도구 호출 자동 실행 (Handbox 노드 연결)' },
    { key: 'max_tool_calls', label: '최대 도구 호출 수', type: 'number', default: 5 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const provider = ProviderRegistry.getLLMProvider(config.provider || context.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      let tools = input.tools_schema
      if (!tools && config.tools_config) {
        try {
          tools = JSON.parse(config.tools_config)
        } catch { tools = [] }
      }

      // Tool Use API 호출
      const response = await provider.invoke({
        model: config.model,
        prompt: input.query,
        tools,
        maxTokens: 4096,
      })

      const tool_calls = response.toolCalls || []
      const tool_results: any[] = []

      // 자동 실행
      if (config.auto_execute && tool_calls.length > 0) {
        for (const call of tool_calls.slice(0, config.max_tool_calls)) {
          // Handbox 노드 매핑 시도
          const nodeType = NodeRegistry.findByName(call.name)
          if (nodeType) {
            // 노드 실행 시뮬레이션
            tool_results.push({
              tool: call.name,
              input: call.arguments,
              result: `[Executed ${call.name} with args: ${JSON.stringify(call.arguments)}]`,
            })
          } else {
            tool_results.push({
              tool: call.name,
              input: call.arguments,
              error: `Tool ${call.name} not found in Handbox`,
            })
          }
        }
      }

      return {
        response: response.text,
        tool_calls,
        tool_results,
      }
    },
  },
}

export const AgentMultiDefinition: NodeDefinition = {
  type: 'agent.multi',
  category: 'ai',
  meta: {
    label: '멀티 에이전트',
    description: '여러 에이전트가 협력하여 작업을 수행합니다. 역할 분담, 토론, 합의.',
    icon: 'Groups',
    color: '#f97316',
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
    { key: 'agents', label: '에이전트 정의 (JSON)', type: 'code', language: 'json', rows: 10,
      default: `[
  { "name": "Researcher", "role": "정보 수집 및 분석 담당" },
  { "name": "Critic", "role": "비판적 검토 및 문제점 지적" },
  { "name": "Synthesizer", "role": "의견 종합 및 결론 도출" }
]` },
    { key: 'interaction_mode', label: '상호작용 방식', type: 'select', default: 'sequential',
      options: [
        { label: '순차적 (릴레이)', value: 'sequential' },
        { label: '토론 (라운드)', value: 'discussion' },
        { label: '투표 (합의)', value: 'voting' },
        { label: '계층적 (상급자 결정)', value: 'hierarchical' },
      ] },
    { key: 'rounds', label: '상호작용 라운드 수', type: 'number', default: 3 },
    { key: 'final_decision_agent', label: '최종 결정 에이전트', type: 'text', default: 'Synthesizer' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const provider = ProviderRegistry.getLLMProvider(config.provider || context.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      let agents = input.agents_config
      if (!agents && config.agents) {
        try {
          agents = JSON.parse(config.agents)
        } catch { agents = [{ name: 'Agent', role: 'General purpose agent' }] }
      }

      const task = input.task
      const rounds = config.rounds || 3
      let discussion = ''
      const agentOutputs: Record<string, string[]> = {}

      // 에이전트별 초기화
      for (const agent of agents) {
        agentOutputs[agent.name] = []
      }

      // 상호작용 실행
      for (let round = 1; round <= rounds; round++) {
        discussion += `\n=== Round ${round} ===\n`

        for (const agent of agents) {
          const previousOutputs = agents
            .filter((a: any) => a.name !== agent.name)
            .map((a: any) => `${a.name}: ${agentOutputs[a.name].slice(-1)[0] || '(no input yet)'}`)
            .join('\n')

          const prompt = `You are ${agent.name}, an AI agent with the following role: ${agent.role}

Task: ${task}

${round > 1 ? `Previous round outputs from other agents:\n${previousOutputs}\n\n` : ''}

Round ${round}/${rounds}. Provide your ${round === rounds ? 'final' : ''} analysis and contribution.`

          const response = await provider.invoke({
            model: config.model,
            prompt,
            temperature: 0.7,
            maxTokens: 1024,
          })

          agentOutputs[agent.name].push(response.text)
          discussion += `\n[${agent.name}]:\n${response.text}\n`
        }
      }

      // 최종 합의 도출
      const finalAgent = agents.find((a: any) => a.name === config.final_decision_agent) || agents[agents.length - 1]
      const consensusPrompt = `As ${finalAgent.name}, synthesize all agent outputs into a final conclusion.

Task: ${task}

All agent contributions:
${agents.map((a: any) => `${a.name}: ${agentOutputs[a.name].join('\n---\n')}`).join('\n\n')}

Provide a structured final answer in JSON format with keys: summary, recommendations, confidence.`

      const consensusResponse = await provider.invoke({
        model: config.model,
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
        result: {
          task,
          agentOutputs,
          rounds,
          mode: config.interaction_mode,
        },
        discussion,
        consensus,
      }
    },
  },
}

export const AgentPlannerDefinition: NodeDefinition = {
  type: 'agent.planner',
  category: 'ai',
  meta: {
    label: '작업 플래너',
    description: '복잡한 작업을 하위 작업으로 분해하고 실행 계획을 수립합니다.',
    icon: 'AccountTree',
    color: '#f97316',
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
      { name: 'timeline', type: 'json', required: false, description: '예상 타임라인' },
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
      const provider = ProviderRegistry.getLLMProvider(config.provider || context.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      const depthMap: Record<string, number> = { shallow: 3, medium: 5, deep: 7 }
      const maxDepth = depthMap[config.planning_depth] || 5

      const prompt = `As a task planning expert, decompose the following objective into a detailed execution plan.

Objective: ${input.objective}

${input.constraints ? `Constraints: ${JSON.stringify(input.constraints)}` : ''}

Requirements:
1. Break down into ${maxDepth} levels of subtasks
2. Identify dependencies between tasks
3. ${config.include_resources ? 'Estimate required resources' : ''}
4. ${config.include_risks ? 'Analyze potential risks' : ''}

Output JSON format:
{
  "summary": "brief plan summary",
  "tasks": [
    {
      "id": "task_1",
      "name": "task name",
      "description": "what to do",
      "dependencies": ["task_id"],
      "estimatedDuration": "time estimate",
      "resources": ["required resources"],
      "risks": ["potential risks"]
    }
  ],
  "criticalPath": ["task_ids in order"],
  "totalEstimatedTime": "total time"
}`

      const response = await provider.invoke({
        model: config.model,
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

      // 의존성 그래프 추출
      const dependencies: Record<string, string[]> = {}
      if (plan?.tasks) {
        for (const task of plan.tasks) {
          dependencies[task.id] = task.dependencies || []
        }
      }

      // 타임라인 생성
      const timeline = plan?.tasks?.map((t: any, i: number) => ({
        order: i + 1,
        task: t.name,
        duration: t.estimatedDuration,
        dependencies: t.dependencies,
      }))

      return {
        plan,
        tasks: plan?.tasks || [],
        dependencies,
        timeline,
      }
    },
  },
}

export const AGENT_DEFINITIONS: NodeDefinition[] = [
  AgentReactDefinition,
  AgentToolUseDefinition,
  AgentMultiDefinition,
  AgentPlannerDefinition,
]
