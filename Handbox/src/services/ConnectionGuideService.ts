/**
 * Connection Guide Service
 *
 * 노드 드래그 시 호환 가능한 노드를 계산하여 시각적 가이드 제공.
 * TYPE_COMPATIBILITY 매트릭스를 기반으로 포트 호환성 검사.
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import { isTypeCompatible, DataType } from '../engine/types'
import type { Node } from 'reactflow'

// ============================================================
// 타입 정의
// ============================================================

export interface CompatiblePort {
  /** 기존 노드의 포트 이름 */
  existingPort: string
  /** 드래그 노드의 포트 이름 */
  draggedPort: string
  /** 포트 데이터 타입 */
  portType: DataType
}

export interface CompatibleNodeInfo {
  /** 캔버스 노드 ID */
  nodeId: string
  /** 캔버스 노드 타입 */
  nodeType: string
  /** 어느 쪽이 호환되는지: 'input' = 기존 노드의 왼쪽, 'output' = 기존 노드의 오른쪽 */
  side: 'input' | 'output'
  /** 호환되는 포트 목록 */
  compatiblePorts: CompatiblePort[]
}

// ============================================================
// 호환성 계산 함수
// ============================================================

/**
 * 드래그 중인 노드 타입과 캔버스의 기존 노드들 간 호환성 계산.
 *
 * @param draggedNodeType - 드래그 중인 노드의 타입 (예: 'io.file-read')
 * @param canvasNodes - 캔버스에 이미 배치된 노드들
 * @returns 호환 가능한 노드 정보 배열
 */
export function findCompatibleNodes(
  draggedNodeType: string,
  canvasNodes: Node[],
): CompatibleNodeInfo[] {
  const draggedDef = NodeRegistry.get(draggedNodeType)
  if (!draggedDef) {
    console.warn(`[ConnectionGuide] 노드 정의를 찾을 수 없음: ${draggedNodeType}`)
    return []
  }

  const result: CompatibleNodeInfo[] = []

  for (const canvasNode of canvasNodes) {
    const canvasType = canvasNode.type || ''
    const canvasDef = NodeRegistry.get(canvasType)
    if (!canvasDef) continue

    // 호환성 검사 결과
    const inputCompatible: CompatiblePort[] = []
    const outputCompatible: CompatiblePort[] = []

    // Case 1: 드래그 노드의 INPUT ← 기존 노드의 OUTPUT
    // → 기존 노드의 오른쪽(output) 핸들 하이라이트
    for (const draggedInput of draggedDef.ports.inputs) {
      for (const canvasOutput of canvasDef.ports.outputs) {
        if (isTypeCompatible(canvasOutput.type, draggedInput.type)) {
          outputCompatible.push({
            existingPort: canvasOutput.name,
            draggedPort: draggedInput.name,
            portType: canvasOutput.type,
          })
        }
      }
    }

    // Case 2: 드래그 노드의 OUTPUT → 기존 노드의 INPUT
    // → 기존 노드의 왼쪽(input) 핸들 하이라이트
    for (const draggedOutput of draggedDef.ports.outputs) {
      for (const canvasInput of canvasDef.ports.inputs) {
        if (isTypeCompatible(draggedOutput.type, canvasInput.type)) {
          inputCompatible.push({
            existingPort: canvasInput.name,
            draggedPort: draggedOutput.name,
            portType: draggedOutput.type,
          })
        }
      }
    }

    // 결과 추가 (양쪽 모두 호환되면 두 개 추가)
    if (outputCompatible.length > 0) {
      result.push({
        nodeId: canvasNode.id,
        nodeType: canvasType,
        side: 'output',
        compatiblePorts: outputCompatible,
      })
    }

    if (inputCompatible.length > 0) {
      result.push({
        nodeId: canvasNode.id,
        nodeType: canvasType,
        side: 'input',
        compatiblePorts: inputCompatible,
      })
    }
  }

  return result
}

/**
 * 호환 노드 정보를 Map 형태로 변환.
 * 하나의 노드가 양쪽 모두 호환되는 경우 'both' 값 사용.
 *
 * @param compatibleNodes - findCompatibleNodes 결과
 * @returns nodeId → 'input' | 'output' | 'both' 매핑
 */
export function buildCompatibleNodesMap(
  compatibleNodes: CompatibleNodeInfo[],
): Map<string, 'input' | 'output' | 'both'> {
  const map = new Map<string, 'input' | 'output' | 'both'>()

  for (const info of compatibleNodes) {
    const existing = map.get(info.nodeId)
    if (existing) {
      // 이미 한쪽이 있으면 'both'
      if (existing !== info.side) {
        map.set(info.nodeId, 'both')
      }
    } else {
      map.set(info.nodeId, info.side)
    }
  }

  return map
}

/**
 * 드래그 노드 타입으로 호환 노드 Map을 한 번에 계산.
 *
 * @param draggedNodeType - 드래그 중인 노드 타입
 * @param canvasNodes - 캔버스 노드들
 * @returns nodeId → 'input' | 'output' | 'both' 매핑
 */
export function calculateCompatibleNodesMap(
  draggedNodeType: string,
  canvasNodes: Node[],
): Map<string, 'input' | 'output' | 'both'> {
  const compatibleNodes = findCompatibleNodes(draggedNodeType, canvasNodes)
  return buildCompatibleNodesMap(compatibleNodes)
}
