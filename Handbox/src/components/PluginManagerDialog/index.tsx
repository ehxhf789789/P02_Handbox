/**
 * PluginManagerDialog — Tier 2 플러그인 관리 UI
 *
 * 기능:
 * - 설치된 플러그인 목록 (상태 뱃지: running/stopped/error)
 * - 시작/중지/제거 버튼
 * - 도구 목록 펼치기
 * - 새 플러그인 설치 (GitHub URL 입력 또는 추천 목록)
 */

import { useState, useCallback, useEffect, memo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Divider,
  Grid,
  Card,
  CardContent,
  CardActions,
} from '@mui/material'
import ExtensionIcon from '@mui/icons-material/Extension'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'
import GitHubIcon from '@mui/icons-material/GitHub'
import DownloadIcon from '@mui/icons-material/Download'
import { usePluginStore } from '../../plugins/PluginStore'
import { PluginManager } from '../../plugins/PluginManager'
import type { PluginManifest, RecommendedPlugin } from '../../plugins/types'

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface PluginManagerDialogProps {
  open: boolean
  onClose: () => void
}

// ─────────────────────────────────────────────
// 상태 뱃지 색상
// ─────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  running: '#22c55e',
  installed: '#6366f1',
  stopped: '#94a3b8',
  error: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  running: '실행 중',
  installed: '설치됨',
  stopped: '중지됨',
  error: '오류',
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

