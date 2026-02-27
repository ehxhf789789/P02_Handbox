/**
 * File Tools - 파일 시스템 작업
 *
 * 원자화된 파일 도구 12개:
 * - file.read    : 파일 읽기
 * - file.write   : 파일 쓰기
 * - file.append  : 파일 추가
 * - file.delete  : 파일 삭제
 * - file.copy    : 파일 복사
 * - file.move    : 파일 이동
 * - file.rename  : 파일 이름 변경
 * - file.list    : 디렉토리 목록
 * - file.info    : 파일 정보
 * - file.exists  : 파일 존재 확인
 * - file.mkdir   : 디렉토리 생성
 * - file.zip     : 압축/해제
 */

import { invoke } from '@tauri-apps/api/tauri'
import type {
  UnifiedToolDefinition,
  ToolExecutor,
  ToolResult,
  ToolExecutionContext,
} from '../registry/UnifiedToolDefinition'

// ============================================================
// file.read - 파일 읽기
// ============================================================

const fileReadExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string

    if (!path) {
      return { success: false, outputs: {}, error: '파일 경로가 필요합니다' }
    }

    try {
      const result = await invoke<{
        data: string
        size: number
        size_human: string
        mime_type: string
        encoding_detected: string
        metadata?: Record<string, unknown>
      }>('tool_file_read', {
        path,
        encoding: config.encoding === 'auto' ? null : config.encoding,
        limit: (config.limit as number) || null,
        asBinary: config.as_binary || null,
      })

      return {
        success: true,
        outputs: {
          text: result.data,
          content: result.data,
          metadata: {
            size: result.size,
            sizeHuman: result.size_human,
            mime: result.mime_type,
            encoding: result.encoding_detected,
            ...result.metadata,
          },
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const fileRead: UnifiedToolDefinition = {
  name: 'file.read',
  version: '1.0.0',
  description: '파일을 읽어 텍스트 또는 바이너리로 반환합니다. 인코딩 자동 감지, 대용량 부분 읽기를 지원합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '읽을 파일의 경로' },
      encoding: { type: 'string', enum: ['auto', 'utf-8', 'euc-kr', 'shift-jis'], default: 'auto' },
      limit: { type: 'number', description: '최대 읽기 바이트 수 (0=전체)' },
      as_binary: { type: 'boolean', description: 'base64로 반환할지 여부' },
    },
    required: ['path'],
  },
  meta: {
    label: '파일 읽기',
    description: '텍스트/바이너리 파일을 읽습니다',
    icon: 'FileOpen',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'read', 'text', 'binary', '파일', '읽기'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: true, description: '파일 경로' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '파일 내용' },
      { name: 'content', type: 'text', required: false, description: '파일 내용 (alias)' },
      { name: 'metadata', type: 'json', required: false, description: '파일 메타데이터' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file', required: true },
    {
      key: 'encoding', label: '인코딩', type: 'select', default: 'auto',
      options: [
        { value: 'auto', label: '자동 감지' },
        { value: 'utf-8', label: 'UTF-8' },
        { value: 'euc-kr', label: 'EUC-KR (한국어)' },
        { value: 'shift-jis', label: 'Shift-JIS (일본어)' },
      ],
    },
    { key: 'limit', label: '최대 읽기 크기', type: 'number', default: 0, description: '0이면 전체 읽기' },
    { key: 'as_binary', label: '바이너리 모드', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: fileReadExecutor,
}

// ============================================================
// file.write - 파일 쓰기
// ============================================================

const fileWriteExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string
    const content = (inputs.content || inputs.text || '') as string

    if (!path) {
      return { success: false, outputs: {}, error: '파일 경로가 필요합니다' }
    }

    try {
      const result = await invoke<{ bytes_written: number; path: string }>('tool_file_write', {
        path,
        content,
        encoding: config.encoding || 'utf-8',
        mode: 'overwrite',
        createDirs: true,
        backup: config.backup || false,
      })

      return {
        success: true,
        outputs: {
          path: result.path,
          bytesWritten: result.bytes_written,
          result: { success: true, path: result.path, bytesWritten: result.bytes_written },
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const fileWrite: UnifiedToolDefinition = {
  name: 'file.write',
  version: '1.0.0',
  description: '텍스트를 파일로 저장합니다. 기존 파일을 덮어씁니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '저장할 파일 경로' },
      content: { type: 'string', description: '저장할 내용' },
      encoding: { type: 'string', enum: ['utf-8', 'euc-kr'], default: 'utf-8' },
      backup: { type: 'boolean', description: '기존 파일 백업 여부' },
    },
    required: ['path', 'content'],
  },
  meta: {
    label: '파일 쓰기',
    description: '텍스트를 파일로 저장합니다 (덮어쓰기)',
    icon: 'SaveAlt',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'write', 'save', '파일', '쓰기', '저장'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'text', required: true, description: '저장할 텍스트' },
      { name: 'path', type: 'text', required: false, description: '저장 경로' },
    ],
    outputs: [
      { name: 'path', type: 'text', required: true, description: '저장된 파일 경로' },
      { name: 'bytesWritten', type: 'number', required: false, description: '저장된 바이트 수' },
      { name: 'result', type: 'json', required: false, description: '저장 결과' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'text', required: true },
    {
      key: 'encoding', label: '인코딩', type: 'select', default: 'utf-8',
      options: [
        { value: 'utf-8', label: 'UTF-8' },
        { value: 'euc-kr', label: 'EUC-KR' },
      ],
    },
    { key: 'backup', label: '백업 생성', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: fileWriteExecutor,
}

// ============================================================
// file.append - 파일 추가
// ============================================================

const fileAppendExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string
    const content = (inputs.content || inputs.text || '') as string

    if (!path) {
      return { success: false, outputs: {}, error: '파일 경로가 필요합니다' }
    }

    try {
      const result = await invoke<{ bytes_written: number; path: string }>('tool_file_write', {
        path,
        content,
        encoding: config.encoding || 'utf-8',
        mode: 'append',
        createDirs: true,
        backup: false,
      })

      return {
        success: true,
        outputs: {
          path: result.path,
          bytesWritten: result.bytes_written,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const fileAppend: UnifiedToolDefinition = {
  name: 'file.append',
  version: '1.0.0',
  description: '기존 파일 끝에 텍스트를 추가합니다. 파일이 없으면 새로 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '파일 경로' },
      content: { type: 'string', description: '추가할 내용' },
      encoding: { type: 'string', enum: ['utf-8', 'euc-kr'], default: 'utf-8' },
    },
    required: ['path', 'content'],
  },
  meta: {
    label: '파일 추가',
    description: '파일 끝에 텍스트를 추가합니다',
    icon: 'AddCircle',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'append', 'add', '파일', '추가'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'text', required: true, description: '추가할 텍스트' },
      { name: 'path', type: 'text', required: false, description: '파일 경로' },
    ],
    outputs: [
      { name: 'path', type: 'text', required: true, description: '파일 경로' },
      { name: 'bytesWritten', type: 'number', required: false, description: '추가된 바이트 수' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'text', required: true },
    {
      key: 'encoding', label: '인코딩', type: 'select', default: 'utf-8',
      options: [
        { value: 'utf-8', label: 'UTF-8' },
        { value: 'euc-kr', label: 'EUC-KR' },
      ],
    },
  ],
  runtime: 'tauri',
  executor: fileAppendExecutor,
}

// ============================================================
// file.delete - 파일 삭제
// ============================================================

const fileDeleteExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string

    if (!path) {
      return { success: false, outputs: {}, error: '파일 경로가 필요합니다' }
    }

    try {
      await invoke('tool_file_delete', { path, recursive: config.recursive || false })

      return {
        success: true,
        outputs: { deleted: true, path },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: { deleted: false }, error: String(error) }
    }
  },
}

export const fileDelete: UnifiedToolDefinition = {
  name: 'file.delete',
  version: '1.0.0',
  description: '파일 또는 빈 디렉토리를 삭제합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '삭제할 파일/디렉토리 경로' },
      recursive: { type: 'boolean', description: '디렉토리 재귀 삭제 여부' },
    },
    required: ['path'],
  },
  meta: {
    label: '파일 삭제',
    description: '파일 또는 디렉토리를 삭제합니다',
    icon: 'Delete',
    color: '#ef4444',
    category: 'file',
    tags: ['file', 'delete', 'remove', '파일', '삭제'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: true, description: '삭제할 경로' },
    ],
    outputs: [
      { name: 'deleted', type: 'boolean', required: true, description: '삭제 성공 여부' },
      { name: 'path', type: 'text', required: false, description: '삭제된 경로' },
    ],
  },
  configSchema: [
    { key: 'path', label: '경로', type: 'text', required: true },
    { key: 'recursive', label: '재귀 삭제', type: 'toggle', default: false, description: '디렉토리 내용물 함께 삭제' },
  ],
  runtime: 'tauri',
  executor: fileDeleteExecutor,
}

