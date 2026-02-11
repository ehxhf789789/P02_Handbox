import { useState, memo, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Slider,
  Alert,
  Tabs,
  Tab,
  IconButton,
  InputAdornment,
  Divider,
  Chip,
  CircularProgress,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Psychology,
  CloudDone,
  CloudOff,
  Link as LinkIcon,
} from '@mui/icons-material'
import { useAppStore, AIProvider } from '../../stores/appStore'
import { invoke } from '@tauri-apps/api/tauri'
import { saveCredentials, clearSavedCredentials } from '../ProviderSetup'

// AWS 리전 목록
const AWS_REGIONS = [
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
]

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  )
}

interface AISettingsDialogProps {
  open: boolean
  onClose: () => void
}

// Bedrock 모델 목록
const BEDROCK_MODELS = [
  { id: 'anthropic.claude-3-5-sonnet-20240620-v1:0', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'anthropic.claude-3-opus-20240229-v1:0', name: 'Claude 3 Opus', provider: 'Anthropic' },
  { id: 'anthropic.claude-3-sonnet-20240229-v1:0', name: 'Claude 3 Sonnet', provider: 'Anthropic' },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'meta.llama3-1-405b-instruct-v1:0', name: 'Llama 3.1 405B', provider: 'Meta' },
  { id: 'meta.llama3-1-70b-instruct-v1:0', name: 'Llama 3.1 70B', provider: 'Meta' },
  { id: 'meta.llama3-1-8b-instruct-v1:0', name: 'Llama 3.1 8B', provider: 'Meta' },
  { id: 'amazon.titan-text-premier-v1:0', name: 'Titan Text Premier', provider: 'Amazon' },
  { id: 'mistral.mistral-large-2407-v1:0', name: 'Mistral Large', provider: 'Mistral' },
  { id: 'cohere.command-r-plus-v1:0', name: 'Command R+', provider: 'Cohere' },
]

// OpenAI 모델 목록
const OPENAI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  { id: 'o1-preview', name: 'O1 Preview' },
  { id: 'o1-mini', name: 'O1 Mini' },
]

// Anthropic 모델 목록
const ANTHROPIC_MODELS = [
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
]

// Google AI (Gemini) 모델 목록
const GOOGLE_MODELS = [
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' },
]

// Ollama 모델 목록 (로컬)
const OLLAMA_MODELS = [
  { id: 'llama3', name: 'Llama 3' },
  { id: 'llama3:70b', name: 'Llama 3 70B' },
  { id: 'mistral', name: 'Mistral' },
  { id: 'mixtral', name: 'Mixtral' },
  { id: 'codellama', name: 'Code Llama' },
  { id: 'phi3', name: 'Phi-3' },
  { id: 'gemma', name: 'Gemma' },
]

