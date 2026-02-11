import { useCallback, useRef, useEffect, memo, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  ReactFlowInstance,
  SelectionMode,
  OnSelectionChangeParams,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Box, Typography, GlobalStyles, Button, CircularProgress } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import { shallow } from 'zustand/shallow'

// React Flow 기본 input/output 노드 스타일 오버라이드
const reactFlowOverrideStyles = (
  <GlobalStyles
    styles={{
      // input/output 노드의 기본 스타일 제거
      '.react-flow__node-input, .react-flow__node-output': {
        background: 'transparent !important',
        border: 'none !important',
        borderRadius: '0 !important',
        padding: '0 !important',
        boxShadow: 'none !important',
        width: 'auto !important',
      },
      // 모든 커스텀 노드의 기본 스타일 제거
      '.react-flow__node': {
        background: 'transparent',
        border: 'none',
        padding: 0,
      },
      // 선택된 노드 스타일
      '.react-flow__node.selected': {
        outline: '2px solid #6366f1 !important',
        outlineOffset: '2px',
        borderRadius: '8px',
      },
      // 기본 핸들 스타일 오버라이드
      '.react-flow__handle': {
        width: '10px !important',
        height: '10px !important',
      },
      // 선택 사각형 스타일
      '.react-flow__selection': {
        background: 'rgba(99, 102, 241, 0.1) !important',
        border: '2px dashed #6366f1 !important',
        borderRadius: '4px !important',
      },
      // 선택 영역 유저셀렉트 프리벤트
      '.react-flow__nodesselection-rect': {
        background: 'rgba(99, 102, 241, 0.08) !important',
        border: '1px solid rgba(99, 102, 241, 0.5) !important',
        borderRadius: '4px !important',
      },
    }}
  />
)
import { useWorkflowStore } from '../../stores/workflowStore'
import { useDragStore } from '../../stores/dragStore'
import GenericNode from '../../nodes/GenericNode'
import InputNode from '../../nodes/InputNode'
import OutputNode from '../../nodes/OutputNode'
import { validateConnection } from '../../engine/ExecutionEngine'

// 그룹 노드 컴포넌트 - 메모이제이션
const GroupNode = memo(function GroupNode({ data }: { data: { label: string; color: string } }) {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -24,
          left: 8,
          px: 1.5,
          py: 0.25,
          borderRadius: 1,
          background: data.color || '#10b981',
          color: 'white',
          fontSize: '0.75rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
{data.label}
      </Box>
    </Box>
  )
})

// 노드 타입 정의 (컴포넌트 외부에서 정의)
const nodeTypes: Record<string, any> = {
  'input': InputNode,
  'output': OutputNode,
  'group': GroupNode,
}
// ===== 노드 타입 등록 =====
const allNodeTypes = [
  // 1. 입출력
  'input', 'output', 'local-folder', 'local-file',
  // 2. 문서 파싱
  'doc-pdf-parser', 'doc-hwp-parser', 'doc-word-parser', 'doc-excel-parser',
  // 3. 텍스트 처리
  'text-splitter', 'prompt-template',
  // 4. 지식베이스
  'embedder', 'vector-store', 'vector-opensearch', 'vector-search',
  'rag-retriever', 'kb-query', 'bedrock-knowledge-base',
  // 5. KISTI ScienceON
  'kisti-articles', 'kisti-patents', 'kisti-reports', 'kisti-trends',
  'kisti-search', 'api-kisti',
  // 6. 공공데이터 API
  'api-kipris', 'api-data-go-kr',
  // 7. AI 모델 (Bedrock)
  'model-claude-3-5-sonnet', 'model-claude-3-opus', 'model-claude-3-haiku',
  'model-claude-3-5-haiku', 'model-claude-4-sonnet', 'model-claude-4-opus',
  'custom-agent',
  // 8. AWS 서비스
  'aws-translate', 'aws-comprehend', 'aws-textract', 'aws-s3',
  'aws-lambda', 'aws-polly', 'aws-rekognition', 'aws-lex',
  'aws-kendra', 'aws-sagemaker', 'aws-dynamodb', 'aws-step-functions',
  'aws-bedrock-agent', 'aws-entity-recognition',
  // 9. 제어 흐름
  'merge', 'conditional', 'loop', 'scheduler', 'webhook',
  // 10. 내보내기
  'export-excel', 'export-pdf', 'export-word', 'export-ppt',
  // 11. 시각화
  'viz-result-viewer', 'viz-evaluator-result', 'viz-vote-chart',
  'viz-citation', 'viz-json-viewer', 'viz-chart',
]
// input과 output은 전용 컴포넌트, 나머지는 GenericNode
allNodeTypes.forEach(type => {
  if (type !== 'input' && type !== 'output') {
    nodeTypes[type] = GenericNode
  }
})