// ============================================================
// file.copy - 파일 복사
// ============================================================

const fileCopyExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const source = (inputs.source || config.source) as string
    const destination = (inputs.destination || config.destination) as string

    if (!source || !destination) {
      return { success: false, outputs: {}, error: '원본과 대상 경로가 모두 필요합니다' }
    }

    try {
      await invoke('tool_file_copy', {
        source,
        destination,
        overwrite: config.overwrite ?? true,
      })

      return {
        success: true,
        outputs: { source, destination, copied: true },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: { copied: false }, error: String(error) }
    }
  },
}

export const fileCopy: UnifiedToolDefinition = {
  name: 'file.copy',
  version: '1.0.0',
  description: '파일을 다른 위치로 복사합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: '원본 파일 경로' },
      destination: { type: 'string', description: '대상 파일 경로' },
      overwrite: { type: 'boolean', description: '기존 파일 덮어쓰기' },
    },
    required: ['source', 'destination'],
  },
  meta: {
    label: '파일 복사',
    description: '파일을 복사합니다',
    icon: 'ContentCopy',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'copy', 'duplicate', '파일', '복사'],
  },
  ports: {
    inputs: [
      { name: 'source', type: 'text', required: true, description: '원본 경로' },
      { name: 'destination', type: 'text', required: false, description: '대상 경로' },
    ],
    outputs: [
      { name: 'copied', type: 'boolean', required: true, description: '복사 성공 여부' },
      { name: 'destination', type: 'text', required: false, description: '복사된 경로' },
    ],
  },
  configSchema: [
    { key: 'source', label: '원본 경로', type: 'file', required: true },
    { key: 'destination', label: '대상 경로', type: 'text', required: true },
    { key: 'overwrite', label: '덮어쓰기', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: fileCopyExecutor,
}

// ============================================================
// file.move - 파일 이동
// ============================================================

const fileMoveExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const source = (inputs.source || config.source) as string
    const destination = (inputs.destination || config.destination) as string

    if (!source || !destination) {
      return { success: false, outputs: {}, error: '원본과 대상 경로가 모두 필요합니다' }
    }

    try {
      await invoke('tool_file_move', {
        source,
        destination,
        overwrite: config.overwrite ?? true,
      })

      return {
        success: true,
        outputs: { source, destination, moved: true },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: { moved: false }, error: String(error) }
    }
  },
}

