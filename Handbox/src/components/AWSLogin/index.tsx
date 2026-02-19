import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  MenuItem,
  Divider,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material'
import CloudIcon from '@mui/icons-material/Cloud'
import KeyIcon from '@mui/icons-material/Key'
import PublicIcon from '@mui/icons-material/Public'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import RefreshIcon from '@mui/icons-material/Refresh'
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
  { value: 'ap-northeast-2', label: '아시아 태평양 (서울)', flag: '🇰🇷' },
  { value: 'ap-northeast-1', label: '아시아 태평양 (도쿄)', flag: '🇯🇵' },
  { value: 'us-east-1', label: '미국 동부 (버지니아)', flag: '🇺🇸' },
  { value: 'us-west-2', label: '미국 서부 (오레곤)', flag: '🇺🇸' },
  { value: 'eu-west-1', label: '유럽 (아일랜드)', flag: '🇮🇪' },
  { value: 'ap-southeast-1', label: '아시아 태평양 (싱가포르)', flag: '🇸🇬' },
  { value: 'ap-southeast-2', label: '아시아 태평양 (시드니)', flag: '🇦🇺' },
  { value: 'eu-central-1', label: '유럽 (프랑크푸르트)', flag: '🇩🇪' },
]

// 암호화/복호화
const encodeCredentials = (data: string): string => btoa(encodeURIComponent(data))
const decodeCredentials = (data: string): string => {
  try { return decodeURIComponent(atob(data)) } catch { return '' }
}

export const loadSavedCredentials = (): {
  accessKeyId: string
  secretAccessKey: string
  region: string
} | null => {
  try {
    const saved = localStorage.getItem('aws-agent-studio-credentials')
    if (saved) return JSON.parse(decodeCredentials(saved))
  } catch { /* ignore */ }
  return null
}

export const saveCredentials = (credentials: {
  accessKeyId: string
  secretAccessKey: string
  region: string
}) => {
  try {
    localStorage.setItem('aws-agent-studio-credentials', encodeCredentials(JSON.stringify(credentials)))
  } catch { /* ignore */ }
}

export const clearSavedCredentials = () => {
  localStorage.removeItem('aws-agent-studio-credentials')
  localStorage.removeItem('aws-bedrock-api-key')
}

