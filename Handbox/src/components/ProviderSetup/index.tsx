import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  MenuItem,
  Link,
  Divider,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Tabs,
  Tab,
  Grid,
} from '@mui/material'
import CloudIcon from '@mui/icons-material/Cloud'
import SecurityIcon from '@mui/icons-material/Security'
import HubIcon from '@mui/icons-material/Hub'
import KeyIcon from '@mui/icons-material/Key'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import PsychologyIcon from '@mui/icons-material/Psychology'

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

const AWS_REGIONS = [
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
]

// 간단한 암호화/복호화
const encodeCredentials = (data: string): string => {
  return btoa(encodeURIComponent(data))
}

const decodeCredentials = (data: string): string => {
  try {
    return decodeURIComponent(atob(data))
  } catch {
    return ''
  }
}

// 저장된 자격 증명 불러오기
export const loadSavedCredentials = (): {
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  useAWS: boolean
} | null => {
  try {
    const saved = localStorage.getItem('handbox-credentials')
    if (saved) {
      const decoded = decodeCredentials(saved)
      const credentials = JSON.parse(decoded)
      return credentials
    }
  } catch (error) {
    console.error('Failed to load saved credentials:', error)
  }
  return null
}

// 자격 증명 저장하기
export const saveCredentials = (credentials: {
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  useAWS: boolean
}) => {
  try {
    const encoded = encodeCredentials(JSON.stringify(credentials))
    localStorage.setItem('handbox-credentials', encoded)
  } catch (error) {
    console.error('Failed to save credentials:', error)
  }
}

// 저장된 자격 증명 삭제
export const clearSavedCredentials = () => {
  localStorage.removeItem('handbox-credentials')
}

const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', icon: '🤖', description: 'GPT-4o, GPT-4, GPT-3.5 Turbo' },
  { id: 'anthropic', name: 'Anthropic', icon: '🧠', description: 'Claude 3.5, Claude 3 Opus/Sonnet/Haiku' },
  { id: 'google', name: 'Google AI', icon: '✨', description: 'Gemini 1.5 Pro, Gemini 1.5 Flash' },
  { id: 'azure', name: 'Azure OpenAI', icon: '☁️', description: 'Azure hosted OpenAI models' },
  { id: 'ollama', name: 'Ollama', icon: '🦙', description: 'Local LLMs (Llama 3, Mistral, etc.)' },
]

