import { useState, memo, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  IconButton,
  InputAdornment,
  Divider,
  Chip,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Link,
  CircularProgress,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  CheckCircle,
  Error as ErrorIcon,
  ExpandMore,
  OpenInNew,
  Science,
  Gavel,
  Construction,
  School,
  Storage,
  BarChart,
  Api,
} from '@mui/icons-material'
import { useAppStore, ExternalAPIType, DEFAULT_EXTERNAL_APIS } from '../../stores/appStore'

interface ExternalAPISettingsDialogProps {
  open: boolean
  onClose: () => void
}

// API별 아이콘 매핑
const API_ICONS: Record<ExternalAPIType, React.ReactNode> = {
  kisti: <Science sx={{ color: '#8b5cf6' }} />,
  kipris: <Gavel sx={{ color: '#2563eb' }} />,
  kaia: <Construction sx={{ color: '#f59e0b' }} />,
  ntis: <School sx={{ color: '#10b981' }} />,
  riss: <School sx={{ color: '#6366f1' }} />,
  data_go_kr: <Storage sx={{ color: '#059669' }} />,
  kosis: <BarChart sx={{ color: '#ec4899' }} />,
  custom: <Api sx={{ color: '#64748b' }} />,
}

// API별 필요한 인증 필드
const API_CREDENTIAL_FIELDS: Record<ExternalAPIType, Array<{
  key: 'apiKey' | 'clientId' | 'authKey' | 'hardwareKey' | 'secretKey'
  label: string
  placeholder: string
  required: boolean
  isPassword?: boolean
}>> = {
  kisti: [
    { key: 'clientId', label: 'Client ID', placeholder: 'ScienceON에서 발급받은 Client ID', required: true },
    { key: 'authKey', label: '인증키 (Auth Key)', placeholder: 'API 인증키', required: true, isPassword: true },
    { key: 'hardwareKey', label: '하드웨어 키', placeholder: 'MAC 주소 (자동 감지됨)', required: false },
  ],
  kipris: [
    { key: 'apiKey', label: 'API Key', placeholder: 'KIPRIS에서 발급받은 API 키', required: true, isPassword: true },
  ],
  kaia: [
    { key: 'apiKey', label: 'API Key', placeholder: 'KAIA에서 발급받은 API 키', required: true, isPassword: true },
  ],
  ntis: [
    { key: 'apiKey', label: 'API Key', placeholder: 'NTIS에서 발급받은 API 키', required: true, isPassword: true },
  ],
  riss: [
    { key: 'apiKey', label: 'API Key', placeholder: 'RISS에서 발급받은 API 키', required: true, isPassword: true },
  ],
  data_go_kr: [
    { key: 'apiKey', label: 'API Key', placeholder: '공공데이터포털에서 발급받은 API 키', required: true, isPassword: true },
  ],
  kosis: [
    { key: 'apiKey', label: 'API Key', placeholder: 'KOSIS에서 발급받은 API 키', required: true, isPassword: true },
  ],
  custom: [
    { key: 'apiKey', label: 'API Key', placeholder: 'API 키', required: false, isPassword: true },
    { key: 'secretKey', label: 'Secret Key', placeholder: 'Secret 키 (필요시)', required: false, isPassword: true },
  ],
}

// API 순서 정의
const API_ORDER: ExternalAPIType[] = ['kisti', 'kipris', 'kaia', 'ntis', 'riss', 'data_go_kr', 'kosis', 'custom']