// 워크플로우 로드 시 미등록 노드 타입을 동적 등록
export const ensureNodeTypeRegistered = (type: string) => {
  if (!nodeTypes[type]) {
    nodeTypes[type] = GenericNode
  }
}

let id = 0
const getId = () => `node_${id++}`

// 드래그 인디케이터 컴포넌트 - 메모이제이션
const DragIndicator = memo(function DragIndicator() {
  const { isDragging, dragData, mousePosition } = useDragStore(
    (state) => ({ isDragging: state.isDragging, dragData: state.dragData, mousePosition: state.mousePosition }),
    shallow
  )

  if (!isDragging || !dragData) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        left: mousePosition.x + 10,
        top: mousePosition.y + 10,
        zIndex: 10000,
        pointerEvents: 'none',
        background: dragData.color,
        color: 'white',
        px: 2,
        py: 1,
        borderRadius: 1,
        fontSize: '0.85rem',
        fontWeight: 500,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        opacity: 0.9,
      }}
    >
      {dragData.label}
    </Box>
  )
})

const WorkflowEditorInner = memo(function WorkflowEditorInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)

  // Shallow 선택자로 필요한 상태만 구독하여 불필요한 리렌더링 방지
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    deleteNode,
    deleteSelectedNodes,
    setSelectedNode,
    setSelectedNodeIds,
    selectedNode,
    selectedNodeIds,
    clearSelection,
    isWorkflowRunning,
    executeWorkflowReal,
    clearAllExecutionResults,
    executeUntilBreakpoint,
    breakpointNodeId,
  } = useWorkflowStore(
    (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      onNodesChange: state.onNodesChange,
      onEdgesChange: state.onEdgesChange,
      onConnect: state.onConnect,
      addNode: state.addNode,
      deleteNode: state.deleteNode,
      deleteSelectedNodes: state.deleteSelectedNodes,
      setSelectedNode: state.setSelectedNode,
      setSelectedNodeIds: state.setSelectedNodeIds,
      selectedNode: state.selectedNode,
      selectedNodeIds: state.selectedNodeIds,
      clearSelection: state.clearSelection,
      isWorkflowRunning: state.isWorkflowRunning,
      executeWorkflowReal: state.executeWorkflowReal,
      clearAllExecutionResults: state.clearAllExecutionResults,
      executeUntilBreakpoint: state.executeUntilBreakpoint,
      breakpointNodeId: state.breakpointNodeId,
    }),
    shallow
  )
  const { isDragging, dragData, updatePosition, endDrag } = useDragStore(
    (state) => ({ isDragging: state.isDragging, dragData: state.dragData, updatePosition: state.updatePosition, endDrag: state.endDrag }),
    shallow
  )

  // 기본 에지 옵션 메모이제이션
  const defaultEdgeOptions = useMemo(() => ({
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 2 },
  }), [])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance
  }, [])

  // 포트 타입 호환성 검증 (연결 시도 시 호출)
  const isValidConnection = useCallback((connection: { source: string | null; target: string | null; sourceHandle: string | null; targetHandle: string | null }) => {
    if (!connection.source || !connection.target) return false
    // 자기 자신에게 연결 방지
    if (connection.source === connection.target) return false
    // 포트 타입 검증
    const sourceNode = nodes.find(n => n.id === connection.source)
    const targetNode = nodes.find(n => n.id === connection.target)
    if (!sourceNode || !targetNode) return true
    const result = validateConnection(
      sourceNode.type || '',
      connection.sourceHandle,
      targetNode.type || '',
      connection.targetHandle,
    )
    if (!result.valid) {
      console.warn(`[ConnectionValidator] ${result.reason}`)
    }
    return result.valid
  }, [nodes])

  // 워크플로우의 모든 노드 타입이 등록되어 있는지 확인 (동적 등록)
  useEffect(() => {
    let needsUpdate = false
    for (const node of nodes) {
      if (node.type && !nodeTypes[node.type]) {
        nodeTypes[node.type] = GenericNode
        needsUpdate = true
      }
    }
    if (needsUpdate) {
      console.log('[WorkflowEditor] 미등록 노드 타입 동적 등록 완료')
    }
  }, [nodes])

  // 마우스 이동 처리
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        updatePosition(e.clientX, e.clientY)
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging && dragData && reactFlowWrapper.current && reactFlowInstance.current) {
        const bounds = reactFlowWrapper.current.getBoundingClientRect()

        // 캔버스 영역 내에서 드롭했는지 확인
        if (
          e.clientX >= bounds.left &&
          e.clientX <= bounds.right &&
          e.clientY >= bounds.top &&
          e.clientY <= bounds.bottom
        ) {
          const position = reactFlowInstance.current.screenToFlowPosition({
            x: e.clientX,
            y: e.clientY,
          })

          const newNode = {
            id: getId(),
            type: dragData.type,
            position,
            data: {
              label: dragData.label,
              color: dragData.color,
              description: dragData.description,
              provider: dragData.provider,
              useCase: dragData.useCase,
              config: {},
            },
          }

          console.log('Adding node:', newNode)
          addNode(newNode)
        }
      }
      endDrag()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragData, updatePosition, endDrag, addNode])

  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    // ReactFlow의 node는 stale할 수 있으므로, store에서 최신 node를 찾아서 사용
    const freshNode = nodes.find(n => n.id === node.id)
    setSelectedNode(freshNode || node)
  }, [setSelectedNode, nodes])

  const onPaneClick = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  // 선택 변경 핸들러
  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const selectedIds = params.nodes.map((n) => n.id)
    setSelectedNodeIds(selectedIds)

    // 단일 선택인 경우 selectedNode도 설정
    if (selectedIds.length === 1) {
      const node = nodes.find((n) => n.id === selectedIds[0])
      setSelectedNode(node || null)
    } else if (selectedIds.length === 0) {
      setSelectedNode(null)
    }
  }, [setSelectedNodeIds, setSelectedNode, nodes])

  // DEL 키로 선택된 노드(들) 삭제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete') {
        // 입력 필드에서 DEL 키를 누른 경우는 제외
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return
        }

        // 다중 선택된 경우
        if (selectedNodeIds.length > 0) {
          deleteSelectedNodes()
        } else if (selectedNode) {
          // 단일 선택된 경우
          deleteNode(selectedNode.id)
          setSelectedNode(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode, selectedNodeIds, deleteNode, deleteSelectedNodes, setSelectedNode])

  return (
    <Box
      ref={reactFlowWrapper}
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onInit={onInit}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Shift"
        panOnDrag={[1, 2]}
        defaultEdgeOptions={defaultEdgeOptions}
        style={{ background: '#0f172a' }}
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls
          style={{
            background: '#1e293b',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />
        <MiniMap
          style={{ background: '#1e293b', borderRadius: 8 }}
          nodeColor={(node) => node.data?.color || '#6366f1'}
          maskColor="rgba(0, 0, 0, 0.5)"
        />
      </ReactFlow>

      {/* 워크플로우 실행 컨트롤 툴바 */}
      {nodes.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1,
            borderRadius: 2,
            background: 'rgba(30, 41, 59, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            zIndex: 100,
          }}
        >
          {/* 실행/중지 버튼 */}
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              if (isWorkflowRunning) {
                // 중지
                clearAllExecutionResults()
              } else {
                // 실제 파일 연동 실행
                executeWorkflowReal()
              }
            }}
            startIcon={
              isWorkflowRunning ? (
                <CircularProgress size={16} sx={{ color: 'white' }} />
              ) : (
                <PlayArrowIcon />
              )
            }
            sx={{
              background: isWorkflowRunning
                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              '&:hover': {
                background: isWorkflowRunning
                  ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                  : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              },
              fontWeight: 600,
              textTransform: 'none',
              minWidth: 100,
            }}
          >
            {isWorkflowRunning ? '실행 중...' : '실행'}
          </Button>

          {/* 중단점까지 실행 버튼 */}
          {breakpointNodeId && (
            <Button
              variant="contained"
              size="small"
              onClick={executeUntilBreakpoint}
              disabled={isWorkflowRunning}
              startIcon={<StopCircleIcon />}
              sx={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                },
                '&:disabled': {
                  background: 'rgba(245, 158, 11, 0.3)',
                },
                fontWeight: 600,
                textTransform: 'none',
                minWidth: 140,
              }}
            >
              중단점까지 실행
            </Button>
          )}

          {/* 초기화 버튼 */}
          <Button
            variant="outlined"
            size="small"
            onClick={clearAllExecutionResults}
            startIcon={<RestartAltIcon />}
            disabled={isWorkflowRunning}
            sx={{
              borderColor: 'rgba(255,255,255,0.2)',
              color: 'grey.400',
              '&:hover': {
                borderColor: 'rgba(255,255,255,0.4)',
                background: 'rgba(255,255,255,0.05)',
              },
              '&:disabled': {
                borderColor: 'rgba(255,255,255,0.1)',
                color: 'grey.600',
              },
              textTransform: 'none',
            }}
          >
            초기화
          </Button>
        </Box>
      )}

      {/* 노드가 없을 때 안내 메시지 */}
      {nodes.length === 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography variant="h6" color="grey.600" sx={{ mb: 1 }}>
            워크플로우 시작하기
          </Typography>
          <Typography variant="body2" color="grey.700">
            왼쪽 노드 팔레트에서 노드를 클릭하고<br />
            이 캔버스로 드래그하세요
          </Typography>
        </Box>
      )}

      {/* 다중 선택 인디케이터 with 그룹화 버튼 */}
      {selectedNodeIds.length > 1 && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 2,
            py: 1,
            borderRadius: 2,
            background: 'rgba(16, 185, 129, 0.95)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
            zIndex: 100,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'white', fontWeight: 600 }}>
              {selectedNodeIds.length}개 노드 선택됨
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              (DEL: 삭제)
            </Typography>
          </Box>
          <Box
            component="button"
            onClick={() => {
              // 선택된 노드들의 위치 계산
              const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id))
              if (selectedNodes.length < 2) return

              const positions = selectedNodes.map(n => n.position)
              const minX = Math.min(...positions.map(p => p.x)) - 20
              const minY = Math.min(...positions.map(p => p.y)) - 40
              const maxX = Math.max(...positions.map(p => p.x)) + 200
              const maxY = Math.max(...positions.map(p => p.y)) + 100

              // 그룹 노드 생성
              const groupId = `group_${Date.now()}`
              const groupNode = {
                id: groupId,
                type: 'group',
                position: { x: minX, y: minY },
                style: {
                  width: maxX - minX,
                  height: maxY - minY,
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '2px dashed rgba(16, 185, 129, 0.5)',
                  borderRadius: 8,
                },
                data: {
                  label: `그룹 (${selectedNodes.length}개 노드)`,
                  color: '#10b981',
                },
              }

              // 노드들을 그룹의 자식으로 설정 (부모 노드 ID 지정)
              const updatedNodes = nodes.map(n => {
                if (selectedNodeIds.includes(n.id)) {
                  return {
                    ...n,
                    parentNode: groupId,
                    extent: 'parent' as const,
                    position: {
                      x: n.position.x - minX,
                      y: n.position.y - minY,
                    },
                  }
                }
                return n
              })

              // 그룹 노드를 맨 앞에 추가 (다른 노드들의 부모가 되어야 함)
              const newNodes = [groupNode, ...updatedNodes]

              // 스토어 업데이트
              useWorkflowStore.getState().setNodes(newNodes as any)
              clearSelection()
            }}
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              '&:hover': {
                background: 'rgba(255,255,255,0.2)',
              },
            }}
          >
그룹화
          </Box>
        </Box>
      )}
    </Box>
  )
})

// 메모이제이션된 워크플로우 에디터 컴포넌트
const WorkflowEditor = memo(function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      {reactFlowOverrideStyles}
      <WorkflowEditorInner />
      <DragIndicator />
    </ReactFlowProvider>
  )
})

export default WorkflowEditor