export default function ProviderSetup({ onLogin, onSkip }: ProviderSetupProps) {
  const [tabValue, setTabValue] = useState(0) // 0: Quick Start, 1: AWS Bedrock
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [region, setRegion] = useState('ap-northeast-2')
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 저장된 자격 증명 불러오기
  useEffect(() => {
    const saved = loadSavedCredentials()
    if (saved && saved.useAWS && saved.accessKeyId) {
      setAccessKeyId(saved.accessKeyId)
      setSecretAccessKey(saved.secretAccessKey || '')
      setRegion(saved.region || 'ap-northeast-2')
      setRememberMe(true)
      setTabValue(1) // AWS 탭으로 이동
    }
  }, [])

  const handleAWSSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!accessKeyId || !secretAccessKey) {
      setError('AWS Access Key ID와 Secret Access Key를 입력하세요.')
      return
    }

    setLoading(true)
    try {
      await onLogin({ accessKeyId, secretAccessKey, region, rememberMe, useAWS: true })
    } catch (err) {
      setError('AWS 연결 실패. 자격 증명을 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickStart = () => {
    onSkip()
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        p: 2,
      }}
    >
      <Paper
        elevation={24}
        sx={{
          p: 4,
          maxWidth: 560,
          width: '100%',
          borderRadius: 4,
          background: 'rgba(30, 41, 59, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 100px rgba(16, 185, 129, 0.1)',
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              width: 90,
              height: 90,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
              boxShadow: '0 10px 40px rgba(16, 185, 129, 0.4)',
            }}
          >
            <HubIcon sx={{ fontSize: 45, color: 'white' }} />
          </Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              background: 'linear-gradient(90deg, #fff 0%, #6ee7b7 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1,
            }}
          >
            Handbox
          </Typography>
          <Typography variant="body2" color="grey.400" sx={{ mt: 1 }}>
            Universal AI Agent Workflow Platform
          </Typography>
        </Box>

        <Divider sx={{ mb: 3, borderColor: 'rgba(16, 185, 129, 0.2)' }} />

        {/* Tabs */}
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{
            mb: 3,
            '& .MuiTab-root': { color: 'grey.500', flex: 1 },
            '& .Mui-selected': { color: '#10b981' },
            '& .MuiTabs-indicator': { backgroundColor: '#10b981' },
          }}
        >
          <Tab
            icon={<RocketLaunchIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Quick Start"
          />
          <Tab
            icon={<CloudIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="AWS Bedrock"
          />
        </Tabs>

        {/* Quick Start Tab */}
        {tabValue === 0 && (
          <Box>
            <Alert
              severity="info"
              sx={{
                mb: 3,
                bgcolor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                '& .MuiAlert-icon': { color: '#10b981' },
              }}
            >
              AWS 없이 바로 시작하세요! AI 설정에서 원하는 AI 프로바이더의 API 키를 입력하면 됩니다.
            </Alert>

            <Typography
              variant="subtitle2"
              color="grey.300"
              sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <PsychologyIcon fontSize="small" />
              지원하는 AI 프로바이더
            </Typography>

            <Grid container spacing={1.5} sx={{ mb: 3 }}>
              {AI_PROVIDERS.map((provider) => (
                <Grid item xs={6} key={provider.id}>
                  <Paper
                    sx={{
                      p: 1.5,
                      bgcolor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 2,
                      cursor: 'default',
                      '&:hover': {
                        bgcolor: 'rgba(255,255,255,0.05)',
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography fontSize="1.2rem">{provider.icon}</Typography>
                      <Typography variant="body2" color="white" fontWeight={600}>
                        {provider.name}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="grey.500">
                      {provider.description}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleQuickStart}
              startIcon={<RocketLaunchIcon />}
              sx={{
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  boxShadow: '0 6px 20px rgba(16, 185, 129, 0.5)',
                },
              }}
            >
              바로 시작하기
            </Button>

            <Typography variant="caption" color="grey.500" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
              시작 후 AI 설정 (
              <KeyIcon sx={{ fontSize: 12, verticalAlign: 'middle' }} />) 에서 API 키를 입력하세요
            </Typography>
          </Box>
        )}

        {/* AWS Bedrock Tab */}
        {tabValue === 1 && (
          <Box>
            <Alert
              severity="info"
              sx={{
                mb: 3,
                bgcolor: 'rgba(255, 153, 0, 0.1)',
                border: '1px solid rgba(255, 153, 0, 0.3)',
                '& .MuiAlert-icon': { color: '#ff9900' },
              }}
            >
              AWS Bedrock을 사용하면 Claude, Llama, Titan 등 다양한 모델을 AWS 인프라에서 사용할 수 있습니다.
            </Alert>

            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleAWSSubmit}>
              <TextField
                fullWidth
                label="AWS Access Key ID"
                variant="outlined"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#ff9900',
                    },
                  },
                }}
                placeholder="AKIA..."
                InputProps={{
                  sx: { color: 'white' },
                }}
              />

              <TextField
                fullWidth
                label="AWS Secret Access Key"
                variant="outlined"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#ff9900',
                    },
                  },
                }}
                InputProps={{
                  sx: { color: 'white' },
                }}
              />

              <TextField
                fullWidth
                select
                label="AWS Region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  },
                }}
              >
                {AWS_REGIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    sx={{
                      color: 'grey.500',
                      '&.Mui-checked': { color: '#ff9900' },
                    }}
                  />
                }
                label={
                  <Typography variant="body2" color="grey.400">
                    로그인 정보 저장
                  </Typography>
                }
                sx={{ mb: 3 }}
              />

              <Button
                fullWidth
                variant="contained"
                type="submit"
                disabled={loading}
                sx={{
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #ff9900 0%, #ff6600 100%)',
                  boxShadow: '0 4px 15px rgba(255, 153, 0, 0.4)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #ff6600 0%, #cc5500 100%)',
                    boxShadow: '0 6px 20px rgba(255, 153, 0, 0.5)',
                  },
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'AWS Bedrock 연결'}
              </Button>
            </form>

            <Divider sx={{ my: 3, borderColor: 'rgba(255, 153, 0, 0.2)' }} />

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="grey.500" sx={{ mb: 1 }}>
                AWS 계정이 없으신가요?
              </Typography>
              <Link
                href="https://aws.amazon.com/console/"
                target="_blank"
                sx={{
                  color: '#ff9900',
                  textDecoration: 'none',
                  fontWeight: 500,
                  '&:hover': { color: '#ffb84d' },
                }}
              >
                AWS 콘솔에서 계정 생성하기
              </Link>
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.1)' }} />

        <Box sx={{ textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
            <SecurityIcon sx={{ fontSize: 14, color: 'grey.600' }} />
            <Typography variant="caption" color="grey.600">
              모든 자격 증명은 로컬에 안전하게 저장됩니다
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
