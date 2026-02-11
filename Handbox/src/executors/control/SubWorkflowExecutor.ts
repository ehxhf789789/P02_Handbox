/**
 * SubWorkflow Executor — 서브워크플로우 실행
 *
 * 저장된 워크플로우를 하나의 노드로 캡슐화하여 실행.
 * saved / file / inline 세 가지 소스를 지원.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'
import type { SubWorkflowConfig, WorkflowFile } from '../../types/WorkflowFile'
import { deserializeWorkflow } from '../../utils/workflowSerializer'
import { parseWorkflowJSON } from '../../utils/workflowSerializer'
import { executeWorkflow } from '../../engine/ExecutionEngine'

const executor: NodeExecutor = {
  async execute(
    _input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const subConfig = config as SubWorkflowConfig
    const source = subConfig.source || 'saved'

    // 1. 서브워크플로우 데이터 로드
    let workflowFile: WorkflowFile

    if (source === 'saved' && subConfig.workflowId) {
      // Tauri 백엔드에서 저장된 워크플로우 로드
      const loaded = await invoke<any>('load_workflow', { id: subConfig.workflowId })
      if (!loaded) {
        return { error: `워크플로우 '${subConfig.workflowId}'를 찾을 수 없습니다`, status: '로드 실패' }
      }
      // Tauri v1 포맷 → WorkflowFile 변환
      workflowFile = {
        version: '2.0.0',
        id: loaded.id,
        meta: {
          name: loaded.name,
          description: loaded.description || '',
          createdAt: loaded.created_at,
          updatedAt: loaded.updated_at,
        },
        nodes: (loaded.nodes || []).map((n: any) => ({
          id: n.id,
          type: n.node_type || n.type,
          position: n.position,
          data: n.data || { label: '', config: {} },
        })),
        edges: (loaded.edges || []).map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.source_handle || null,
          targetHandle: e.target_handle || null,
        })),
      }
    } else if (source === 'file' && subConfig.filePath) {
      // 파일에서 워크플로우 로드
      const content = await invoke<string>('read_file_content', { path: subConfig.filePath })
      const { workflow, validation } = parseWorkflowJSON(content)
      if (!validation.valid) {
        return { error: `워크플로우 파일 검증 실패: ${validation.errors.join(', ')}`, status: '검증 실패' }
      }
      workflowFile = workflow
    } else if (source === 'inline' && subConfig.inlineWorkflow) {
      workflowFile = subConfig.inlineWorkflow
    } else {
      return { error: '서브워크플로우 소스가 지정되지 않았습니다', status: '설정 오류' }
    }

    // 2. ReactFlow 노드/엣지로 변환
    const { nodes, edges } = deserializeWorkflow(workflowFile)

    if (nodes.length === 0) {
      return { error: '서브워크플로우에 노드가 없습니다', status: '빈 워크플로우' }
    }

    // 3. 서브워크플로우의 시작 노드에 현재 입력 주입
    // 입력이 없는(source가 없는) 노드가 시작 노드
    const sourceNodeIds = new Set(edges.map(e => e.source))
    const targetNodeIds = new Set(edges.map(e => e.target))
    const startNodeIds = nodes
      .filter(n => !targetNodeIds.has(n.id))
      .map(n => n.id)

    // 종료 노드: 출력 엣지가 없는 노드
    const endNodeIds = nodes
      .filter(n => !sourceNodeIds.has(n.id))
      .map(n => n.id)

    // 4. 서브워크플로우 실행
    const subOutputs: Record<string, Record<string, any>> = {}

    await executeWorkflow({
      nodes,
      edges,
      onNodeStatusChange: (nodeId, status, output) => {
        if (status === 'completed' && output) {
          subOutputs[nodeId] = output
        }
        // 부모 컨텍스트에는 서브워크플로우 진행 상황을 전달하지 않음
      },
      filterDisabled: true,
      abortController: new AbortController(),
    })

    // 5. 종료 노드 출력 수집
    const endOutputs = endNodeIds
      .map(id => subOutputs[id])
      .filter(Boolean)

    if (endOutputs.length === 0) {
      return {
        text: '',
        status: `서브워크플로우 '${workflowFile.meta.name}' 실행 완료 (출력 없음)`,
        _subWorkflowId: workflowFile.id,
        _subWorkflowName: workflowFile.meta.name,
      }
    }

    // 단일 종료 노드면 그대로 반환, 다중이면 병합
    const mergedOutput = endOutputs.length === 1
      ? endOutputs[0]
      : endOutputs.reduce((acc, out, i) => {
          acc[`output_${i}`] = out
          return acc
        }, {} as Record<string, any>)

    return {
      ...mergedOutput,
      text: mergedOutput.text || JSON.stringify(mergedOutput),
      status: `서브워크플로우 '${workflowFile.meta.name}' 실행 완료 (${nodes.length}개 노드)`,
      _subWorkflowId: workflowFile.id,
      _subWorkflowName: workflowFile.meta.name,
      _startNodes: startNodeIds,
      _endNodes: endNodeIds,
    }
  },
}

export const SubWorkflowDefinition: NodeDefinition = {
  type: 'control.sub-workflow',
  category: 'control',
  meta: {
    label: '서브워크플로우',
    description: '저장된 워크플로우를 하나의 노드로 실행합니다',
    icon: 'AccountTree',
    color: '#7c3aed',
    tags: ['서브워크플로우', 'sub-workflow', 'nested', 'composite', '재사용'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'any', required: false, description: '서브워크플로우에 전달할 입력 데이터' },
    ],
    outputs: [
      { name: 'text', type: 'any', required: true, description: '서브워크플로우 출력' },
    ],
  },
  configSchema: [
    { key: 'source', label: '소스 유형', type: 'select', default: 'saved', options: [
      { label: '저장된 워크플로우', value: 'saved' },
      { label: '파일 경로', value: 'file' },
      { label: '인라인', value: 'inline' },
    ]},
    { key: 'workflowId', label: '워크플로우', type: 'text', placeholder: '워크플로우 ID', description: '실행할 저장된 워크플로우 ID', showWhen: { key: 'source', value: 'saved' } },
    { key: 'filePath', label: '파일 경로', type: 'file', accept: '.json', description: '워크플로우 JSON 파일', showWhen: { key: 'source', value: 'file' } },
  ],
  runtime: 'internal',
  executor,
}