function PluginManagerDialogContent({ open, onClose }: PluginManagerDialogProps) {
  const { plugins, availablePlugins, loading, error, clearError } = usePluginStore()
  const [tabIndex, setTabIndex] = useState(0)
  const [installUrl, setInstallUrl] = useState('')
  const [installing, setInstalling] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  // 다이얼로그 열릴 때 데이터 새로고침
  useEffect(() => {
    if (open) {
      PluginManager.refresh().catch(() => {})
      usePluginStore.getState().fetchAvailablePlugins().catch(() => {})
    }
  }, [open])

  // ── 설치 핸들러 ──
  const handleInstall = useCallback(async () => {
    if (!installUrl.trim()) return
    setInstalling(true)
    setLocalError(null)
    try {
      await PluginManager.installAndStart({ source: installUrl.trim() })
      setInstallUrl('')
    } catch (err) {
      setLocalError(String(err))
    } finally {
      setInstalling(false)
    }
  }, [installUrl])

  // ── 추천 플러그인 설치 ──
  const handleInstallRecommended = useCallback(async (rec: RecommendedPlugin) => {
    setActionLoading(rec.name)
    setLocalError(null)
    try {
      await PluginManager.installRecommended(rec)
    } catch (err) {
      setLocalError(String(err))
    } finally {
      setActionLoading(null)
    }
  }, [])

  // ── 시작/중지/제거 핸들러 ──
  const handleStart = useCallback(async (pluginId: string) => {
    setActionLoading(pluginId)
    try {
      await PluginManager.start(pluginId)
    } catch (err) {
      setLocalError(String(err))
    } finally {
      setActionLoading(null)
    }
  }, [])

  const handleStop = useCallback(async (pluginId: string) => {
    setActionLoading(pluginId)
    try {
      await PluginManager.stop(pluginId)
    } catch (err) {
      setLocalError(String(err))
    } finally {
      setActionLoading(null)
    }
  }, [])

  const handleUninstall = useCallback(async (pluginId: string) => {
    setActionLoading(pluginId)
    try {
      await PluginManager.uninstall(pluginId)
    } catch (err) {
      setLocalError(String(err))
    } finally {
      setActionLoading(null)
    }
  }, [])

  // ── 플러그인 목록 필터링 ──
  const pluginList = Object.values(plugins)
  const filteredPlugins = searchQuery
    ? pluginList.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : pluginList

  const installedPluginNames = new Set(pluginList.map(p => p.name))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          background: '#1e293b',
          color: 'white',
          minHeight: 550,
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 3,
        },
      }}
    >
      {/* ── 타이틀 ── */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          pb: 2,
        }}
      >
        <ExtensionIcon sx={{ color: '#6366f1' }} />
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
          플러그인 관리
        </Typography>
        <Chip
          label={`${pluginList.length}개 설치됨`}
          size="small"
          sx={{ bgcolor: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
        />
        <IconButton onClick={onClose} sx={{ color: 'grey.400' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* ── 탭 ── */}
      <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setTabIndex(v)}
          sx={{
            '& .MuiTab-root': { color: 'grey.500', textTransform: 'none', fontWeight: 600 },
            '& .Mui-selected': { color: '#6366f1' },
            '& .MuiTabs-indicator': { backgroundColor: '#6366f1' },
          }}
        >
          <Tab label="설치된 플러그인" />
          <Tab label="플러그인 스토어" />
          <Tab label="수동 설치" />
        </Tabs>
      </Box>

      {/* ── 에러 메시지 ── */}
      {(error || localError) && (
        <Alert
          severity="error"
          onClose={() => { clearError(); setLocalError(null) }}
          sx={{ mx: 2, mt: 1 }}
        >
          {localError || error}
        </Alert>
      )}

      <DialogContent sx={{ bgcolor: '#0f172a', p: 0, minHeight: 350 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress sx={{ color: '#6366f1' }} />
          </Box>
        )}

        {/* ── 탭 0: 설치된 플러그인 ── */}
        {tabIndex === 0 && !loading && (
          <Box sx={{ p: 2 }}>
            {/* 검색 */}
            <TextField
              fullWidth
              size="small"
              placeholder="플러그인 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'grey.500' }} />
                  </InputAdornment>
                ),
                sx: { bgcolor: '#1e293b', color: 'white', borderRadius: 2 },
              }}
              sx={{ mb: 2 }}
            />

            {filteredPlugins.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <ExtensionIcon sx={{ fontSize: 48, color: 'grey.600', mb: 1 }} />
                <Typography color="grey.500">
                  {searchQuery ? '검색 결과가 없습니다' : '설치된 플러그인이 없습니다'}
                </Typography>
                <Button
                  size="small"
                  sx={{ mt: 1, color: '#6366f1' }}
                  onClick={() => setTabIndex(1)}
                >
                  플러그인 스토어 둘러보기
                </Button>
              </Box>
            ) : (
              filteredPlugins.map(plugin => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  actionLoading={actionLoading}
                  onStart={handleStart}
                  onStop={handleStop}
                  onUninstall={handleUninstall}
                />
              ))
            )}
          </Box>
        )}

        {/* ── 탭 1: 플러그인 스토어 ── */}
        {tabIndex === 1 && !loading && (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="grey.400" sx={{ mb: 2 }}>
              MCP 에코시스템에서 검증된 추천 플러그인입니다. 원클릭으로 설치할 수 있습니다.
            </Typography>
            <Grid container spacing={2}>
              {availablePlugins.map(rec => (
                <Grid item xs={12} sm={6} key={rec.name}>
                  <Card
                    sx={{
                      bgcolor: '#1e293b',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 2,
                      '&:hover': { borderColor: 'rgba(99,102,241,0.3)' },
                    }}
                  >
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <GitHubIcon sx={{ color: 'grey.500', fontSize: 18 }} />
                        <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 600 }}>
                          {rec.name}
                        </Typography>
                        <Chip
                          label={rec.category}
                          size="small"
                          sx={{ ml: 'auto', height: 20, fontSize: 11, bgcolor: 'rgba(99,102,241,0.1)', color: '#a5b4fc' }}
                        />
                      </Box>
                      <Typography variant="body2" color="grey.400" sx={{ fontSize: 12, lineHeight: 1.4 }}>
                        {rec.description}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ pt: 0, pb: 1.5, px: 2 }}>
                      {installedPluginNames.has(rec.name) ? (
                        <Chip label="설치됨" size="small" sx={{ bgcolor: 'rgba(34,197,94,0.15)', color: '#4ade80' }} />
                      ) : (
                        <Button
                          size="small"
                          startIcon={actionLoading === rec.name ? <CircularProgress size={14} /> : <DownloadIcon />}
                          disabled={actionLoading === rec.name}
                          onClick={() => handleInstallRecommended(rec)}
                          sx={{ color: '#6366f1', textTransform: 'none', fontWeight: 600 }}
                        >
                          설치
                        </Button>
                      )}
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* ── 탭 2: 수동 설치 ── */}
        {tabIndex === 2 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="grey.400" sx={{ mb: 2 }}>
              GitHub MCP 서버 URL, npm 패키지, 또는 로컬 경로를 입력하여 플러그인을 설치합니다.
            </Typography>

            <TextField
              fullWidth
              label="플러그인 소스"
              placeholder="https://github.com/owner/repo 또는 @scope/package"
              value={installUrl}
              onChange={(e) => setInstallUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <GitHubIcon sx={{ color: 'grey.500' }} />
                  </InputAdornment>
                ),
                sx: { bgcolor: '#1e293b', color: 'white', borderRadius: 2 },
              }}
              InputLabelProps={{ sx: { color: 'grey.500' } }}
              sx={{ mb: 2 }}
            />

            <Button
              variant="contained"
              fullWidth
              startIcon={installing ? <CircularProgress size={18} color="inherit" /> : <AddIcon />}
              disabled={installing || !installUrl.trim()}
              onClick={handleInstall}
              sx={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                textTransform: 'none',
                fontWeight: 600,
                py: 1.2,
              }}
            >
              {installing ? '설치 중...' : '플러그인 설치'}
            </Button>

            <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />

            <Typography variant="caption" color="grey.500">
              지원 소스 형식:
            </Typography>
            <Box sx={{ mt: 1 }}>
              {[
                'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
                '@modelcontextprotocol/server-brave-search',
                '/path/to/local/mcp-server',
              ].map(example => (
                <Box
                  key={example}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 0.8,
                    mb: 0.5,
                    borderRadius: 1,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(99,102,241,0.08)' },
                  }}
                  onClick={() => setInstallUrl(example)}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: 'grey.400', fontFamily: 'monospace', fontSize: 11 }}
                  >
                    {example}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => PluginManager.refresh()}
          sx={{ color: 'grey.400', textTransform: 'none' }}
        >
          새로고침
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} sx={{ color: 'grey.400', textTransform: 'none' }}>
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─────────────────────────────────────────────
// 플러그인 카드 서브컴포넌트
// ─────────────────────────────────────────────