const ExternalAPISettingsDialog = memo(function ExternalAPISettingsDialog({
  open,
  onClose,
}: ExternalAPISettingsDialogProps) {
  const {
    externalAPIs,
    setExternalAPICredentials,
    enableExternalAPI,
    setExternalAPITestResult,
  } = useAppStore()

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [testingApi, setTestingApi] = useState<ExternalAPIType | null>(null)
  const [expandedApi, setExpandedApi] = useState<ExternalAPIType | false>('kisti')

  const togglePasswordVisibility = useCallback((fieldKey: string) => {
    setShowPasswords(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))
  }, [])

  const handleCredentialChange = useCallback((
    apiType: ExternalAPIType,
    key: string,
    value: string
  ) => {
    setExternalAPICredentials(apiType, { [key]: value })
  }, [setExternalAPICredentials])

  const handleTestAPI = useCallback(async (apiType: ExternalAPIType) => {
    setTestingApi(apiType)

    // 간단한 테스트 로직 (실제로는 API 호출)
    try {
      const config = externalAPIs[apiType]
      const creds = config.credentials

      // 필수 필드 검증
      const requiredFields = API_CREDENTIAL_FIELDS[apiType].filter(f => f.required)
      const missingFields = requiredFields.filter(f => !creds[f.key])

      if (missingFields.length > 0) {
        setExternalAPITestResult(apiType, 'failed', `필수 필드 누락: ${missingFields.map(f => f.label).join(', ')}`)
        setTestingApi(null)
        return
      }

      // 실제 API 테스트 (시뮬레이션)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 성공 시 자동 활성화
      enableExternalAPI(apiType, true)
      setExternalAPITestResult(apiType, 'success')
    } catch (error) {
      setExternalAPITestResult(apiType, 'failed', String(error))
    } finally {
      setTestingApi(null)
    }
  }, [externalAPIs, setExternalAPITestResult, enableExternalAPI])

  const handleAccordionChange = (apiType: ExternalAPIType) => (
    _event: React.SyntheticEvent,
    isExpanded: boolean
  ) => {
    setExpandedApi(isExpanded ? apiType : false)
  }

  const isApiConfigured = (apiType: ExternalAPIType): boolean => {
    const config = externalAPIs[apiType]
    if (!config) return false
    const requiredFields = API_CREDENTIAL_FIELDS[apiType].filter(f => f.required)
    return requiredFields.every(f => config.credentials[f.key])
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 3,
          maxHeight: '85vh',
        },
      }}
    >
      <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Api sx={{ fontSize: 28, color: '#6366f1' }} />
          <Box>
            <Typography variant="h6" color="white">
              외부 API 설정
            </Typography>
            <Typography variant="caption" color="grey.500">
              KISTI, KIPRIS, KAIA 등 외부 API 인증 키를 설정합니다
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ py: 3 }}>
        <Alert severity="info" sx={{ mb: 3, fontSize: '0.8rem' }}>
          각 API의 인증 키를 입력하면 해당 노드가 자동으로 활성화됩니다.
          API 키는 각 서비스 홈페이지에서 발급받으세요.
        </Alert>

        {API_ORDER.map((apiType) => {
          const apiConfig = externalAPIs[apiType] || {
            ...DEFAULT_EXTERNAL_APIS[apiType],
            enabled: false,
            credentials: {},
          }
          const fields = API_CREDENTIAL_FIELDS[apiType]
          const isConfigured = isApiConfigured(apiType)
          const isTesting = testingApi === apiType

          return (
            <Accordion
              key={apiType}
              expanded={expandedApi === apiType}
              onChange={handleAccordionChange(apiType)}
              sx={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid',
                borderColor: apiConfig.enabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.1)',
                borderRadius: '8px !important',
                mb: 1,
                '&:before': { display: 'none' },
                '&.Mui-expanded': {
                  margin: '0 0 8px 0',
                },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMore sx={{ color: 'grey.400' }} />}
                sx={{ px: 2 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                  {API_ICONS[apiType]}
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" color="white">
                        {apiConfig.name}
                      </Typography>
                      {apiConfig.enabled && (
                        <Chip
                          size="small"
                          label="활성"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            background: 'rgba(34, 197, 94, 0.2)',
                            color: '#22c55e',
                          }}
                        />
                      )}
                      {apiConfig.lastTestResult === 'success' && (
                        <CheckCircle sx={{ fontSize: 16, color: '#22c55e' }} />
                      )}
                      {apiConfig.lastTestResult === 'failed' && (
                        <ErrorIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                      )}
                    </Box>
                    <Typography variant="caption" color="grey.500">
                      {apiConfig.description}
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={apiConfig.enabled}
                        onChange={(e) => {
                          e.stopPropagation()
                          enableExternalAPI(apiType, e.target.checked)
                        }}
                        disabled={!isConfigured}
                        size="small"
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': {
                            color: '#22c55e',
                          },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                            backgroundColor: '#22c55e',
                          },
                        }}
                      />
                    }
                    label=""
                    onClick={(e) => e.stopPropagation()}
                  />
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ px: 2, pt: 0 }}>
                <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

                {/* API 문서 링크 */}
                {apiConfig.docsUrl && (
                  <Box sx={{ mb: 2 }}>
                    <Link
                      href={apiConfig.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        fontSize: '0.8rem',
                        color: '#a5b4fc',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      <OpenInNew sx={{ fontSize: 14 }} />
                      API 키 발급 페이지 바로가기
                    </Link>
                  </Box>
                )}

                {/* 인증 필드 */}
                {fields.map((field) => {
                  const fieldKey = `${apiType}_${field.key}`
                  const isPassword = field.isPassword && !showPasswords[fieldKey]

                  return (
                    <TextField
                      key={field.key}
                      fullWidth
                      size="small"
                      label={field.label + (field.required ? ' *' : '')}
                      type={isPassword ? 'password' : 'text'}
                      value={apiConfig.credentials[field.key] || ''}
                      onChange={(e) => handleCredentialChange(apiType, field.key, e.target.value)}
                      placeholder={field.placeholder}
                      sx={{ mb: 2 }}
                      InputProps={{
                        endAdornment: field.isPassword && (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => togglePasswordVisibility(fieldKey)}
                              edge="end"
                              size="small"
                            >
                              {showPasswords[fieldKey] ? (
                                <VisibilityOff sx={{ fontSize: 18, color: 'grey.500' }} />
                              ) : (
                                <Visibility sx={{ fontSize: 18, color: 'grey.500' }} />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                        sx: {
                          background: 'rgba(0,0,0,0.2)',
                          '& input': { color: 'white', fontSize: '0.9rem' },
                          '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                          '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                          '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                        },
                      }}
                      InputLabelProps={{
                        sx: { color: 'grey.400', fontSize: '0.85rem' },
                      }}
                    />
                  )
                })}

                {/* 테스트 결과 */}
                {apiConfig.testError && (
                  <Alert severity="error" sx={{ mb: 2, fontSize: '0.75rem' }}>
                    {apiConfig.testError}
                  </Alert>
                )}

                {/* 테스트 버튼 */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleTestAPI(apiType)}
                    disabled={isTesting || !isConfigured}
                    startIcon={isTesting ? <CircularProgress size={16} /> : undefined}
                    sx={{
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                      },
                      '&:disabled': {
                        background: 'rgba(99, 102, 241, 0.3)',
                        color: 'grey.500',
                      },
                      textTransform: 'none',
                      fontWeight: 600,
                    }}
                  >
                    {isTesting ? '테스트 중...' : '연결 테스트'}
                  </Button>
                  {apiConfig.lastTested && (
                    <Typography variant="caption" color="grey.500" sx={{ alignSelf: 'center' }}>
                      마지막 테스트: {new Date(apiConfig.lastTested).toLocaleString('ko-KR')}
                    </Typography>
                  )}
                </Box>
              </AccordionDetails>
            </Accordion>
          )
        })}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <Typography variant="caption" color="grey.500" sx={{ flex: 1 }}>
          설정된 API 키는 로컬에 암호화되어 저장됩니다
        </Typography>
        <Button
          onClick={onClose}
          sx={{
            color: 'white',
            borderColor: 'rgba(255,255,255,0.3)',
            '&:hover': { borderColor: 'rgba(255,255,255,0.5)' },
          }}
          variant="outlined"
        >
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  )
})

export default ExternalAPISettingsDialog