export const fileMove: UnifiedToolDefinition = {
  name: 'file.move',
  version: '1.0.0',
  description: '파일을 다른 위치로 이동합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: '원본 파일 경로' },
      destination: { type: 'string', description: '대상 파일 경로' },
      overwrite: { type: 'boolean', description: '기존 파일 덮어쓰기' },
    },
    required: ['source', 'destination'],
  },
  meta: {
    label: '파일 이동',
    description: '파일을 이동합니다',
    icon: 'DriveFileMove',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'move', '파일', '이동'],
  },
  ports: {
    inputs: [
      { name: 'source', type: 'text', required: true, description: '원본 경로' },
      { name: 'destination', type: 'text', required: false, description: '대상 경로' },
    ],
    outputs: [
      { name: 'moved', type: 'boolean', required: true, description: '이동 성공 여부' },
      { name: 'destination', type: 'text', required: false, description: '이동된 경로' },
    ],
  },
  configSchema: [
    { key: 'source', label: '원본 경로', type: 'file', required: true },
    { key: 'destination', label: '대상 경로', type: 'text', required: true },
    { key: 'overwrite', label: '덮어쓰기', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: fileMoveExecutor,
}

// ============================================================
// file.rename - 파일 이름 변경
// ============================================================

const fileRenameExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string
    const newName = (inputs.newName || config.newName) as string

    if (!path || !newName) {
      return { success: false, outputs: {}, error: '파일 경로와 새 이름이 필요합니다' }
    }

    try {
      // 같은 디렉토리에서 이름만 변경
      const dirPath = path.substring(0, path.lastIndexOf('/') + 1) || path.substring(0, path.lastIndexOf('\\') + 1)
      const destination = dirPath + newName

      await invoke('tool_file_move', {
        source: path,
        destination,
        overwrite: false,
      })

      return {
        success: true,
        outputs: { oldPath: path, newPath: destination, renamed: true },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: { renamed: false }, error: String(error) }
    }
  },
}