function AISettingsDialogContent({ open, onClose }: AISettingsDialogProps) {
  const { aiModelConfig, setAIModelConfig, awsStatus, setAWSStatus, setUseAWSConnection } = useAppStore()
  const getInitialTab = () => {
    switch (aiModelConfig.provider) {
      case 'openai': return 0
      case 'anthropic': return 1
      case 'google': return 2
      case 'bedrock': return 3
      case 'azure': return 4
      case 'ollama': return 5
      default: return 1 // Default to Anthropic
    }
  }
  const [tabValue, setTabValue] = useState(getInitialTab())
  const [showApiKey, setShowApiKey] = useState(false)

  // AWS 로그인 상태
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('')
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('')
  const [awsRegion, setAwsRegion] = useState('ap-northeast-2')
  const [awsLoading, setAwsLoading] = useState(false)
  const [awsError, setAwsError] = useState('')

  const handleProviderChange = useCallback((provider: AIProvider) => {
    setAIModelConfig({ provider })
  }, [setAIModelConfig])

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
    const providers: AIProvider[] = ['openai', 'anthropic', 'google', 'bedrock', 'azure', 'ollama']
    handleProviderChange(providers[newValue])
  }, [handleProviderChange])

  // AWS 로그인 핸들러
  const handleAWSLogin = async () => {
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      setAwsError('AWS Access Key ID와 Secret Access Key를 입력하세요.')
      return
    }

    setAwsLoading(true)
    setAwsError('')

    try {
      await invoke('set_aws_credentials', {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
        region: awsRegion,
      })

      const result = await invoke<{
        connected: boolean
        region: string
        services: Array<{ name: string; available: boolean }>
      }>('test_aws_connection')

      if (result.connected) {
        setAWSStatus(result)
        setUseAWSConnection(true)
        saveCredentials({
          accessKeyId: awsAccessKeyId,
          secretAccessKey: awsSecretAccessKey,
          region: awsRegion,
          useAWS: true,
        })
        // 로그인 성공 시 입력 필드 초기화
        setAwsAccessKeyId('')
        setAwsSecretAccessKey('')
      } else {
        setAwsError('AWS 연결 실패. 자격 증명을 확인하세요.')
        await invoke('clear_aws_credentials')
      }
    } catch (error) {
      setAwsError(`연결 오류: ${error}`)
    } finally {
      setAwsLoading(false)
    }
  }

  // AWS 로그아웃 핸들러
  const handleAWSLogout = async () => {
    try {
      await invoke('clear_aws_credentials')
      setAWSStatus(null as any)
      setUseAWSConnection(false)
      clearSavedCredentials()
    } catch (error) {
      console.error('AWS logout failed:', error)
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
          color: 'white',
          minHeight: 500,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Psychology sx={{ color: '#10b981' }} />
        AI 모델 설정
        <Chip
          label={aiModelConfig.provider.toUpperCase()}
          size="small"
          sx={{ ml: 'auto', background: '#10b981', color: 'white' }}
        />
      </DialogTitle>

      <DialogContent>
        <Alert severity="info" sx={{ mb: 2, bgcolor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          워크플로우에서 사용할 AI 모델을 설정합니다. 원하는 프로바이더를 선택하고 API 키를 입력하세요.
        </Alert>

        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'rgba(255,255,255,0.1)',
            '& .MuiTab-root': { color: 'grey.500', minWidth: 'auto', px: 2 },
            '& .Mui-selected': { color: '#10b981' },
            '& .MuiTabs-indicator': { backgroundColor: '#10b981' },
          }}
        >
          <Tab label="OpenAI" />
          <Tab label="Anthropic" />
          <Tab label="Google AI" />
          <Tab label="AWS Bedrock" />
          <Tab label="Azure" />
          <Tab label="Ollama" />
        </Tabs>

        {/* OpenAI - Tab 0 */}
        <TabPanel value={tabValue} index={0}>
          <TextField
            fullWidth
            label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={aiModelConfig.openaiApiKey}
            onChange={(e) => setAIModelConfig({ openaiApiKey: e.target.value })}
            sx={{ mb: 2 }}
            placeholder="sk-..."
            InputProps={{
              sx: { color: 'white' },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowApiKey(!showApiKey)} edge="end" sx={{ color: 'grey.500' }}>
                    {showApiKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: 'grey.400' }}>모델</InputLabel>
            <Select
              value={aiModelConfig.openaiModel}
              onChange={(e) => setAIModelConfig({ openaiModel: e.target.value })}
              label="모델"
              sx={{
                color: 'white',
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              }}
            >
              {OPENAI_MODELS.map((model) => (
                <MenuItem key={model.id} value={model.id}>{model.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Base URL (선택)"
            value={aiModelConfig.openaiBaseUrl}
            onChange={(e) => setAIModelConfig({ openaiBaseUrl: e.target.value })}
            sx={{ mb: 2 }}
            placeholder="https://api.openai.com/v1"
            helperText="OpenAI 호환 API 사용 시 변경"
            InputProps={{ sx: { color: 'white' } }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
            FormHelperTextProps={{ sx: { color: 'grey.500' } }}
          />
        </TabPanel>

        {/* Anthropic - Tab 1 */}
        <TabPanel value={tabValue} index={1}>
          <TextField
            fullWidth
            label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={aiModelConfig.anthropicApiKey}
            onChange={(e) => setAIModelConfig({ anthropicApiKey: e.target.value })}
            sx={{ mb: 2 }}
            placeholder="sk-ant-..."
            InputProps={{
              sx: { color: 'white' },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowApiKey(!showApiKey)} edge="end" sx={{ color: 'grey.500' }}>
                    {showApiKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: 'grey.400' }}>모델</InputLabel>
            <Select
              value={aiModelConfig.anthropicModel}
              onChange={(e) => setAIModelConfig({ anthropicModel: e.target.value })}
              label="모델"
              sx={{
                color: 'white',
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              }}
            >
              {ANTHROPIC_MODELS.map((model) => (
                <MenuItem key={model.id} value={model.id}>{model.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </TabPanel>

        {/* Google AI (Gemini) - Tab 2 */}
        <TabPanel value={tabValue} index={2}>
          <TextField
            fullWidth
            label="Google AI API Key"
            type={showApiKey ? 'text' : 'password'}
            value={aiModelConfig.googleApiKey}
            onChange={(e) => setAIModelConfig({ googleApiKey: e.target.value })}
            sx={{ mb: 2 }}
            placeholder="AIza..."
            InputProps={{
              sx: { color: 'white' },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowApiKey(!showApiKey)} edge="end" sx={{ color: 'grey.500' }}>
                    {showApiKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: 'grey.400' }}>모델</InputLabel>
            <Select
              value={aiModelConfig.googleModel}
              onChange={(e) => setAIModelConfig({ googleModel: e.target.value })}
              label="모델"
              sx={{
                color: 'white',
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              }}
            >
              {GOOGLE_MODELS.map((model) => (
                <MenuItem key={model.id} value={model.id}>{model.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </TabPanel>

        {/* AWS Bedrock - Tab 3 */}
        <TabPanel value={tabValue} index={3}>
          {/* AWS 연결 상태 표시 */}
          {awsStatus?.connected ? (
            <>
              {/* 연결됨 상태 */}
              <Alert
                severity="success"
                icon={<CloudDone />}
                sx={{
                  mb: 2,
                  bgcolor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  '& .MuiAlert-icon': { color: '#22c55e' },
                }}
                action={
                  <Button
                    size="small"
                    onClick={handleAWSLogout}
                    sx={{ color: '#f87171' }}
                  >
                    연결 해제
                  </Button>
                }
              >
                <Typography variant="body2" color="white">
                  AWS Bedrock 연결됨 ({awsStatus.region})
                </Typography>
              </Alert>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel sx={{ color: 'grey.400' }}>Bedrock 모델</InputLabel>
                <Select
                  value={aiModelConfig.bedrockModel}
                  onChange={(e) => setAIModelConfig({ bedrockModel: e.target.value })}
                  label="Bedrock 모델"
                  sx={{
                    color: 'white',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                  }}
                >
                  {BEDROCK_MODELS.map((model) => (
                    <MenuItem key={model.id} value={model.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {model.name}
                        <Chip label={model.provider} size="small" sx={{ fontSize: '0.7rem' }} />
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          ) : (
            <>
              {/* 연결 안됨 - 로그인 폼 표시 */}
              <Alert
                severity="warning"
                icon={<CloudOff />}
                sx={{
                  mb: 2,
                  bgcolor: 'rgba(255, 153, 0, 0.1)',
                  border: '1px solid rgba(255, 153, 0, 0.3)',
                  '& .MuiAlert-icon': { color: '#ff9900' },
                }}
              >
                AWS Bedrock을 사용하려면 AWS 자격 증명으로 로그인하세요.
              </Alert>

              {awsError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {awsError}
                </Alert>
              )}

              <TextField
                fullWidth
                label="AWS Access Key ID"
                value={awsAccessKeyId}
                onChange={(e) => setAwsAccessKeyId(e.target.value)}
                sx={{ mb: 2 }}
                placeholder="AKIA..."
                InputProps={{ sx: { color: 'white' } }}
                InputLabelProps={{ sx: { color: 'grey.400' } }}
                disabled={awsLoading}
              />

              <TextField
                fullWidth
                label="AWS Secret Access Key"
                type={showApiKey ? 'text' : 'password'}
                value={awsSecretAccessKey}
                onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                  sx: { color: 'white' },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowApiKey(!showApiKey)} edge="end" sx={{ color: 'grey.500' }}>
                        {showApiKey ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                InputLabelProps={{ sx: { color: 'grey.400' } }}
                disabled={awsLoading}
              />

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel sx={{ color: 'grey.400' }}>AWS Region</InputLabel>
                <Select
                  value={awsRegion}
                  onChange={(e) => setAwsRegion(e.target.value)}
                  label="AWS Region"
                  sx={{
                    color: 'white',
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                  }}
                  disabled={awsLoading}
                >
                  {AWS_REGIONS.map((region) => (
                    <MenuItem key={region.value} value={region.value}>
                      {region.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                fullWidth
                variant="contained"
                onClick={handleAWSLogin}
                disabled={awsLoading}
                startIcon={awsLoading ? <CircularProgress size={16} /> : <LinkIcon />}
                sx={{
                  py: 1.5,
                  background: 'linear-gradient(135deg, #ff9900 0%, #ff6600 100%)',
                  '&:hover': { background: 'linear-gradient(135deg, #ff6600 0%, #cc5500 100%)' },
                  '&:disabled': { background: 'rgba(255,255,255,0.1)' },
                }}
              >
                {awsLoading ? 'AWS 연결 중...' : 'AWS Bedrock 연결'}
              </Button>
            </>
          )}
        </TabPanel>

        {/* Azure OpenAI - Tab 4 */}
        <TabPanel value={tabValue} index={4}>
          <TextField
            fullWidth
            label="Azure Endpoint"
            value={aiModelConfig.azureEndpoint}
            onChange={(e) => setAIModelConfig({ azureEndpoint: e.target.value })}
            sx={{ mb: 2 }}
            placeholder="https://your-resource.openai.azure.com"
            InputProps={{ sx: { color: 'white' } }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
          <TextField
            fullWidth
            label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={aiModelConfig.azureApiKey}
            onChange={(e) => setAIModelConfig({ azureApiKey: e.target.value })}
            sx={{ mb: 2 }}
            InputProps={{
              sx: { color: 'white' },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowApiKey(!showApiKey)} edge="end" sx={{ color: 'grey.500' }}>
                    {showApiKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
          <TextField
            fullWidth
            label="Deployment Name"
            value={aiModelConfig.azureDeployment}
            onChange={(e) => setAIModelConfig({ azureDeployment: e.target.value })}
            sx={{ mb: 2 }}
            placeholder="gpt-4o"
            InputProps={{ sx: { color: 'white' } }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
        </TabPanel>

        {/* Ollama (Local LLM) - Tab 5 */}
        <TabPanel value={tabValue} index={5}>
          <Typography variant="body2" color="grey.400" sx={{ mb: 2 }}>
            Ollama를 사용하면 로컬에서 오픈소스 LLM을 실행할 수 있습니다. 먼저 Ollama를 설치하고 모델을 다운로드하세요.
          </Typography>
          <TextField
            fullWidth
            label="Ollama Base URL"
            value={aiModelConfig.ollamaBaseUrl}
            onChange={(e) => setAIModelConfig({ ollamaBaseUrl: e.target.value })}
            sx={{ mb: 2 }}
            placeholder="http://localhost:11434"
            InputProps={{ sx: { color: 'white' } }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: 'grey.400' }}>모델</InputLabel>
            <Select
              value={aiModelConfig.ollamaModel}
              onChange={(e) => setAIModelConfig({ ollamaModel: e.target.value })}
              label="모델"
              sx={{
                color: 'white',
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              }}
            >
              {OLLAMA_MODELS.map((model) => (
                <MenuItem key={model.id} value={model.id}>{model.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </TabPanel>

        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* 공통 설정 */}
        <Typography variant="subtitle2" sx={{ mb: 2, color: 'grey.300' }}>
          공통 설정
        </Typography>

        <Box sx={{ px: 1 }}>
          <Typography variant="body2" color="grey.400" sx={{ mb: 1 }}>
            Temperature: {aiModelConfig.temperature}
          </Typography>
          <Slider
            value={aiModelConfig.temperature}
            onChange={(_, value) => setAIModelConfig({ temperature: value as number })}
            min={0}
            max={2}
            step={0.1}
            sx={{
              color: '#10b981',
              mb: 3,
            }}
          />

          <Typography variant="body2" color="grey.400" sx={{ mb: 1 }}>
            Max Tokens: {aiModelConfig.maxTokens}
          </Typography>
          <Slider
            value={aiModelConfig.maxTokens}
            onChange={(_, value) => setAIModelConfig({ maxTokens: value as number })}
            min={256}
            max={128000}
            step={256}
            sx={{
              color: '#10b981',
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ color: 'grey.400' }}>
          닫기
        </Button>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{ background: '#10b981', '&:hover': { background: '#059669' } }}
        >
          저장
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// 메모이제이션으로 불필요한 리렌더링 방지
const AISettingsDialog = memo(AISettingsDialogContent)
export default AISettingsDialog