export default function AWSLogin({ onLogin }: AWSLoginProps) {
  // 상태
  const [activeStep, setActiveStep] = useState(0)
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [region, setRegion] = useState('ap-northeast-2')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  // 검증 상태
  const [keyIdValid, setKeyIdValid] = useState<boolean | null>(null)
  const [secretValid, setSecretValid] = useState<boolean | null>(null)
  const [connectionTested, setConnectionTested] = useState<boolean | null>(null)

  // 저장된 자격증명 불러오기
  useEffect(() => {
    const saved = loadSavedCredentials()
    if (saved) {
      setAccessKeyId(saved.accessKeyId)
      setSecretAccessKey(saved.secretAccessKey)
      setRegion(saved.region)
      setKeyIdValid(true)
      setSecretValid(true)
      setActiveStep(2) // 바로 연결 테스트 단계로
    }
  }, [])

  // Access Key ID 검증
  useEffect(() => {
    if (accessKeyId.length === 0) {
      setKeyIdValid(null)
    } else if (accessKeyId.match(/^AKIA[A-Z0-9]{16}$/)) {
      setKeyIdValid(true)
    } else if (accessKeyId.length >= 4 && !accessKeyId.startsWith('AKIA')) {
      setKeyIdValid(false)
    } else {
      setKeyIdValid(null)
    }
  }, [accessKeyId])

  // Secret Key 검증
  useEffect(() => {
    if (secretAccessKey.length === 0) {
      setSecretValid(null)
    } else if (secretAccessKey.length === 40) {
      setSecretValid(true)
    } else if (secretAccessKey.length > 40) {
      setSecretValid(false)
    } else {
      setSecretValid(null)
    }
  }, [secretAccessKey])

  const handleTestConnection = async () => {
    setLoading(true)
    setError('')
    setConnectionTested(null)

    try {
      await invoke('test_aws_connection', {
        accessKeyId,
        secretAccessKey,
        region,
      })
      setConnectionTested(true)
    } catch (err) {
      setConnectionTested(false)
      setError('연결 실패: 자격 증명을 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    setLoading(true)
    setError('')

    try {
      await onLogin({
        accessKeyId,
        secretAccessKey,
        region,
        rememberMe: true,
      })
      saveCredentials({ accessKeyId, secretAccessKey, region })
    } catch (err) {
      setError('로그인 실패. 자격 증명을 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  const canProceedStep1 = keyIdValid === true
  const canProceedStep2 = secretValid === true
  const canLogin = connectionTested === true

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
          maxWidth: 520,
          width: '100%',
          borderRadius: 4,
          background: 'rgba(30, 41, 59, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
        }}
      >
        {/* 헤더 */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 40, color: 'white' }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'white', mb: 0.5 }}>
            Handbox에 오신 것을 환영합니다
          </Typography>
          <Typography variant="body2" color="grey.400">
            AWS 계정을 연결하여 AI 워크플로우를 시작하세요
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* 단계별 가이드 */}
        <Stepper activeStep={activeStep} orientation="vertical">
          {/* Step 1: Access Key ID */}
          <Step>
            <StepLabel
              StepIconProps={{
                sx: {
                  '&.Mui-active': { color: '#6366f1' },
                  '&.Mui-completed': { color: '#22c55e' },
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: 'white', fontWeight: 600 }}>
                  Access Key ID 입력
                </Typography>
                {keyIdValid === true && (
                  <CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e' }} />
                )}
                {keyIdValid === false && (
                  <ErrorIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                )}
              </Box>
            </StepLabel>
            <StepContent>
              <Typography variant="body2" color="grey.400" sx={{ mb: 2 }}>
                AWS IAM에서 생성한 Access Key ID를 입력하세요.
                <br />
                <Typography component="span" sx={{ color: '#a5b4fc', fontSize: '0.75rem' }}>
                  형식: AKIA로 시작하는 20자리 문자열
                </Typography>
              </Typography>

              <TextField
                fullWidth
                label="Access Key ID"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value.toUpperCase())}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                error={keyIdValid === false}
                helperText={keyIdValid === false ? 'AKIA로 시작하는 20자리 키를 입력하세요' : ''}
                InputProps={{
                  startAdornment: <KeyIcon sx={{ mr: 1, color: 'grey.500' }} />,
                  endAdornment: keyIdValid === true ? (
                    <CheckCircleIcon sx={{ color: '#22c55e' }} />
                  ) : null,
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    color: 'white',
                    '& fieldset': { borderColor: keyIdValid === true ? '#22c55e' : 'rgba(255,255,255,0.2)' },
                  },
                }}
              />

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={() => setActiveStep(1)}
                  disabled={!canProceedStep1}
                  endIcon={<ArrowForwardIcon />}
                  sx={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    '&:disabled': { background: 'rgba(99, 102, 241, 0.3)' },
                  }}
                >
                  다음
                </Button>
                <Tooltip title="AWS IAM 콘솔에서 Access Key를 생성할 수 있습니다">
                  <IconButton
                    size="small"
                    onClick={() => window.open('https://console.aws.amazon.com/iam/home#/security_credentials', '_blank')}
                  >
                    <HelpOutlineIcon sx={{ color: 'grey.500' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </StepContent>
          </Step>

          {/* Step 2: Secret Access Key */}
          <Step>
            <StepLabel
              StepIconProps={{
                sx: {
                  '&.Mui-active': { color: '#6366f1' },
                  '&.Mui-completed': { color: '#22c55e' },
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: 'white', fontWeight: 600 }}>
                  Secret Access Key 입력
                </Typography>
                {secretValid === true && (
                  <CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e' }} />
                )}
              </Box>
            </StepLabel>
            <StepContent>
              <Typography variant="body2" color="grey.400" sx={{ mb: 2 }}>
                Access Key ID와 함께 생성된 Secret Key를 입력하세요.
                <br />
                <Typography component="span" sx={{ color: '#f59e0b', fontSize: '0.75rem' }}>
                  ⚠️ Secret Key는 생성 시 한 번만 표시됩니다
                </Typography>
              </Typography>

              <TextField
                fullWidth
                label="Secret Access Key"
                type={showSecret ? 'text' : 'password'}
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                InputProps={{
                  startAdornment: <KeyIcon sx={{ mr: 1, color: 'grey.500' }} />,
                  endAdornment: (
                    <IconButton onClick={() => setShowSecret(!showSecret)} size="small">
                      {showSecret ? (
                        <VisibilityOffIcon sx={{ color: 'grey.500' }} />
                      ) : (
                        <VisibilityIcon sx={{ color: 'grey.500' }} />
                      )}
                    </IconButton>
                  ),
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    color: 'white',
                    '& fieldset': { borderColor: secretValid === true ? '#22c55e' : 'rgba(255,255,255,0.2)' },
                  },
                }}
              />

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" onClick={() => setActiveStep(0)} sx={{ color: 'grey.400' }}>
                  이전
                </Button>
                <Button
                  variant="contained"
                  onClick={() => setActiveStep(2)}
                  disabled={!canProceedStep2}
                  endIcon={<ArrowForwardIcon />}
                  sx={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    '&:disabled': { background: 'rgba(99, 102, 241, 0.3)' },
                  }}
                >
                  다음
                </Button>
              </Box>
            </StepContent>
          </Step>

          {/* Step 3: 리전 선택 & 연결 테스트 */}
          <Step>
            <StepLabel
              StepIconProps={{
                sx: {
                  '&.Mui-active': { color: '#6366f1' },
                  '&.Mui-completed': { color: '#22c55e' },
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: 'white', fontWeight: 600 }}>
                  리전 선택 및 연결 확인
                </Typography>
                {connectionTested === true && (
                  <Chip label="연결됨" size="small" sx={{ bgcolor: '#22c55e', color: 'white', height: 20 }} />
                )}
              </Box>
            </StepLabel>
            <StepContent>
              <Typography variant="body2" color="grey.400" sx={{ mb: 2 }}>
                AWS Bedrock을 사용할 리전을 선택하세요.
              </Typography>

              <TextField
                fullWidth
                select
                label="AWS 리전"
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value)
                  setConnectionTested(null)
                }}
                InputProps={{
                  startAdornment: <PublicIcon sx={{ mr: 1, color: 'grey.500' }} />,
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    color: 'white',
                  },
                }}
              >
                {AWS_REGIONS.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography>{r.flag}</Typography>
                      <Typography>{r.label}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </TextField>

              {/* 연결 테스트 결과 */}
              {connectionTested !== null && (
                <Alert
                  severity={connectionTested ? 'success' : 'error'}
                  sx={{ mb: 2, borderRadius: 2 }}
                >
                  {connectionTested
                    ? '✅ AWS 연결 성공! 로그인할 준비가 되었습니다.'
                    : '❌ 연결 실패. 자격 증명 또는 리전을 확인하세요.'}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" onClick={() => setActiveStep(1)} sx={{ color: 'grey.400' }}>
                  이전
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleTestConnection}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
                  sx={{
                    borderColor: '#6366f1',
                    color: '#a5b4fc',
                    '&:hover': { borderColor: '#8b5cf6' },
                  }}
                >
                  연결 테스트
                </Button>
                <Button
                  variant="contained"
                  onClick={handleLogin}
                  disabled={loading || !canLogin}
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CloudIcon />}
                  sx={{
                    flex: 1,
                    background: canLogin
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    '&:disabled': { background: 'rgba(99, 102, 241, 0.3)' },
                  }}
                >
                  {canLogin ? '로그인' : '연결 테스트 필요'}
                </Button>
              </Box>
            </StepContent>
          </Step>
        </Stepper>

        <Divider sx={{ my: 3, borderColor: 'rgba(99, 102, 241, 0.2)' }} />

        {/* 입력 상태 요약 */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Chip
            icon={<KeyIcon />}
            label={accessKeyId ? `${accessKeyId.slice(0, 8)}...` : 'Access Key 미입력'}
            size="small"
            sx={{
              bgcolor: keyIdValid === true ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              color: keyIdValid === true ? '#4ade80' : 'grey.500',
              border: '1px solid',
              borderColor: keyIdValid === true ? 'rgba(34, 197, 94, 0.3)' : 'transparent',
            }}
          />
          <Chip
            icon={<KeyIcon />}
            label={secretAccessKey ? '********' : 'Secret Key 미입력'}
            size="small"
            sx={{
              bgcolor: secretValid === true ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              color: secretValid === true ? '#4ade80' : 'grey.500',
              border: '1px solid',
              borderColor: secretValid === true ? 'rgba(34, 197, 94, 0.3)' : 'transparent',
            }}
          />
          <Chip
            icon={<PublicIcon />}
            label={AWS_REGIONS.find((r) => r.value === region)?.label.split('(')[1]?.replace(')', '') || region}
            size="small"
            sx={{
              bgcolor: 'rgba(99, 102, 241, 0.2)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}
          />
        </Box>

        {/* 도움말 */}
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="caption" color="grey.600">
            자격 증명은 로컬에 안전하게 저장됩니다 •{' '}
            <Typography
              component="a"
              href="https://aws.amazon.com/ko/iam/"
              target="_blank"
              sx={{ color: '#a5b4fc', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              IAM 사용자 생성 방법
            </Typography>
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