export const fileRename: UnifiedToolDefinition = {
  name: 'file.rename',
  version: '1.0.0',
  description: '파일 이름을 변경합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '파일 경로' },
      newName: { type: 'string', description: '새 파일 이름' },
    },
    required: ['path', 'newName'],
  },
  meta: {
    label: '파일 이름 변경',
    description: '파일 이름을 변경합니다',
    icon: 'DriveFileRename',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'rename', '파일', '이름', '변경'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: true, description: '파일 경로' },
      { name: 'newName', type: 'text', required: true, description: '새 이름' },
    ],
    outputs: [
      { name: 'renamed', type: 'boolean', required: true, description: '변경 성공 여부' },
      { name: 'newPath', type: 'text', required: false, description: '새 경로' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file', required: true },
    { key: 'newName', label: '새 이름', type: 'text', required: true },
  ],
  runtime: 'tauri',
  executor: fileRenameExecutor,
}

// ============================================================
// file.list - 디렉토리 목록
// ============================================================

const fileListExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string

    if (!path) {
      return { success: false, outputs: {}, error: '디렉토리 경로가 필요합니다' }
    }

    try {
      const result = await invoke<{
        files: Array<{
          name: string
          path: string
          size: number
          is_directory: boolean
          extension?: string
        }>
        total_count: number
      }>('tool_file_list', {
        path,
        pattern: config.pattern || null,
        recursive: config.recursive || false,
        includeHidden: config.includeHidden || false,
        sortBy: config.sortBy || 'name',
        limit: (config.limit as number) || null,
      })

      return {
        success: true,
        outputs: {
          files: result.files,
          count: result.total_count,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const fileList: UnifiedToolDefinition = {
  name: 'file.list',
  version: '1.0.0',
  description: '디렉토리의 파일 목록을 조회합니다. 글로브 패턴과 재귀 탐색을 지원합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '디렉토리 경로' },
      pattern: { type: 'string', description: '파일 패턴 (예: *.pdf)' },
      recursive: { type: 'boolean', description: '하위 디렉토리 포함' },
      sortBy: { type: 'string', enum: ['name', 'size', 'modified', 'type'] },
      limit: { type: 'number', description: '최대 파일 수' },
    },
    required: ['path'],
  },
  meta: {
    label: '파일 목록',
    description: '디렉토리의 파일 목록을 조회합니다',
    icon: 'FolderOpen',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'list', 'directory', 'folder', 'glob', '파일', '목록', '폴더'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: true, description: '디렉토리 경로' },
    ],
    outputs: [
      { name: 'files', type: 'json', required: true, description: '파일 목록 배열' },
      { name: 'count', type: 'number', required: false, description: '파일 수' },
    ],
  },
  configSchema: [
    { key: 'path', label: '디렉토리 경로', type: 'folder', required: true },
    { key: 'pattern', label: '패턴', type: 'text', description: '예: **/*.pdf' },
    { key: 'recursive', label: '하위 폴더 포함', type: 'toggle', default: false },
    {
      key: 'sortBy', label: '정렬 기준', type: 'select', default: 'name',
      options: [
        { value: 'name', label: '이름' },
        { value: 'size', label: '크기' },
        { value: 'modified', label: '수정일' },
        { value: 'type', label: '타입' },
      ],
    },
    { key: 'limit', label: '최대 개수', type: 'number', default: 0 },
  ],
  runtime: 'tauri',
  executor: fileListExecutor,
}

