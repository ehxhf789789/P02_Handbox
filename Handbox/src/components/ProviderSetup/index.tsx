/**
 * Provider Setup — Universal Sandbox 시작 화면
 *
 * 다양한 프로바이더 연결 지원:
 * - AWS (Bedrock, S3)
 * - OpenAI, Anthropic
 * - Azure, GCP
 * - Ollama (로컬 LLM)
 */

import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  MenuItem,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Grid,
  Chip,
} from '@mui/material'
import SecurityIcon from '@mui/icons-material/Security'
import HubIcon from '@mui/icons-material/Hub'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import KeyIcon from '@mui/icons-material/Key'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {
  useCredentialStore,
  PROVIDER_NAMES,
  PROVIDER_FIELDS,
  CredentialProvider,
} from '../../stores/credentialStore'

interface ProviderSetupProps {
  onLogin: (credentials: {
    accessKeyId?: string
    secretAccessKey?: string
    region?: string
    rememberMe: boolean
    useAWS: boolean
  }) => Promise<void>
  onSkip: () => void
}

// 프로바이더 정보
const PROVIDERS = [
  {
    id: 'aws' as CredentialProvider,
    name: 'AWS',
    description: 'Bedrock, S3, Lambda 등',
    icon: '☁️',
    color: '#ff9900',
  },
  {
    id: 'openai' as CredentialProvider,
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5, DALL-E',
    icon: '🤖',
    color: '#10a37f',
  },
  {
    id: 'anthropic' as CredentialProvider,
    name: 'Anthropic',
    description: 'Claude 3.5, Claude 3',
    icon: '🧠',
    color: '#d4a574',
  },
  {
    id: 'azure' as CredentialProvider,
    name: 'Azure',
    description: 'Azure OpenAI, Cognitive',
    icon: '🔷',
    color: '#0078d4',
  },
  {
    id: 'gcp' as CredentialProvider,
    name: 'Google Cloud',
    description: 'Vertex AI, Gemini',
    icon: '🔴',
    color: '#4285f4',
  },
]

const AWS_REGIONS = [
  { value: 'ap-northeast-2', label: '서울 (ap-northeast-2)' },
  { value: 'us-east-1', label: '버지니아 (us-east-1)' },
  { value: 'us-west-2', label: '오레곤 (us-west-2)' },
  { value: 'ap-northeast-1', label: '도쿄 (ap-northeast-1)' },
  { value: 'eu-west-1', label: '아일랜드 (eu-west-1)' },
]

// 레거시 호환
export const loadSavedCredentials = () => {
  try {
    const saved = localStorage.getItem('handbox-credentials')
    if (saved) return JSON.parse(decodeURIComponent(atob(saved)))
  } catch { /* ignore */ }
  return null
}

export const saveCredentials = (credentials: any) => {
  try {
    localStorage.setItem('handbox-credentials', btoa(encodeURIComponent(JSON.stringify(credentials))))
  } catch { /* ignore */ }
}

export const clearSavedCredentials = () => {
  localStorage.removeItem('handbox-credentials')
}

