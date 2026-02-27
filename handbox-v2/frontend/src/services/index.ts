/**
 * Services index — Export all service modules.
 */

// Tauri backend services
export { tauriAgentService } from './TauriAgentService'
export { tauriCollaborationService } from './TauriCollaborationService'
export { tauriMarketplaceService } from './TauriMarketplaceService'
export { tauriMcpService } from './TauriMcpService'

// Local-only services (for development/fallback)
export { collaborationService } from './CollaborationService'
export { orchestrator } from './AgentOrchestrator'
export { mcpPluginService } from './McpPluginService'
