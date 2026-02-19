// CLI Provider Dialog
// CLI 프로바이더 감지 및 관리 UI

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
  Collapse,
  LinearProgress,
} from '@mui/material'
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Cloud as CloudIcon,
  Psychology as PsychologyIcon,
  Dns as DnsIcon,
  Hub as HubIcon,
  Terminal as TerminalIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material'
import {
  detectCLIProviders,
  testAWSCLICredentials,
  CLIDetectionResult,
  CLI_PROVIDER_META,
  CLIProviderType,
} from '../../adapters/cli'

interface CLIProviderDialogProps {
  open: boolean
  onClose: () => void
}

export default function CLIProviderDialog({ open, onClose }: CLIProviderDialogProps) {
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CLIDetectionResult | null>(null)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [testingAWS, setTestingAWS] = useState(false)
  const [awsTestResult, setAwsTestResult] = useState<any>(null)

  useEffect(() => {
    if (open) {
      handleDetect()
    }
  }, [open])

  const handleDetect = async () => {
    setDetecting(true)
    setError(null)
    try {
      const detection = await detectCLIProviders()
      setResult(detection)
    } catch (e) {
      setError(String(e))
    } finally {
      setDetecting(false)
    }
  }

  const handleTestAWS = async (profile?: string) => {
    setTestingAWS(true)
    setAwsTestResult(null)
    try {
      const identity = await testAWSCLICredentials(profile)
      setAwsTestResult({ success: true, data: identity })
    } catch (e) {
      setAwsTestResult({ success: false, error: String(e) })
    } finally {
      setTestingAWS(false)
    }
  }

  const getProviderIcon = (type: CLIProviderType) => {
    switch (type) {
      case 'aws':
      case 'azure':
      case 'gcloud':
        return <CloudIcon sx={{ color: CLI_PROVIDER_META[type].color }} />
      case 'ollama':
        return <PsychologyIcon sx={{ color: CLI_PROVIDER_META[type].color }} />
      case 'docker':
        return <DnsIcon sx={{ color: CLI_PROVIDER_META[type].color }} />
      case 'kubectl':
        return <HubIcon sx={{ color: CLI_PROVIDER_META[type].color }} />
      default:
        return <TerminalIcon sx={{ color: '#6B7280' }} />
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: '#1e293b',
          color: 'white',
        }}
      >
        <TerminalIcon sx={{ color: '#10b981' }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          CLI Providers
        </Typography>
        <Tooltip title="Re-detect">
          <IconButton onClick={handleDetect} disabled={detecting} sx={{ color: 'white' }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        <IconButton onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ bgcolor: '#0f172a', color: 'white', p: 0 }}>
        {/* 로딩 표시 */}
        {detecting && <LinearProgress sx={{ bgcolor: '#334155' }} />}

        {/* 에러 표시 */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {/* 설명 */}
        <Alert severity="info" sx={{ m: 2, '& .MuiAlert-message': { fontSize: '0.85rem' } }}>
          Detected CLI tools on your system. These can be used to interact with cloud services,
          run local LLMs, and execute commands within workflows.
        </Alert>

        {/* 요약 */}
        {result && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Typography variant="body2" color="grey.400">
              Found {result.total_installed} of {result.providers.length} CLI providers installed
            </Typography>
          </Box>
        )}

        {/* 프로바이더 목록 */}
        {result && (
          <List sx={{ p: 0 }}>
            {result.providers.map((provider) => (
              <Box key={provider.provider_type}>
                <ListItem
                  sx={{
                    bgcolor: provider.installed ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid #334155',
                    cursor: 'pointer',
                  }}
                  onClick={() =>
                    setExpandedProvider(
                      expandedProvider === provider.provider_type ? null : provider.provider_type
                    )
                  }
                >
                  <Box sx={{ mr: 2 }}>{getProviderIcon(provider.provider_type as CLIProviderType)}</Box>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1">{provider.name}</Typography>
                        {provider.installed ? (
                          <CheckCircleIcon sx={{ color: '#10b981', fontSize: 18 }} />
                        ) : (
                          <ErrorIcon sx={{ color: '#6b7280', fontSize: 18 }} />
                        )}
                        {provider.version && (
                          <Chip
                            label={`v${provider.version}`}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              bgcolor: '#334155',
                              color: '#94a3b8',
                            }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="grey.500">
                        {provider.installed
                          ? CLI_PROVIDER_META[provider.provider_type as CLIProviderType]?.description
                          : provider.error || 'Not installed'}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      sx={{ color: '#94a3b8' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedProvider(
                          expandedProvider === provider.provider_type ? null : provider.provider_type
                        )
                      }}
                    >
                      {expandedProvider === provider.provider_type ? (
                        <ExpandLessIcon />
                      ) : (
                        <ExpandMoreIcon />
                      )}
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>

                {/* 확장 상세 정보 */}
                <Collapse in={expandedProvider === provider.provider_type}>
                  <Box sx={{ bgcolor: '#1e293b', p: 2 }}>
                    {provider.installed && (
                      <>
                        {/* 프로파일/모델 목록 */}
                        {provider.profiles.length > 0 && (
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" color="grey.400" sx={{ mb: 1, display: 'block' }}>
                              {provider.provider_type === 'ollama'
                                ? 'Available Models:'
                                : 'Profiles / Contexts:'}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {provider.profiles.map((profile) => (
                                <Chip
                                  key={profile}
                                  label={profile}
                                  size="small"
                                  sx={{
                                    height: 22,
                                    fontSize: '0.7rem',
                                    bgcolor:
                                      profile === provider.current_profile
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : 'rgba(99, 102, 241, 0.15)',
                                    color: profile === provider.current_profile ? '#34d399' : '#a5b4fc',
                                    border:
                                      profile === provider.current_profile
                                        ? '1px solid #10b981'
                                        : 'none',
                                  }}
                                />
                              ))}
                            </Box>
                          </Box>
                        )}

                        {/* 현재 프로파일/리전 */}
                        {(provider.current_profile || provider.region) && (
                          <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
                            {provider.current_profile && (
                              <Typography variant="caption" color="grey.400">
                                Current:{' '}
                                <span style={{ color: '#10b981' }}>{provider.current_profile}</span>
                              </Typography>
                            )}
                            {provider.region && (
                              <Typography variant="caption" color="grey.400">
                                Region: <span style={{ color: '#f59e0b' }}>{provider.region}</span>
                              </Typography>
                            )}
                          </Box>
                        )}

                        {/* AWS 자격증명 테스트 */}
                        {provider.provider_type === 'aws' && (
                          <Box>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={
                                testingAWS ? <CircularProgress size={14} /> : <PlayArrowIcon />
                              }
                              onClick={() => handleTestAWS(provider.current_profile || undefined)}
                              disabled={testingAWS}
                              sx={{
                                color: '#10b981',
                                borderColor: '#10b981',
                                '&:hover': { borderColor: '#34d399', bgcolor: 'rgba(16,185,129,0.1)' },
                              }}
                            >
                              Test AWS Credentials
                            </Button>

                            {awsTestResult && (
                              <Box sx={{ mt: 2 }}>
                                {awsTestResult.success ? (
                                  <Alert severity="success" sx={{ fontSize: '0.8rem' }}>
                                    <Typography variant="caption" component="div">
                                      Account: {awsTestResult.data.Account}
                                    </Typography>
                                    <Typography variant="caption" component="div">
                                      User: {awsTestResult.data.UserId}
                                    </Typography>
                                  </Alert>
                                ) : (
                                  <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                                    {awsTestResult.error}
                                  </Alert>
                                )}
                              </Box>
                            )}
                          </Box>
                        )}

                        {/* 문서 링크 */}
                        {CLI_PROVIDER_META[provider.provider_type as CLIProviderType]?.docsUrl && (
                          <Box sx={{ mt: 2 }}>
                            <Button
                              size="small"
                              href={CLI_PROVIDER_META[provider.provider_type as CLIProviderType].docsUrl}
                              target="_blank"
                              sx={{ color: '#64748b', fontSize: '0.75rem' }}
                            >
                              View Documentation
                            </Button>
                          </Box>
                        )}
                      </>
                    )}

                    {!provider.installed && (
                      <Box>
                        <Typography variant="body2" color="grey.500" sx={{ mb: 1 }}>
                          {provider.name} is not installed on this system.
                        </Typography>
                        {CLI_PROVIDER_META[provider.provider_type as CLIProviderType]?.docsUrl && (
                          <Button
                            size="small"
                            href={CLI_PROVIDER_META[provider.provider_type as CLIProviderType].docsUrl}
                            target="_blank"
                            sx={{ color: '#6366f1' }}
                          >
                            Installation Guide
                          </Button>
                        )}
                      </Box>
                    )}
                  </Box>
                </Collapse>
              </Box>
            ))}
          </List>
        )}

        {/* 로딩 중 */}
        {detecting && !result && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={32} sx={{ color: '#6366f1' }} />
            <Typography variant="body2" color="grey.500" sx={{ mt: 2 }}>
              Detecting installed CLI tools...
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ bgcolor: '#1e293b', borderTop: '1px solid #334155' }}>
        <Typography variant="caption" color="grey.500" sx={{ flexGrow: 1, ml: 2 }}>
          CLI tools are detected from system PATH
        </Typography>
        <Button onClick={onClose} sx={{ color: '#94a3b8' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