interface PluginCardProps {
  plugin: PluginManifest
  actionLoading: string | null
  onStart: (id: string) => void
  onStop: (id: string) => void
  onUninstall: (id: string) => void
}

function PluginCard({ plugin, actionLoading, onStart, onStop, onUninstall }: PluginCardProps) {
  const isLoading = actionLoading === plugin.id
  const statusColor = STATUS_COLORS[plugin.status] || '#94a3b8'
  const statusLabel = STATUS_LABELS[plugin.status] || plugin.status

  return (
    <Accordion
      sx={{
        bgcolor: '#1e293b',
        color: 'white',
        mb: 1,
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px !important',
        '&:before': { display: 'none' },
        '&.Mui-expanded': { borderColor: 'rgba(99,102,241,0.2)' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: 'grey.500' }} />}
        sx={{ '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5 } }}
      >
        <Box
          sx={{
            width: 8, height: 8, borderRadius: '50%',
            bgcolor: statusColor,
            boxShadow: plugin.status === 'running' ? `0 0 8px ${statusColor}` : 'none',
          }}
        />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {plugin.name}
          </Typography>
          <Typography variant="caption" color="grey.500">
            {plugin.category} · {plugin.runtime} · v{plugin.version}
          </Typography>
        </Box>
        <Chip
          label={statusLabel}
          size="small"
          sx={{
            height: 22,
            fontSize: 11,
            fontWeight: 600,
            bgcolor: `${statusColor}18`,
            color: statusColor,
            mr: 1,
          }}
        />
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {plugin.description && (
          <Typography variant="body2" color="grey.400" sx={{ mb: 1.5, fontSize: 13 }}>
            {plugin.description}
          </Typography>
        )}

        {/* 도구 목록 */}
        {plugin.tools_discovered.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="grey.500" sx={{ mb: 0.5, display: 'block' }}>
              발견된 도구 ({plugin.tools_discovered.length}):
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {plugin.tools_discovered.map(tool => (
                <Chip
                  key={tool}
                  label={tool}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 22, fontSize: 11,
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: 'grey.400',
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* 에러 메시지 */}
        {plugin.error && (
          <Alert severity="error" sx={{ mb: 1.5, fontSize: 12 }}>
            {plugin.error}
          </Alert>
        )}

        {/* 정보 */}
        <Typography variant="caption" color="grey.600" sx={{ display: 'block', mb: 1 }}>
          설치일: {new Date(plugin.installed_at).toLocaleDateString('ko-KR')} ·
          경로: {plugin.install_path}
        </Typography>

        {/* 액션 버튼 */}
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          {plugin.status === 'running' ? (
            <Button
              size="small"
              startIcon={isLoading ? <CircularProgress size={14} /> : <StopIcon />}
              disabled={isLoading}
              onClick={() => onStop(plugin.id)}
              sx={{ color: '#f59e0b', textTransform: 'none', fontWeight: 600 }}
            >
              중지
            </Button>
          ) : (
            <Button
              size="small"
              startIcon={isLoading ? <CircularProgress size={14} /> : <PlayArrowIcon />}
              disabled={isLoading}
              onClick={() => onStart(plugin.id)}
              sx={{ color: '#22c55e', textTransform: 'none', fontWeight: 600 }}
            >
              시작
            </Button>
          )}
          <Tooltip title="플러그인 제거">
            <IconButton
              size="small"
              disabled={isLoading}
              onClick={() => onUninstall(plugin.id)}
              sx={{ color: 'grey.500', '&:hover': { color: '#ef4444' } }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}

const PluginManagerDialog = memo(PluginManagerDialogContent)
export default PluginManagerDialog