// ============================================================
// file.info - 파일 정보
// ============================================================

const fileInfoExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string

    if (!path) {
      return { success: false, outputs: {}, error: '파일 경로가 필요합니다' }
    }

    try {
      const info = await invoke<{
        name: string
        path: string
        size: number
        size_human: string
        mime_type: string
        is_directory: boolean
        extension?: string
        created?: string
        modified?: string
      }>('tool_file_info', { path })

      return {
        success: true,
        outputs: { info },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const fileInfo: UnifiedToolDefinition = {
  name: 'file.info',
  version: '1.0.0',
  description: '파일의 메타데이터를 조회합니다 (크기, MIME, 수정일, 생성일 등).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '파일 경로' },
    },
    required: ['path'],
  },
  meta: {
    label: '파일 정보',
    description: '파일 메타데이터를 조회합니다',
    icon: 'Info',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'info', 'metadata', 'size', 'mime', '파일', '정보'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: true, description: '파일 경로' },
    ],
    outputs: [
      { name: 'info', type: 'json', required: true, description: '파일 정보' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file', required: true },
  ],
  runtime: 'tauri',
  executor: fileInfoExecutor,
}

// ============================================================
// file.exists - 파일 존재 확인
// ============================================================

const fileExistsExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string

    if (!path) {
      return { success: false, outputs: {}, error: '파일 경로가 필요합니다' }
    }

    try {
      const exists = await invoke<boolean>('tool_file_exists', { path })

      return {
        success: true,
        outputs: { exists, path },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      // 에러가 발생해도 exists: false로 반환
      return {
        success: true,
        outputs: { exists: false, path },
        metadata: { executionTime: Date.now() - startTime },
      }
    }
  },
}

export const fileExists: UnifiedToolDefinition = {
  name: 'file.exists',
  version: '1.0.0',
  description: '파일 또는 디렉토리의 존재 여부를 확인합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '확인할 경로' },
    },
    required: ['path'],
  },
  meta: {
    label: '파일 존재 확인',
    description: '파일/디렉토리 존재 여부를 확인합니다',
    icon: 'HelpOutline',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'exists', 'check', '파일', '존재', '확인'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: true, description: '경로' },
    ],
    outputs: [
      { name: 'exists', type: 'boolean', required: true, description: '존재 여부' },
    ],
  },
  configSchema: [
    { key: 'path', label: '경로', type: 'text', required: true },
  ],
  runtime: 'tauri',
  executor: fileExistsExecutor,
}

// ============================================================
// file.mkdir - 디렉토리 생성
// ============================================================

const fileMkdirExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const path = (inputs.path || config.path) as string

    if (!path) {
      return { success: false, outputs: {}, error: '디렉토리 경로가 필요합니다' }
    }

    try {
      await invoke('tool_file_mkdir', {
        path,
        recursive: config.recursive ?? true,
      })

      return {
        success: true,
        outputs: { created: true, path },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: { created: false }, error: String(error) }
    }
  },
}

