/**
 * ExcelExport Executor — 데이터를 Excel 파일로 내보내기
 *
 * Tauri 커맨드 export_excel 사용.
 * 범용적으로 이전 노드의 데이터를 Excel 형태로 변환.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const predecessors: Record<string, any>[] = input._predecessors || []
    const inputData = predecessors[0] || input
    const outputPath = config.output_path || 'output.xlsx'
    const sheetName = config.sheet_name || 'Sheet1'

    // 내보낼 데이터 결정
    let exportData: any[] = []

    if (Array.isArray(inputData.items)) {
      exportData = inputData.items
    } else if (Array.isArray(inputData.results)) {
      exportData = inputData.results
    } else if (Array.isArray(inputData.chunks)) {
      exportData = inputData.chunks
    } else if (Array.isArray(inputData.evaluators)) {
      exportData = inputData.evaluators
    } else if (typeof inputData === 'object') {
      exportData = [inputData]
    }

    try {
      await invoke('export_excel', {
        data: JSON.stringify(exportData),
        outputPath,
        sheetName,
      })
      return {
        status: 'Excel 파일 생성 완료',
        output_path: outputPath,
        rows: exportData.length,
        sheet_name: sheetName,
      }
    } catch (error) {
      // Tauri 커맨드 미등록 시 데이터 준비만 반환
      return {
        status: 'Excel 내보내기 데이터 준비 완료 (export_excel 커맨드 필요)',
        output_path: outputPath,
        rows: exportData.length,
        sheet_name: sheetName,
        data_preview: exportData.slice(0, 3),
        _export_ready: true,
      }
    }
  },
}

export const ExcelExportDefinition: NodeDefinition = {
  type: 'export.excel',
  category: 'export',
  meta: {
    label: 'Excel 내보내기',
    description: '데이터를 Excel(XLSX) 파일로 내보냅니다',
    icon: 'TableChart',
    color: '#4CAF50',
    tags: ['엑셀', '내보내기', 'excel', 'xlsx', 'export', 'spreadsheet'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '내보낼 데이터' },
    ],
    outputs: [
      { name: 'file', type: 'file-ref', required: true, description: '생성된 Excel 파일 경로' },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'text', default: 'output.xlsx', placeholder: 'results.xlsx' },
    { key: 'sheet_name', label: '시트 이름', type: 'text', default: 'Sheet1' },
  ],
  runtime: 'tauri',
  executor,
}
