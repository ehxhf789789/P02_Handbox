/**
 * Handbox MCP 모듈
 *
 * Handbox의 MCP(Model Context Protocol) 기능을 제공합니다.
 *
 * 주요 기능:
 * - HandboxMCPTools: Handbox 내부 기능을 MCP 도구로 노출
 * - HandboxMCPServer: MCP 프로토콜 서버 서비스
 *
 * 사용 예시:
 * ```typescript
 * import { callTool, initHandboxMCPServer } from '@/mcp'
 *
 * // MCP 서버 초기화
 * initHandboxMCPServer({ enableLogging: true })
 *
 * // 도구 직접 호출
 * const result = await callTool('handbox_persona_list', { active_only: true })
 * ```
 */

// 도구 정의 및 실행기
export {
  HANDBOX_MCP_TOOLS,
  executeHandboxMCPTool,
  getToolsForMCPProtocol,
  getToolsByCategory,
  type MCPToolSchema,
  type MCPToolResult,
} from './HandboxMCPTools'

// MCP 서버 서비스
export {
  initHandboxMCPServer,
  handleMCPRequest,
  updateServerConfig,
  getServerConfig,
  getServerStatus,
  getRequestLog,
  getToolSchema,
  callTool,
  type HandboxMCPServerConfig,
  type MCPServerStatus,
} from './HandboxMCPServer'