export const fileMkdir: UnifiedToolDefinition = {
  name: 'file.mkdir',
  version: '1.0.0',
  description: '새 디렉토리를 생성합니다. 중간 디렉토리도 함께 생성할 수 있습니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '생성할 디렉토리 경로' },
      recursive: { type: 'boolean', description: '중간 디렉토리 생성' },
    },
    required: ['path'],
  },
  meta: {
    label: '디렉토리 생성',
    description: '새 디렉토리를 생성합니다',
    icon: 'CreateNewFolder',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'mkdir', 'directory', 'folder', 'create', '디렉토리', '생성', '폴더'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: true, description: '디렉토리 경로' },
    ],
    outputs: [
      { name: 'created', type: 'boolean', required: true, description: '생성 성공 여부' },
      { name: 'path', type: 'text', required: false, description: '생성된 경로' },
    ],
  },
  configSchema: [
    { key: 'path', label: '디렉토리 경로', type: 'text', required: true },
    { key: 'recursive', label: '중간 디렉토리 생성', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: fileMkdirExecutor,
}

// ============================================================
// file.zip - 압축/해제
// ============================================================

const fileZipExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const mode = (config.mode || 'compress') as 'compress' | 'extract'
    const source = (inputs.source || config.source) as string
    const destination = (inputs.destination || config.destination) as string

    if (!source) {
      return { success: false, outputs: {}, error: '원본 경로가 필요합니다' }
    }

    try {
      if (mode === 'compress') {
        const result = await invoke<{ path: string; size: number }>('tool_file_zip', {
          source,
          destination: destination || `${source}.zip`,
          format: config.format || 'zip',
        })

        return {
          success: true,
          outputs: { path: result.path, size: result.size },
          metadata: { executionTime: Date.now() - startTime },
        }
      } else {
        const result = await invoke<{ path: string; filesCount: number }>('tool_file_unzip', {
          source,
          destination: destination || source.replace(/\.(zip|tar|gz)$/, ''),
        })

        return {
          success: true,
          outputs: { path: result.path, filesCount: result.filesCount },
          metadata: { executionTime: Date.now() - startTime },
        }
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const fileZip: UnifiedToolDefinition = {
  name: 'file.zip',
  version: '1.0.0',
  description: '파일/디렉토리를 압축하거나 압축 파일을 해제합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: '원본 경로' },
      destination: { type: 'string', description: '대상 경로' },
      mode: { type: 'string', enum: ['compress', 'extract'], default: 'compress' },
      format: { type: 'string', enum: ['zip', 'tar', 'tar.gz'], default: 'zip' },
    },
    required: ['source'],
  },
  meta: {
    label: '압축/해제',
    description: '파일을 압축하거나 해제합니다',
    icon: 'Archive',
    color: '#3b82f6',
    category: 'file',
    tags: ['file', 'zip', 'compress', 'extract', 'archive', '압축', '해제'],
  },
  ports: {
    inputs: [
      { name: 'source', type: 'text', required: true, description: '원본 경로' },
      { name: 'destination', type: 'text', required: false, description: '대상 경로' },
    ],
    outputs: [
      { name: 'path', type: 'text', required: true, description: '결과 경로' },
      { name: 'size', type: 'number', required: false, description: '압축 파일 크기' },
      { name: 'filesCount', type: 'number', required: false, description: '해제된 파일 수' },
    ],
  },
  configSchema: [
    { key: 'source', label: '원본 경로', type: 'file', required: true },
    { key: 'destination', label: '대상 경로', type: 'text' },
    {
      key: 'mode', label: '모드', type: 'select', default: 'compress',
      options: [
        { value: 'compress', label: '압축' },
        { value: 'extract', label: '해제' },
      ],
    },
    {
      key: 'format', label: '형식', type: 'select', default: 'zip',
      options: [
        { value: 'zip', label: 'ZIP' },
        { value: 'tar', label: 'TAR' },
        { value: 'tar.gz', label: 'TAR.GZ' },
      ],
    },
  ],
  runtime: 'tauri',
  executor: fileZipExecutor,
}

// ============================================================
// Export All File Tools
// ============================================================

export const FILE_TOOLS: UnifiedToolDefinition[] = [
  fileRead,
  fileWrite,
  fileAppend,
  fileDelete,
  fileCopy,
  fileMove,
  fileRename,
  fileList,
  fileInfo,
  fileExists,
  fileMkdir,
  fileZip,
]
