// MCP Settings Dialog
// MCP 서버 관리 및 연결 UI

import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  CircularProgress,
  Tooltip,
  Badge,
  Collapse,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CloudIcon from '@mui/icons-material/Cloud'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import BuildIcon from '@mui/icons-material/Build'
import FolderIcon from '@mui/icons-material/Folder'
import CloseIcon from '@mui/icons-material/Close'
import {
  useMCPStore,
  MCP_SERVER_PRESETS,
  MCP_STATUS_COLORS,
  MCP_STATUS_LABELS,
  MCPServerConfig,
} from '../../stores/mcpStore'

interface MCPSettingsDialogProps {
  open: boolean
  onClose: () => void
}

export default function MCPSettingsDialog({ open, onClose }: MCPSettingsDialogProps) {
  const {
    servers,
    loading,
    error,
    addServer,
    removeServer,
    startServer,
    stopServer,
    clearError,
  } = useMCPStore()

  // 폼 상태
  const [newServer, setNewServer] = useState({
    name: '',
    command: 'npx',
    description: '',
  })
  const [argsText, setArgsText] = useState('')
  const [envText, setEnvText] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')
  const [expandedServer, setExpandedServer] = useState<string | null>(null)

  const serverList = Object.values(servers)
  const connectedCount = serverList.filter((s) => s.status === 'connected').length

  const handleAddServer = () => {
    if (!newServer.name || !newServer.command) return

    const args = argsText.split('\n').filter(Boolean)
    const env: Record<string, string> = {}
    envText
      .split('\n')
      .filter(Boolean)
      .forEach((line) => {
        const [key, ...valueParts] = line.split('=')
        if (key) env[key.trim()] = valueParts.join('=').trim()
      })

    addServer({
      id: `mcp_${Date.now()}`,
      name: newServer.name,
      command: newServer.command,
      description: newServer.description || undefined,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
      enabled: true,
      autoStart: false,
      restartOnCrash: true,
    })

    // 폼 초기화
    setNewServer({ name: '', command: 'npx', description: '' })
    setArgsText('')
    setEnvText('')
    setSelectedPreset('')
  }

  const handleApplyPreset = (presetId: string) => {
    const preset = MCP_SERVER_PRESETS.find((p) => p.id === presetId)
    if (!preset) return

    setNewServer({
      name: preset.name,
      command: preset.command,
      description: preset.description || '',
    })
    setArgsText(preset.args.join('\n'))
    if (preset.env) {
      setEnvText(Object.entries(preset.env).map(([k, v]) => `${k}=${v}`).join('\n'))
    } else {
      setEnvText('')
    }
    setSelectedPreset(presetId)
  }

  const handleStartServer = async (serverId: string) => {
    await startServer(serverId)
  }

  const handleStopServer = async (serverId: string) => {
    await stopServer(serverId)
  }

  const handleRemoveServer = async (serverId: string) => {
    if (window.confirm('Are you sure you want to remove this server?')) {
      await removeServer(serverId)
    }
  }

  const getStatusIcon = (status: MCPServerConfig['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircleIcon sx={{ color: MCP_STATUS_COLORS.connected, fontSize: 20 }} />
      case 'starting':
      case 'reconnecting':
        return <CircularProgress size={16} sx={{ color: MCP_STATUS_COLORS.starting }} />
      case 'error':
        return <ErrorIcon sx={{ color: MCP_STATUS_COLORS.error, fontSize: 20 }} />
      default:
        return <CloudIcon sx={{ color: MCP_STATUS_COLORS.stopped, fontSize: 20 }} />
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          background: '#1e293b',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 3,
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle
        sx={{
          color: 'white',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Badge badgeContent={connectedCount} color="success" max={99}>
          <CloudIcon sx={{ color: '#6366f1' }} />
        </Badge>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          MCP Server Manager
        </Typography>
        <IconButton onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3, bgcolor: '#0f172a' }}>
        {/* 에러 표시 */}
        {error && (
          <Alert severity="error" onClose={clearError} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* 설명 */}
        <Alert severity="info" sx={{ mb: 3, '& .MuiAlert-message': { fontSize: '0.85rem' } }}>
          MCP (Model Context Protocol) servers extend AI capabilities with external tools and data
          sources. Connect servers to enable file access, database queries, API calls, and more.
        </Alert>

        {/* 등록된 서버 목록 */}
        <Typography variant="subtitle2" color="grey.400" sx={{ mb: 1 }}>
          Registered Servers ({serverList.length})
        </Typography>

        {serverList.length === 0 ? (
          <Box
            sx={{
              p: 3,
              borderRadius: 2,
              border: '1px dashed rgba(255,255,255,0.2)',
              textAlign: 'center',
              mb: 3,
            }}
          >
            <Typography variant="body2" color="grey.500">
              No MCP servers registered. Add one below or select a preset.
            </Typography>
          </Box>
        ) : (
          <List sx={{ mb: 3 }}>
            {serverList.map((server) => (
              <Box key={server.id}>
                <ListItem
                  sx={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 1,
                    mb: 1,
                    border: `1px solid ${
                      server.status === 'connected'
                        ? 'rgba(16, 185, 129, 0.3)'
                        : server.status === 'error'
                        ? 'rgba(239, 68, 68, 0.3)'
                        : 'rgba(255,255,255,0.1)'
                    }`,
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    cursor: 'pointer',
                  }}
                  onClick={() =>
                    setExpandedServer(expandedServer === server.id ? null : server.id)
                  }
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
                      {getStatusIcon(server.status)}
                    </Box>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography color="white">{server.name}</Typography>
                          <Chip
                            label={MCP_STATUS_LABELS[server.status]}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              background: `${MCP_STATUS_COLORS[server.status]}20`,
                              color: MCP_STATUS_COLORS[server.status],
                            }}
                          />
                          {server.tools.length > 0 && (
                            <Chip
                              icon={<BuildIcon sx={{ fontSize: 12 }} />}
                              label={`${server.tools.length} tools`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                background: 'rgba(99, 102, 241, 0.2)',
                                color: '#818cf8',
                              }}
                            />
                          )}
                          {server.resources.length > 0 && (
                            <Chip
                              icon={<FolderIcon sx={{ fontSize: 12 }} />}
                              label={`${server.resources.length} resources`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                background: 'rgba(245, 158, 11, 0.2)',
                                color: '#fbbf24',
                              }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="grey.500">
                          {server.command} {server.args?.slice(0, 3).join(' ')}
                          {(server.args?.length || 0) > 3 ? '...' : ''}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      {server.status === 'connected' ? (
                        <Tooltip title="Stop Server">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStopServer(server.id)
                            }}
                            sx={{ color: '#ef4444', mr: 1 }}
                          >
                            <StopIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      ) : server.status === 'starting' ? (
                        <CircularProgress size={18} sx={{ mr: 2 }} />
                      ) : (
                        <Tooltip title="Start Server">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartServer(server.id)
                            }}
                            sx={{ color: '#10b981', mr: 1 }}
                          >
                            <PlayArrowIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Remove Server">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveServer(server.id)
                          }}
                          sx={{ color: '#ef4444' }}
                        >
                          <DeleteIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </Box>

                  {/* 확장 영역 - 도구 목록 */}
                  <Collapse in={expandedServer === server.id}>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      {server.error && (
                        <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>
                          {server.error}
                        </Alert>
                      )}

                      {server.tools.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="caption" color="grey.400" sx={{ mb: 1, display: 'block' }}>
                            Available Tools:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {server.tools.map((tool) => (
                              <Tooltip key={tool.name} title={tool.description || ''}>
                                <Chip
                                  label={tool.name}
                                  size="small"
                                  sx={{
                                    height: 22,
                                    fontSize: '0.7rem',
                                    background: 'rgba(99, 102, 241, 0.15)',
                                    color: '#a5b4fc',
                                    '&:hover': { background: 'rgba(99, 102, 241, 0.25)' },
                                  }}
                                />
                              </Tooltip>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {server.resources.length > 0 && (
                        <Box>
                          <Typography variant="caption" color="grey.400" sx={{ mb: 1, display: 'block' }}>
                            Resources:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {server.resources.map((resource) => (
                              <Tooltip key={resource.uri} title={resource.description || resource.uri}>
                                <Chip
                                  label={resource.name}
                                  size="small"
                                  sx={{
                                    height: 22,
                                    fontSize: '0.7rem',
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    color: '#fcd34d',
                                  }}
                                />
                              </Tooltip>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {server.status === 'stopped' && server.tools.length === 0 && (
                        <Typography variant="caption" color="grey.500">
                          Start the server to discover available tools and resources.
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </ListItem>
              </Box>
            ))}
          </List>
        )}

        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* 새 서버 추가 */}
        <Accordion
          defaultExpanded
          sx={{ background: 'rgba(255,255,255,0.02)', '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
            <Typography
              variant="subtitle2"
              color="grey.400"
              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <AddIcon sx={{ fontSize: 18 }} />
              Add New MCP Server
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* 프리셋 선택 */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel sx={{ color: 'grey.400' }}>Quick Start Presets</InputLabel>
              <Select
                value={selectedPreset}
                onChange={(e) => handleApplyPreset(e.target.value)}
                label="Quick Start Presets"
                sx={{ color: 'white' }}
              >
                <MenuItem value="">Manual Configuration</MenuItem>
                <Divider sx={{ my: 1 }} />
                {MCP_SERVER_PRESETS.map((preset) => (
                  <MenuItem key={preset.id} value={preset.id}>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">{preset.name}</Typography>
                        {preset.category && (
                          <Chip
                            label={preset.category}
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: '0.6rem',
                              bgcolor: 'rgba(99, 102, 241, 0.2)',
                              color: '#818cf8',
                            }}
                          />
                        )}
                      </Box>
                      <Typography variant="caption" color="grey.500">
                        {preset.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                label="Server Name"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                sx={{ flex: 1 }}
                InputProps={{ sx: { color: 'white' } }}
                InputLabelProps={{ sx: { color: 'grey.400' } }}
                placeholder="My MCP Server"
              />
              <TextField
                label="Command"
                value={newServer.command}
                onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                sx={{ flex: 1 }}
                InputProps={{ sx: { color: 'white' } }}
                InputLabelProps={{ sx: { color: 'grey.400' } }}
                placeholder="npx, node, python..."
              />
            </Box>

            <TextField
              fullWidth
              label="Description (optional)"
              value={newServer.description}
              onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
              sx={{ mb: 2 }}
              InputProps={{ sx: { color: 'white' } }}
              InputLabelProps={{ sx: { color: 'grey.400' } }}
            />

            <TextField
              fullWidth
              multiline
              rows={2}
              label="Arguments (one per line)"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              sx={{ mb: 2 }}
              InputProps={{
                sx: { color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' },
              }}
              InputLabelProps={{ sx: { color: 'grey.400' } }}
              placeholder={`-y
@anthropic-ai/mcp-server-filesystem@latest
/allowed/path`}
            />

            <TextField
              fullWidth
              multiline
              rows={2}
              label="Environment Variables (KEY=VALUE)"
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              sx={{ mb: 2 }}
              InputProps={{
                sx: { color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' },
              }}
              InputLabelProps={{ sx: { color: 'grey.400' } }}
              placeholder={`API_KEY=your-api-key
AWS_PROFILE=default`}
            />

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddServer}
              disabled={!newServer.name || !newServer.command || loading}
              sx={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              }}
            >
              Add Server
            </Button>
          </AccordionDetails>
        </Accordion>
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)', bgcolor: '#1e293b' }}>
        <Typography variant="caption" color="grey.500" sx={{ flexGrow: 1 }}>
          {connectedCount} of {serverList.length} servers connected
        </Typography>
        <Button onClick={onClose} sx={{ color: 'grey.400' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
