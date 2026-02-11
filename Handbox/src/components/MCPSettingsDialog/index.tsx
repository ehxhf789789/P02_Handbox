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
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CloudIcon from '@mui/icons-material/Cloud'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import { useAppStore, MCPServerConfig } from '../../stores/appStore'

interface MCPSettingsDialogProps {
  open: boolean
  onClose: () => void
}

// 인기있는 MCP 서버 프리셋
const MCP_PRESETS = [
  {
    name: 'Filesystem',
    description: '로컬 파일 시스템 접근',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-filesystem', '/path/to/allowed/dir'],
    category: '파일시스템',
  },
  {
    name: 'GitHub',
    description: 'GitHub API 접근',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-github'],
    env: { GITHUB_TOKEN: '' },
    category: '개발',
  },
  {
    name: 'Brave Search',
    description: 'Brave 검색 엔진',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    category: '검색',
  },
  {
    name: 'PostgreSQL',
    description: 'PostgreSQL 데이터베이스',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-postgres', 'postgresql://user:pass@localhost/db'],
    category: '데이터베이스',
  },
  {
    name: 'Slack',
    description: 'Slack 워크스페이스',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-slack'],
    env: { SLACK_TOKEN: '' },
    category: '협업',
  },
  {
    name: 'Memory',
    description: '메모리 저장소 (세션 유지)',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-memory'],
    category: '유틸리티',
  },
  {
    name: 'Puppeteer',
    description: '웹 브라우저 자동화',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-puppeteer'],
    category: '자동화',
  },
  {
    name: 'SQLite',
    description: 'SQLite 데이터베이스',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-sqlite', '/path/to/database.db'],
    category: '데이터베이스',
  },
]

export default function MCPSettingsDialog({ open, onClose }: MCPSettingsDialogProps) {
  const { mcpServers, addMCPServer, removeMCPServer, updateMCPServer } = useAppStore()

  const [newServer, setNewServer] = useState<Partial<MCPServerConfig>>({
    name: '',
    command: 'npx',
    args: [],
    env: {},
  })
  const [argsText, setArgsText] = useState('')
  const [envText, setEnvText] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')

  const handleAddServer = () => {
    if (!newServer.name || !newServer.command) return

    const args = argsText.split('\n').filter(Boolean)
    const env: Record<string, string> = {}
    envText.split('\n').filter(Boolean).forEach((line) => {
      const [key, ...valueParts] = line.split('=')
      if (key) env[key.trim()] = valueParts.join('=').trim()
    })

    addMCPServer({
      id: `mcp_${Date.now()}`,
      name: newServer.name,
      command: newServer.command,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
      enabled: true,
      status: 'disconnected',
    })

    // Reset form
    setNewServer({ name: '', command: 'npx', args: [], env: {} })
    setArgsText('')
    setEnvText('')
    setSelectedPreset('')
  }

  const handleApplyPreset = (presetName: string) => {
    const preset = MCP_PRESETS.find((p) => p.name === presetName)
    if (!preset) return

    setNewServer({
      name: preset.name,
      command: preset.command,
    })
    setArgsText(preset.args.join('\n'))
    if (preset.env) {
      setEnvText(Object.entries(preset.env).map(([k, v]) => `${k}=${v}`).join('\n'))
    } else {
      setEnvText('')
    }
    setSelectedPreset(presetName)
  }

  const handleToggleServer = (id: string, enabled: boolean) => {
    updateMCPServer(id, { enabled })
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
        },
      }}
    >
      <DialogTitle sx={{ color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
        <CloudIcon sx={{ color: '#6366f1' }} />
        MCP (Model Context Protocol) 설정
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {/* 설명 */}
        <Alert severity="info" sx={{ mb: 3, '& .MuiAlert-message': { fontSize: '0.85rem' } }}>
          MCP 서버를 연결하면 AI가 외부 도구와 데이터에 접근할 수 있습니다.
          파일 시스템, 데이터베이스, API 등 다양한 확장 기능을 사용할 수 있습니다.
        </Alert>

        {/* 등록된 서버 목록 */}
        <Typography variant="subtitle2" color="grey.400" sx={{ mb: 1 }}>
          등록된 MCP 서버 ({mcpServers.length})
        </Typography>

        {mcpServers.length === 0 ? (
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
              등록된 MCP 서버가 없습니다. 아래에서 추가하세요.
            </Typography>
          </Box>
        ) : (
          <List sx={{ mb: 3 }}>
            {mcpServers.map((server: any) => (
              <ListItem
                key={server.id}
                sx={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 1,
                  mb: 1,
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
                  {server.status === 'connected' ? (
                    <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 20 }} />
                  ) : server.status === 'error' ? (
                    <ErrorIcon sx={{ color: '#ef4444', fontSize: 20 }} />
                  ) : (
                    <CloudIcon sx={{ color: '#6b7280', fontSize: 20 }} />
                  )}
                </Box>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography color="white">{server.name}</Typography>
                      <Chip
                        label={server.enabled ? '활성' : '비활성'}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          background: server.enabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: server.enabled ? '#4ade80' : '#f87171',
                        }}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="grey.500">
                      {server.command} {server.args?.join(' ')}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={() => handleToggleServer(server.id, !server.enabled)}
                    sx={{ color: 'grey.500', mr: 1 }}
                  >
                    <RefreshIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => removeMCPServer(server.id)}
                    sx={{ color: '#ef4444' }}
                  >
                    <DeleteIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* 새 서버 추가 */}
        <Accordion
          defaultExpanded
          sx={{ background: 'transparent', '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
            <Typography variant="subtitle2" color="grey.400" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AddIcon sx={{ fontSize: 18 }} />
              새 MCP 서버 추가
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* 프리셋 선택 */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel sx={{ color: 'grey.400' }}>프리셋 선택 (선택사항)</InputLabel>
              <Select
                value={selectedPreset}
                onChange={(e) => handleApplyPreset(e.target.value)}
                label="프리셋 선택 (선택사항)"
                sx={{ color: 'white' }}
              >
                <MenuItem value="">직접 입력</MenuItem>
                {MCP_PRESETS.map((preset) => (
                  <MenuItem key={preset.name} value={preset.name}>
                    <Box>
                      <Typography variant="body2">{preset.name}</Typography>
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
                label="서버 이름"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                sx={{ flex: 1 }}
                InputProps={{ sx: { color: 'white' } }}
                InputLabelProps={{ sx: { color: 'grey.400' } }}
              />
              <TextField
                label="명령어"
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
              multiline
              rows={2}
              label="인자 (한 줄에 하나씩)"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              sx={{ mb: 2 }}
              InputProps={{ sx: { color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' } }}
              InputLabelProps={{ sx: { color: 'grey.400' } }}
              placeholder="-y
@anthropic/mcp-server-filesystem
/allowed/path"
            />

            <TextField
              fullWidth
              multiline
              rows={2}
              label="환경 변수 (KEY=VALUE 형식)"
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              sx={{ mb: 2 }}
              InputProps={{ sx: { color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' } }}
              InputLabelProps={{ sx: { color: 'grey.400' } }}
              placeholder="API_KEY=your-api-key
SECRET=your-secret"
            />

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddServer}
              disabled={!newServer.name || !newServer.command}
              sx={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              }}
            >
              서버 추가
            </Button>
          </AccordionDetails>
        </Accordion>
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <Button onClick={onClose} sx={{ color: 'grey.400' }}>
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  )
}
