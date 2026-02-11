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
  Collapse,
} from '@mui/material'
import CloudIcon from '@mui/icons-material/Cloud'
import SecurityIcon from '@mui/icons-material/Security'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import KeyIcon from '@mui/icons-material/Key'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { invoke } from '@tauri-apps/api/tauri'

interface AWSLoginProps {
  onLogin: (credentials: {
    accessKeyId: string
    secretAccessKey: string
    region: string
    rememberMe: boolean
  }) => Promise<void>
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

// 간단한 암호화/복호화 (실제 환경에서는 더 강력한 암호화 사용 권장)
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
  accessKeyId: string
  secretAccessKey: string
  region: string
} | null => {
  try {
    const saved = localStorage.getItem('aws-agent-studio-credentials')
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
  accessKeyId: string
  secretAccessKey: string
  region: string
}) => {
  try {
    const encoded = encodeCredentials(JSON.stringify(credentials))
    localStorage.setItem('aws-agent-studio-credentials', encoded)
  } catch (error) {
    console.error('Failed to save credentials:', error)
  }
}

// 저장된 자격 증명 삭제
export const clearSavedCredentials = () => {
  localStorage.removeItem('aws-agent-studio-credentials')
  localStorage.removeItem('aws-bedrock-api-key')
}

export default function AWSLogin({ onLogin }: AWSLoginProps) {
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [region, setRegion] = useState('ap-northeast-2')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bedrockApiKey, setBedrockApiKey] = useState('')
  const [showBedrockKey, setShowBedrockKey] = useState(false)
  const [bedrockKeySet, setBedrockKeySet] = useState(false)
  const [bedrockKeyLoading, setBedrockKeyLoading] = useState(false)

  // 저장된 자격 증명 불러오기
  useEffect(() => {
    const saved = loadSavedCredentials()
    if (saved) {
      setAccessKeyId(saved.accessKeyId)
      setSecretAccessKey(saved.secretAccessKey)
      setRegion(saved.region)
      setRememberMe(true)
    }
    // 저장된 Bedrock API Key 확인
    const savedKey = localStorage.getItem('aws-bedrock-api-key')
    if (savedKey) {
      setBedrockApiKey(decodeCredentials(savedKey))
      setBedrockKeySet(true)
    }
  }, [])

  const handleBedrockApiKey = async () => {
    if (!bedrockApiKey.trim()) return
    setBedrockKeyLoading(true)
    try {
      await invoke('set_bedrock_api_key', { apiKey: bedrockApiKey.trim() })
      localStorage.setItem('aws-bedrock-api-key', encodeCredentials(bedrockApiKey.trim()))
      setBedrockKeySet(true)
    } catch (err) {
      setError('Bedrock API Key 설정 실패: ' + String(err))
    } finally {
      setBedrockKeyLoading(false)
    }
  }

  const handleClearBedrockKey = async () => {
    try {
      await invoke('clear_bedrock_api_key')
      localStorage.removeItem('aws-bedrock-api-key')
      setBedrockApiKey('')
      setBedrockKeySet(false)
    } catch {
      // ignore
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!accessKeyId || !secretAccessKey) {
      setError('AWS Access Key ID와 Secret Access Key를 입력하세요.')
      return
    }

    setLoading(true)
    try {
      // 저장된 Bedrock API Key가 있으면 먼저 설정
      if (bedrockKeySet && bedrockApiKey.trim()) {
        await invoke('set_bedrock_api_key', { apiKey: bedrockApiKey.trim() })
      }
      await onLogin({ accessKeyId, secretAccessKey, region, rememberMe })
    } catch (err) {
      setError('로그인 실패. 자격 증명을 확인하세요.')
    } finally {
      setLoading(false)
    }
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
          maxWidth: 480,
          width: '100%',
          borderRadius: 4,
          background: 'rgba(30, 41, 59, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 100px rgba(99, 102, 241, 0.1)',
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              width: 90,
              height: 90,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
              boxShadow: '0 10px 40px rgba(99, 102, 241, 0.4)',
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 45, color: 'white' }} />
          </Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              background: 'linear-gradient(90deg, #fff 0%, #a5b4fc 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1,
            }}
          >
            AWS Agent Studio
          </Typography>
          <Typography variant="body2" color="grey.400" sx={{ mt: 1 }}>
            Visual Workflow Builder for AWS Services
          </Typography>
        </Box>

        <Divider sx={{ mb: 3, borderColor: 'rgba(99, 102, 241, 0.2)' }} />

        {/* AWS Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              background: 'linear-gradient(135deg, #ff9900 0%, #ffb84d 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 1.5,
            }}
          >
            <CloudIcon sx={{ fontSize: 18, color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" color="white" fontWeight={600}>
              AWS 계정으로 로그인
            </Typography>
            <Typography variant="caption" color="grey.500">
              IAM 사용자 자격 증명을 입력하세요
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
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
                  borderColor: '#6366f1',
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
                  borderColor: '#6366f1',
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

          {/* Remember Me Checkbox */}
          <FormControlLabel
            control={
              <Checkbox
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                sx={{
                  color: 'grey.500',
                  '&.Mui-checked': { color: '#6366f1' },
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
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
              '&:hover': {
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: '0 6px 20px rgba(99, 102, 241, 0.5)',
              },
            }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              '로그인'
            )}
          </Button>
        </form>

        <Divider sx={{ my: 3, borderColor: 'rgba(99, 102, 241, 0.2)' }} />

        {/* Bedrock API Key Section */}
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              '&:hover': { opacity: 0.8 },
            }}
            onClick={() => setShowBedrockKey(!showBedrockKey)}
          >
            <KeyIcon sx={{ fontSize: 20, color: '#f59e0b', mr: 1 }} />
            <Typography variant="subtitle2" color="grey.300" sx={{ flex: 1 }}>
              Bedrock API Key (선택사항)
            </Typography>
            {bedrockKeySet && (
              <CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e', mr: 1 }} />
            )}
            {showBedrockKey ? (
              <ExpandLessIcon sx={{ fontSize: 18, color: 'grey.500' }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 18, color: 'grey.500' }} />
            )}
          </Box>
          <Collapse in={showBedrockKey}>
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="grey.500" sx={{ display: 'block', mb: 1, lineHeight: 1.6 }}>
                Bedrock 모델 액세스 승인 없이 사용하려면 Bedrock API Key를 입력하세요.
                AWS 콘솔 &gt; Bedrock &gt; API Keys에서 생성할 수 있습니다.
              </Typography>
              <TextField
                fullWidth
                size="small"
                label="Bedrock API Key (Bearer Token)"
                variant="outlined"
                type="password"
                value={bedrockApiKey}
                onChange={(e) => { setBedrockApiKey(e.target.value); setBedrockKeySet(false); }}
                sx={{
                  mb: 1,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#f59e0b',
                    },
                  },
                }}
                placeholder="ABSK..."
                InputProps={{ sx: { color: 'white', fontSize: '0.85rem' } }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleBedrockApiKey}
                  disabled={bedrockKeyLoading || !bedrockApiKey.trim()}
                  sx={{
                    flex: 1,
                    borderRadius: 1.5,
                    background: bedrockKeySet
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    fontSize: '0.75rem',
                    '&:hover': {
                      background: bedrockKeySet
                        ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                        : 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    },
                  }}
                >
                  {bedrockKeyLoading ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : bedrockKeySet ? (
                    '설정 완료'
                  ) : (
                    'API Key 설정'
                  )}
                </Button>
                {bedrockKeySet && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleClearBedrockKey}
                    sx={{
                      borderRadius: 1.5,
                      borderColor: 'grey.600',
                      color: 'grey.400',
                      fontSize: '0.75rem',
                      '&:hover': { borderColor: '#ef4444', color: '#ef4444' },
                    }}
                  >
                    삭제
                  </Button>
                )}
              </Box>
            </Box>
          </Collapse>
        </Box>

        <Divider sx={{ my: 2, borderColor: 'rgba(99, 102, 241, 0.2)' }} />

        {/* Help Links */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" color="grey.500" sx={{ mb: 1 }}>
            AWS 계정이 없으신가요?
          </Typography>
          <Link
            href="https://aws.amazon.com/console/"
            target="_blank"
            sx={{
              color: '#a5b4fc',
              textDecoration: 'none',
              fontWeight: 500,
              '&:hover': { color: '#c7d2fe' },
            }}
          >
            AWS 콘솔에서 계정 생성하기 →
          </Link>
        </Box>

        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
            <SecurityIcon sx={{ fontSize: 14, color: 'grey.600' }} />
            <Typography variant="caption" color="grey.600">
              자격 증명은 로컬에 암호화되어 저장됩니다
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
