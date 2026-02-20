/**
 * Auto Layout Algorithm
 *
 * 생성된 워크플로우 노드를 자동으로 배치하는 알고리즘.
 * 토폴로지 정렬 기반 레이어 할당 + 좌→우 배치.
 */

import type { Node, Edge } from 'reactflow'

// ============================================================
// 레이아웃 상수
// ============================================================

const NODE_WIDTH = 200
const NODE_HEIGHT = 120
const HORIZONTAL_GAP = 100
const VERTICAL_GAP = 60
const START_X = 100
const START_Y = 100

// ============================================================
// Auto Layout 함수
// ============================================================

/**
 * 노드와 엣지를 받아 자동 배치된 노드 반환
 *
 * 알고리즘:
 * 1. 토폴로지 정렬로 노드를 레이어에 할당
 * 2. 각 레이어의 X 좌표 = START_X + layer * (NODE_WIDTH + HORIZONTAL_GAP)
 * 3. 같은 레이어 내 노드들은 Y 좌표로 분산
 */
export function applyAutoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes
  if (nodes.length === 1) {
    return [{ ...nodes[0], position: { x: START_X, y: START_Y } }]
  }

  // 노드 맵 생성
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // in-degree 계산
  const inDegree = new Map<string, number>()
  const children = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    children.set(node.id, [])
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
      children.get(edge.source)?.push(edge.target)
    }
  }

  // 토폴로지 정렬 (Kahn's Algorithm)
  const layers: string[][] = []
  const nodeLayer = new Map<string, number>()
  const queue: string[] = []

  // in-degree가 0인 노드들로 시작
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id)
    }
  }

  // 연결 안 된 노드 처리 (in-degree가 있지만 시작 노드가 없는 경우)
  if (queue.length === 0 && nodes.length > 0) {
    // 모든 노드가 사이클에 있거나 연결 안 됨 - 첫 번째 노드로 시작
    queue.push(nodes[0].id)
  }

  while (queue.length > 0) {
    const current = queue.shift()!

    // 부모 노드들 중 최대 레이어 찾기
    let maxParentLayer = -1
    for (const edge of edges) {
      if (edge.target === current && nodeLayer.has(edge.source)) {
        maxParentLayer = Math.max(maxParentLayer, nodeLayer.get(edge.source)!)
      }
    }

    const layer = maxParentLayer + 1
    nodeLayer.set(current, layer)

    // 레이어 배열 확장
    while (layers.length <= layer) {
      layers.push([])
    }
    layers[layer].push(current)

    // 자식 노드들의 in-degree 감소
    for (const child of children.get(current) || []) {
      const newDegree = (inDegree.get(child) || 1) - 1
      inDegree.set(child, newDegree)
      if (newDegree === 0 && !nodeLayer.has(child)) {
        queue.push(child)
      }
    }
  }

  // 처리되지 않은 노드 (사이클 또는 고립 노드)
  const processed = new Set(nodeLayer.keys())
  for (const node of nodes) {
    if (!processed.has(node.id)) {
      // 마지막 레이어에 추가
      const lastLayer = layers.length > 0 ? layers.length - 1 : 0
      if (layers.length === 0) layers.push([])
      layers[lastLayer].push(node.id)
      nodeLayer.set(node.id, lastLayer)
    }
  }

  // 위치 계산
  const positioned: Node[] = []

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx]
    const x = START_X + layerIdx * (NODE_WIDTH + HORIZONTAL_GAP)

    // 레이어 내 노드들을 세로로 배치
    const startY = START_Y

    for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
      const nodeId = layer[nodeIdx]
      const node = nodeMap.get(nodeId)!
      const y = startY + nodeIdx * (NODE_HEIGHT + VERTICAL_GAP)

      positioned.push({
        ...node,
        position: { x, y },
      })
    }
  }

  return positioned
}

/**
 * 새로운 노드만 레이아웃하고 기존 노드는 유지
 *
 * @param existingNodes - 이미 캔버스에 있는 노드들
 * @param newNodes - 새로 추가할 노드들
 * @param edges - 모든 엣지
 * @returns 레이아웃된 새 노드들
 */
export function layoutNewNodesOnly(
  existingNodes: Node[],
  newNodes: Node[],
  edges: Edge[]
): Node[] {
  if (newNodes.length === 0) return newNodes

  // 기존 노드들의 최대 X 좌표 찾기
  let maxX = 0
  for (const node of existingNodes) {
    maxX = Math.max(maxX, node.position.x)
  }

  // 새 노드들의 시작 X 좌표
  const startX = maxX + NODE_WIDTH + HORIZONTAL_GAP * 2

  // 새 노드들만 레이아웃
  const layoutedNew = applyAutoLayout(newNodes, edges)

  // 오프셋 적용
  return layoutedNew.map(node => ({
    ...node,
    position: {
      x: node.position.x + startX - START_X,
      y: node.position.y,
    },
  }))
}

/**
 * 엣지로 연결된 노드 그룹 찾기
 */
export function findConnectedGroups(nodes: Node[], edges: Edge[]): Node[][] {
  const nodeIds = new Set(nodes.map(n => n.id))
  const visited = new Set<string>()
  const groups: Node[][] = []

  // 인접 리스트 생성 (양방향)
  const adjacency = new Map<string, Set<string>>()
  for (const node of nodes) {
    adjacency.set(node.id, new Set())
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)?.add(edge.target)
      adjacency.get(edge.target)?.add(edge.source)
    }
  }

  // DFS로 연결된 컴포넌트 찾기
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  for (const node of nodes) {
    if (visited.has(node.id)) continue

    const group: Node[] = []
    const stack = [node.id]

    while (stack.length > 0) {
      const current = stack.pop()!
      if (visited.has(current)) continue
      visited.add(current)
      group.push(nodeMap.get(current)!)

      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor)
        }
      }
    }

    if (group.length > 0) {
      groups.push(group)
    }
  }

  return groups
}