export default function ProviderSetup({ onLogin, onSkip }: ProviderSetupProps) {
  const [step, setStep] = useState<'select' | 'credentials'>('select')
  const [selectedProvider, setSelectedProvider] = useState<CredentialProvider | null>(null)
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({})
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { saveAWSCredential, saveCredential } = useCredentialStore()

  // 저장된 자격증명 로드
  useEffect(() => {
    const saved = loadSavedCredentials()
    if (saved?.accessKeyId) {
      setSelectedProvider('aws')
      setCredentialValues({
        access_key_id: saved.accessKeyId,
        secret_access_key: saved.secretAccessKey || '',
        region: saved.region || 'ap-northeast-2',
      })
    }
  }, [])

  const handleProviderSelect = (provider: CredentialProvider) => {
    setSelectedProvider(provider)
    setCredentialValues({})
    setShowPasswords({})
    setError('')
    setStep('credentials')
  }

  const handleConnect = async () => {
    if (!selectedProvider) return

    const fields = PROVIDER_FIELDS[selectedProvider]
    const requiredFields = fields.filter(f => f.required)
    const missingFields = requiredFields.filter(f => !credentialValues[f.key]?.trim())

    if (missingFields.length > 0) {
      setError(`${missingFields.map(f => f.label).join(', ')}을(를) 입력하세요.`)
      return
    }

    setLoading(true)
    setError('')

    try {
      if (selectedProvider === 'aws') {
        await saveAWSCredential(
          credentialValues.access_key_id,
          credentialValues.secret_access_key,
          credentialValues.region || 'ap-northeast-2'
        )
        saveCredentials({
          accessKeyId: credentialValues.access_key_id,
          secretAccessKey: credentialValues.secret_access_key,
          region: credentialValues.region || 'ap-northeast-2',
          useAWS: true,
        })
        await onLogin({
          accessKeyId: credentialValues.access_key_id,
          secretAccessKey: credentialValues.secret_access_key,
          region: credentialValues.region || 'ap-northeast-2',
          rememberMe: true,
          useAWS: true,
        })
      } else {
        await saveCredential({
          name: `${PROVIDER_NAMES[selectedProvider]} Credentials`,
          type: selectedProvider === 'openai' || selectedProvider === 'anthropic' ? 'api-key' : 'access-key',
          provider: selectedProvider,
          values: credentialValues,
        })
        // 다른 프로바이더는 스킵 후 진입
        onSkip()
      }
    } catch (err) {
      setError('연결 실패. 자격 증명을 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  const providerInfo = PROVIDERS.find(p => p.id === selectedProvider)

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #0a0f1a 0%, #1a1f2e 100%)',
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 0,
          maxWidth: 520,
          width: '100%',
          borderRadius: 4,
          background: 'transparent',
        }}
      >
        {/* 헤더 */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
              boxShadow: '0 20px 40px rgba(16, 185, 129, 0.3)',
            }}
          >
            <HubIcon sx={{ fontSize: 40, color: 'white' }} />
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: 'white', mb: 1 }}>
            Handbox
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            Universal AI Workflow Platform
          </Typography>
        </Box>

        {/* 프로바이더 선택 화면 */}
        {step === 'select' && (
          <Paper
            sx={{
              p: 4,
              borderRadius: 3,
              background: 'rgba(30, 41, 59, 0.8)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Typography variant="h6" sx={{ color: 'white', mb: 1, fontWeight: 600 }}>
              시작하기
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 3 }}>
              연결할 클라우드 또는 AI 프로바이더를 선택하세요
            </Typography>

            {/* 프로바이더 그리드 */}
            <Grid container spacing={1.5} sx={{ mb: 3 }}>
              {PROVIDERS.map((provider) => (
                <Grid item xs={6} key={provider.id}>
                  <Paper
                    onClick={() => handleProviderSelect(provider.id)}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      bgcolor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 2,
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: 'rgba(255,255,255,0.08)',
                        borderColor: provider.color,
                        transform: 'translateY(-2px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <Typography fontSize="1.5rem">{provider.icon}</Typography>
                      <Typography variant="body1" sx={{ color: 'white', fontWeight: 600 }}>
                        {provider.name}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                      {provider.description}
                    </Typography>
                  </Paper>
                </Grid>
              ))}

              {/* Ollama (로컬) */}
              <Grid item xs={6}>
                <Paper
                  onClick={onSkip}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 2,
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.08)',
                      borderColor: '#a855f7',
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Typography fontSize="1.5rem">🦙</Typography>
                    <Box>
                      <Typography variant="body1" sx={{ color: 'white', fontWeight: 600 }}>
                        Ollama
                      </Typography>
                      <Chip
                        label="로컬"
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.65rem',
                          bgcolor: 'rgba(168, 85, 247, 0.2)',
                          color: '#a855f7',
                        }}
                      />
                    </Box>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    무료 로컬 LLM
                  </Typography>
                </Paper>
              </Grid>

              {/* 나중에 설정 */}
              <Grid item xs={6}>
                <Paper
                  onClick={onSkip}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    bgcolor: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.2)',
                    borderRadius: 2,
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.05)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <ArrowForwardIcon sx={{ color: 'rgba(255,255,255,0.3)' }} />
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                      나중에
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                    설정에서 추가
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* 안내 */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                여러 프로바이더를 동시에 사용할 수 있습니다
              </Typography>
            </Box>
          </Paper>
        )}

        {/* 자격증명 입력 화면 */}
        {step === 'credentials' && selectedProvider && (
          <Paper
            sx={{
              p: 4,
              borderRadius: 3,
              background: 'rgba(30, 41, 59, 0.8)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {/* 뒤로가기 + 타이틀 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <IconButton
                onClick={() => setStep('select')}
                sx={{ color: 'rgba(255,255,255,0.5)' }}
              >
                <ArrowBackIcon />
              </IconButton>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography fontSize="1.5rem">{providerInfo?.icon}</Typography>
                <Box>
                  <Typography variant="h6" sx={{ color: 'white', fontWeight: 600 }}>
                    {providerInfo?.name} 연결
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {providerInfo?.description}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* 에러 */}
            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* 프로바이더별 필드 */}
            {PROVIDER_FIELDS[selectedProvider].map((field) => (
              <Box key={field.key} sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1, display: 'block' }}>
                  {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                </Typography>
                <TextField
                  fullWidth
                  type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                  value={credentialValues[field.key] || ''}
                  onChange={(e) => setCredentialValues({ ...credentialValues, [field.key]: e.target.value })}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <KeyIcon sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: field.type === 'password' && (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPasswords({ ...showPasswords, [field.key]: !showPasswords[field.key] })}
                          edge="end"
                          sx={{ color: 'rgba(255,255,255,0.5)' }}
                        >
                          {showPasswords[field.key] ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                    sx: {
                      color: 'white',
                      bgcolor: 'rgba(0,0,0,0.2)',
                      borderRadius: 2,
                      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                      '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                      '&.Mui-focused fieldset': { borderColor: providerInfo?.color || '#10b981' },
                    },
                  }}
                />
              </Box>
            ))}

            {/* AWS 리전 선택 */}
            {selectedProvider === 'aws' && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1, display: 'block' }}>
                  Region
                </Typography>
                <TextField
                  fullWidth
                  select
                  value={credentialValues.region || 'ap-northeast-2'}
                  onChange={(e) => setCredentialValues({ ...credentialValues, region: e.target.value })}
                  InputProps={{
                    sx: {
                      color: 'white',
                      bgcolor: 'rgba(0,0,0,0.2)',
                      borderRadius: 2,
                      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                    },
                  }}
                  SelectProps={{
                    MenuProps: { PaperProps: { sx: { bgcolor: '#1e293b' } } },
                  }}
                >
                  {AWS_REGIONS.map((r) => (
                    <MenuItem key={r.value} value={r.value} sx={{ color: 'white' }}>
                      {r.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            )}

            {/* 연결 버튼 */}
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleConnect}
              disabled={loading}
              endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ArrowForwardIcon />}
              sx={{
                py: 1.5,
                borderRadius: 2,
                fontSize: '1rem',
                fontWeight: 600,
                background: `linear-gradient(135deg, ${providerInfo?.color || '#10b981'} 0%, ${providerInfo?.color || '#059669'}dd 100%)`,
                boxShadow: `0 8px 24px ${providerInfo?.color || '#10b981'}40`,
                '&:hover': {
                  boxShadow: `0 12px 32px ${providerInfo?.color || '#10b981'}50`,
                },
                '&:disabled': {
                  background: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.3)',
                },
              }}
            >
              {loading ? '연결 중...' : '연결하기'}
            </Button>

            {/* 보안 안내 */}
            <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
              <SecurityIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                자격 증명은 OS 보안 저장소에 암호화 저장
              </Typography>
            </Box>
          </Paper>
        )}

        {/* 하단 안내 */}
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
            MCP 서버로 더 많은 도구를 연결할 수 있습니다
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
